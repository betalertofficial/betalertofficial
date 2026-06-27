/**
 * Cron Polling Service - Main orchestrator for trigger evaluation
 *
 * DEMAND-DRIVEN, ESPN-FIRST OPTIMIZATION:
 * - Loads active triggers, derives the set of sports they care about
 * - Detects which of those sports have a LIVE game right now from ESPN (free)
 * - Fetches paid Odds API odds ONLY for sports with a live game
 * - Period/inning gating + live scores come from the same ESPN fetch
 *
 * This removes the previous dependency on the once-a-day event_schedules sync
 * (which could be stale and silently hide live games from the poller).
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/integrations/supabase/types";
import { markEventsAsLive, markEventsAsCompleted } from "./scheduleService";
import { findMatches, deduplicateMatches } from "./matchingEngine";
import { espnService } from "./espnService";
import { alertService } from "./alertService";
import { teamNamesMatch } from "@/lib/teamMatch";

type Trigger = Database["public"]["Tables"]["triggers"]["Row"];

interface OddsSnapshot {
  sport: string;
  event_id: string;
  team_or_player: string;
  bookmaker: string;
  bet_type: string;
  odds_value: number;
  event_data?: any;
}

interface CronPollResult {
  success: boolean;
  evaluationRunId?: string;
  triggersChecked: number;
  matchesFound: number;
  alertsCreated: number;
  webhooksSent: number;
  durationMs: number;
  error?: string;
  skippedReason?: string;
  liveEventsCount?: number;
  activeSports?: string[];
}

/**
 * Derive the current period number + type for an event from an ESPN game.
 * Mirrors the trigger time_period_type values: inning / quarter / period / minute.
 */
function derivePeriod(sport: string, espn: any): { period: number | null; type: string | null } {
  const s = (sport || "").toLowerCase();

  if (s.includes("soccer")) {
    // Soccer triggers gate on the live MATCH MINUTE (10/20/30/45/60/75). ESPN
    // exposes it in status.type.detail / displayClock (espn.detail / espn.clock),
    // e.g. "63'" or "45'+2'". Stoppage time floors to the regulation minute.
    const src = `${espn.detail ?? ""} ${espn.clock ?? ""}`;
    const m = src.match(/(\d+)\s*'/) || src.match(/(\d+)/);
    return m ? { period: parseInt(m[1], 10), type: "minute" } : { period: null, type: null };
  }

  if (espn.period === undefined || espn.period === null) return { period: null, type: null };
  if (s.includes("baseball") || s.includes("mlb")) return { period: espn.period, type: "inning" };
  if (s.includes("basketball") || s.includes("nba")) return { period: espn.period, type: "quarter" };
  if (s.includes("hockey") || s.includes("nhl")) return { period: espn.period, type: "period" };
  if (s.includes("americanfootball") || s.includes("nfl")) return { period: espn.period, type: "quarter" };
  return { period: null, type: null };
}

/**
 * Fetch live odds from Odds API for specific sports
 */
async function fetchLiveOddsForSports(
  oddsApiKey: string,
  sports: string[]
): Promise<OddsSnapshot[]> {
  const allOdds: OddsSnapshot[] = [];
  const now = new Date();

  const normalizeBookmaker = (bookmaker: string): string => {
    const mapping: Record<string, string> = {
      'fanduel': 'FanDuel',
      'draftkings': 'DraftKings',
      'betmgm': 'BetMGM',
      'caesars': 'Caesars',
      'pointsbet': 'PointsBet',
    };
    return mapping[bookmaker.toLowerCase()] || bookmaker;
  };

  for (const sport of sports) {
    try {
      console.log(`[CronPoll] Fetching odds for ${sport}...`);

      // includeLinks=true makes DraftKings/FanDuel responses carry deep links:
      //   bookmaker.link → the game/event page on the book
      //   outcome.link   → a DIRECT bet-slip deep link for that exact selection
      // (universal links that open the sportsbook app on mobile). Captured
      // per-row below so each alert can deep-link to its matched book.
      const response = await fetch(
        `https://api.the-odds-api.com/v4/sports/${sport}/odds?apiKey=${oddsApiKey}&regions=us&markets=h2h,spreads,totals&bookmakers=fanduel,draftkings&oddsFormat=american&includeLinks=true`
      );

      if (!response.ok) {
        console.error(`[CronPoll] Odds API error for ${sport}: ${response.statusText}`);
        continue;
      }

      const events = await response.json();
      console.log(`[CronPoll] Received ${events.length} events for ${sport}`);

      for (const event of events) {
        const commenceTime = new Date(event.commence_time);

        // Only include events that have started
        if (commenceTime > now) {
          continue;
        }

        // Shared per-event fields. Per-row link fields (bet_link/event_link)
        // are attached inside the outcome loop below so each snapshot row
        // carries its own correct bet-slip link (it is per outcome/team).
        const baseEventData = {
          id: event.id,
          sport_key: event.sport_key,
          sport_title: event.sport_title,
          commence_time: event.commence_time,
          home_team: event.home_team,
          away_team: event.away_team,
          scores: event.scores || null, // Include scores for period/inning tracking
        };

        for (const bookmaker of event.bookmakers || []) {
          const normalizedBookmaker = normalizeBookmaker(bookmaker.key);
          // bookmaker-level deep link to the event page on this book (fallback).
          const eventLink = bookmaker.link;

          for (const market of bookmaker.markets || []) {
            for (const outcome of market.outcomes || []) {
              allOdds.push({
                sport,
                event_id: event.id,
                team_or_player: outcome.name,
                bookmaker: normalizedBookmaker,
                bet_type: market.key,
                odds_value: outcome.price,
                // Per-row event_data: shared event fields + THIS outcome's
                // bet-slip link + THIS bookmaker's event link, so the alert
                // builder can deep-link straight to the matched selection.
                event_data: {
                  ...baseEventData,
                  bet_link: outcome.link,
                  event_link: eventLink,
                },
              });
            }
          }
        }
      }
    } catch (error) {
      console.error(`[CronPoll] Error fetching odds for ${sport}:`, error);
    }
  }

  console.log(`[CronPoll] Total live odds collected: ${allOdds.length}`);
  return allOdds;
}

/**
 * Store odds snapshots in database
 */
async function storeOddsSnapshots(
  supabase: SupabaseClient<Database>,
  oddsData: OddsSnapshot[],
  espnDataCache: Map<string, any> = new Map()
): Promise<{ id: string; event_id: string }[]> {
  if (oddsData.length === 0) {
    return [];
  }

  console.log(`[CronPoll] Storing ${oddsData.length} odds snapshots...`);

  // Fetch ESPN data for all unique events
  const uniqueEvents = new Map<string, { sport: string; home: string; away: string }>();
  for (const odds of oddsData) {
    if (!uniqueEvents.has(odds.event_id) && odds.event_data) {
      uniqueEvents.set(odds.event_id, {
        sport: odds.sport,
        home: odds.event_data.home_team,
        away: odds.event_data.away_team,
      });
    }
  }

  console.log(`[CronPoll] Fetching ESPN data for ${uniqueEvents.size} unique events...`);

  // Fetch ESPN data for events not already in cache
  for (const [eventId, eventInfo] of uniqueEvents) {
    if (!espnDataCache.has(eventId)) {
      try {
        const espnData = await espnService.findGameScore(
          eventInfo.sport,
          eventInfo.home,
          eventInfo.away
        );

        if (espnData.found) {
          espnDataCache.set(eventId, espnData);
          console.log(`[CronPoll] Fetched ESPN data for ${eventInfo.away} @ ${eventInfo.home}: ${espnData.detail}`);
        }
      } catch (error) {
        console.error(`[CronPoll] Error fetching ESPN data for event ${eventId}:`, error);
      }
    }
  }

  const snapshots = oddsData.map((odds) => {
    // Get ESPN data for this event if available
    const espnData = espnDataCache.get(odds.event_id);

    return {
      sport: odds.sport,
      event_id: odds.event_id,
      team_or_player: odds.team_or_player,
      bookmaker: odds.bookmaker,
      bet_type: odds.bet_type,
      odds_value: odds.odds_value,
      event_data: odds.event_data,
      scores_data: espnData || null, // Store ESPN data for debugging
      snapshot_at: new Date().toISOString(),
    };
  });

  const { data, error } = await supabase
    .from("odds_snapshots")
    .insert(snapshots)
    .select("id, event_id");

  if (error) {
    console.error("[CronPoll] Error storing odds snapshots:", error);
    throw new Error(`Failed to store odds snapshots: ${error.message}`);
  }

  console.log(`[CronPoll] Stored ${data?.length || 0} odds snapshots`);
  return data || [];
}

/**
 * Main cron polling function - demand-driven, ESPN-first trigger evaluation.
 *
 * 1. Load active triggers; derive the set of sports they cover
 * 2. From ESPN (free), find which of those sports have a live game right now
 * 3. Fetch paid Odds API odds ONLY for those live sports
 * 4. Gate time-period triggers against the live inning/period (from ESPN)
 * 5. Match + alert
 */
export async function runCronPoll(
  supabase: SupabaseClient<Database>,
  oddsApiKey: string,
  webhookUrl: string
): Promise<CronPollResult> {
  const startTime = Date.now();
  console.log("[CronPoll] Starting scheduled poll (demand-driven / ESPN-first)");

  try {
    // Keep event_schedules statuses roughly current for the admin UI. These are
    // NO LONGER load-bearing for liveness (we detect live games from ESPN below).
    await markEventsAsLive(supabase);
    await markEventsAsCompleted(supabase);

    // Expire event-bound "once" triggers whose game is well over (~6h past
    // commence), so a "just this game" alert never lingers onto a future game.
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const { error: expireError } = await supabase
      .from("triggers")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("status", "active")
      .eq("frequency", "once")
      .not("event_id", "is", null)
      .lt("event_commence", sixHoursAgo);
    if (expireError) {
      console.error("[CronPoll] Error expiring finished once-triggers:", expireError.message);
    }

    // Step 1: Fetch active triggers that still belong to a user. The !inner
    // embed on profile_triggers excludes ORPHANS — triggers whose owner link was
    // deleted (the trigger row lingers active) — so we never waste a poll on a
    // trigger nobody will ever be alerted for.
    const { data: triggers, error: triggersError } = await supabase
      .from("triggers")
      .select("*, profile_triggers!inner(profile_id)")
      .eq("status", "active");

    if (triggersError) {
      throw new Error(`Failed to fetch triggers: ${triggersError.message}`);
    }

    if (!triggers || triggers.length === 0) {
      console.log("[CronPoll] No active triggers found");
      const durationMs = Date.now() - startTime;
      const { data: evalRun } = await supabase
        .from("evaluation_runs")
        .insert({
          status: "completed",
          triggers_evaluated: 0,
          matches_found: 0,
          alerts_sent: 0,
          duration_ms: durationMs,
          completed_at: new Date().toISOString(),
          error_message: "No active triggers",
        })
        .select()
        .single();

      return {
        success: true,
        evaluationRunId: evalRun?.id,
        triggersChecked: 0,
        matchesFound: 0,
        alertsCreated: 0,
        webhooksSent: 0,
        durationMs,
      };
    }

    console.log(`[CronPoll] Loaded ${triggers.length} active triggers`);

    // Step 2: Demand-driven — which sports do active triggers actually cover?
    const triggerSports = [...new Set(triggers.map((t) => t.sport).filter(Boolean))];
    console.log(`[CronPoll] Triggers cover ${triggerSports.length} sports:`, triggerSports);

    // Step 3: ESPN liveness (free) — only for sports we have triggers on.
    // liveGamesBySport: sportKey → list of in-progress ESPN games (ESPNScore[]).
    const liveGamesBySport = new Map<string, any[]>();
    for (const sport of triggerSports) {
      try {
        const live = await espnService.getLiveGames(sport);
        if (live.length > 0) {
          liveGamesBySport.set(sport, live);
          console.log(`[CronPoll] ${sport}: ${live.length} live game(s) per ESPN`);
        }
      } catch (error) {
        console.error(`[CronPoll] ESPN liveness check failed for ${sport}:`, error);
      }
    }
    const activeSports = [...liveGamesBySport.keys()];

    if (activeSports.length === 0) {
      console.log("[CronPoll] No live games for any sport with triggers - skipping odds");
      const durationMs = Date.now() - startTime;
      const { data: evalRun } = await supabase
        .from("evaluation_runs")
        .insert({
          status: "completed",
          triggers_evaluated: triggers.length,
          matches_found: 0,
          alerts_sent: 0,
          duration_ms: durationMs,
          completed_at: new Date().toISOString(),
          error_message: "No live games for active triggers",
        })
        .select()
        .single();

      return {
        success: true,
        evaluationRunId: evalRun?.id,
        triggersChecked: triggers.length,
        matchesFound: 0,
        alertsCreated: 0,
        webhooksSent: 0,
        durationMs,
        skippedReason: "No live games",
        liveEventsCount: 0,
        activeSports: [],
      };
    }

    console.log(`[CronPoll] ${activeSports.length} sport(s) live:`, activeSports);

    // Step 4: Create evaluation run (running)
    const { data: evalRun, error: evalError } = await supabase
      .from("evaluation_runs")
      .insert({ status: "running" })
      .select()
      .single();

    if (evalError || !evalRun) {
      throw new Error(`Failed to create evaluation run: ${evalError?.message}`);
    }

    // Step 5: Fetch paid odds ONLY for live sports
    const allOdds = await fetchLiveOddsForSports(oddsApiKey, activeSports);

    // Step 6: Map each odds event → ESPN period + scores by team name. The ESPN
    // games came from getLiveGames above (free), so no extra ESPN calls here.
    // eventPeriods/eventPeriodTypes are keyed by the Odds API event_id so Step 7
    // can gate each trigger; espnDataCache feeds scores_data into snapshots.
    const eventPeriods = new Map<string, number>();
    const eventPeriodTypes = new Map<string, string>();
    const espnDataCache = new Map<string, any>();

    const uniqueOddsEvents = new Map<string, { sport: string; home: string; away: string }>();
    for (const o of allOdds) {
      if (o.event_data && !uniqueOddsEvents.has(o.event_id)) {
        uniqueOddsEvents.set(o.event_id, {
          sport: o.sport,
          home: o.event_data.home_team,
          away: o.event_data.away_team,
        });
      }
    }

    for (const [eventId, info] of uniqueOddsEvents) {
      const liveList = liveGamesBySport.get(info.sport) || [];
      const espnGame =
        liveList.find((g) => teamNamesMatch(g.homeTeam, info.home) && teamNamesMatch(g.awayTeam, info.away)) ||
        liveList.find((g) => teamNamesMatch(g.homeTeam, info.home) || teamNamesMatch(g.awayTeam, info.away));
      if (!espnGame) continue;

      espnDataCache.set(eventId, espnGame);
      const { period, type } = derivePeriod(info.sport, espnGame);
      if (period !== null && type) {
        eventPeriods.set(eventId, period);
        eventPeriodTypes.set(eventId, type);
      }
    }
    console.log(`[CronPoll] ${eventPeriods.size} live event(s) have ESPN period data`);

    // Step 7: Filter triggers — event binding (once) + time-period gating.
    const validTriggers = triggers.filter((trigger) => {
      const boundEventId = (trigger as any).event_id as string | null | undefined;

      // No time-period constraint → valid as long as (for event-bound triggers)
      // its specific game is among the live odds.
      if (!trigger.time_period_type || trigger.time_period_min === null) {
        if (boundEventId) {
          return allOdds.some((o) => o.event_id === boundEventId);
        }
        return true;
      }

      // Time-period constraint → require a live event (its own, if bound) whose
      // current period meets THIS trigger's own time_period_min.
      return allOdds.some((odds) => {
        if (boundEventId && odds.event_id !== boundEventId) return false;

        if (!teamNamesMatch(odds.team_or_player, trigger.team_or_player)) return false;

        const eventPeriod = eventPeriods.get(odds.event_id);
        const eventPeriodType = eventPeriodTypes.get(odds.event_id);
        if (eventPeriod === undefined || eventPeriodType === undefined) return false;
        if (eventPeriodType !== trigger.time_period_type) return false;
        return eventPeriod >= (trigger.time_period_min || 0);
      });
    });

    console.log(`[CronPoll] ${validTriggers.length}/${triggers.length} triggers valid after gating`);

    // Step 7b: Attach each user's preferred sportsbook (profiles.preferred_sportsbook)
    // so the matching engine can filter odds per-user. Defaults to "best".
    const validTriggerIds = validTriggers.map((t) => t.id);
    const { data: ptRows } = await supabase
      .from("profile_triggers")
      .select("trigger_id, profiles(preferred_sportsbook)")
      .in("trigger_id", validTriggerIds);

    const preferredBookByTrigger = new Map<string, string>();
    for (const row of ptRows || []) {
      if (!preferredBookByTrigger.has(row.trigger_id)) {
        const pref = (row.profiles as any)?.preferred_sportsbook;
        preferredBookByTrigger.set(row.trigger_id, pref || "best");
      }
    }
    for (const trigger of validTriggers) {
      (trigger as any).preferredSportsbook = preferredBookByTrigger.get(trigger.id) || "best";
    }

    if (validTriggers.length === 0) {
      console.log("[CronPoll] No valid triggers after gating");
      const durationMs = Date.now() - startTime;
      await supabase
        .from("evaluation_runs")
        .update({
          status: "completed",
          triggers_evaluated: triggers.length,
          matches_found: 0,
          alerts_sent: 0,
          duration_ms: durationMs,
          completed_at: new Date().toISOString(),
          error_message: "No triggers passed gating",
        })
        .eq("id", evalRun.id);

      return {
        success: true,
        evaluationRunId: evalRun.id,
        triggersChecked: triggers.length,
        matchesFound: 0,
        alertsCreated: 0,
        webhooksSent: 0,
        durationMs,
        liveEventsCount: eventPeriods.size,
        activeSports,
      };
    }

    // Step 8: Store odds snapshots (reusing the ESPN data fetched above)
    const storedSnapshots = await storeOddsSnapshots(supabase, allOdds, espnDataCache);

    const snapshotMap = new Map<string, string>();
    storedSnapshots.forEach((snapshot, index) => {
      const odds = allOdds[index];
      const key = `${odds.event_id}|${odds.team_or_player}|${odds.bookmaker}|${odds.bet_type}`;
      snapshotMap.set(key, snapshot.id);
    });

    // Step 9: Load existing matches for recurring triggers (dedupe per game)
    const recurringTriggerIds = validTriggers
      .filter((t) => t.frequency === "recurring")
      .map((t) => t.id);

    const { data: existingMatches } = await supabase
      .from("trigger_matches")
      .select("trigger_id, odds_snapshot_id, odds_snapshots(event_id)")
      .in("trigger_id", recurringTriggerIds);

    const existingMatchMap = new Map<string, Set<string>>();
    existingMatches?.forEach((match) => {
      const eventId = (match.odds_snapshots as any)?.event_id;
      if (eventId) {
        if (!existingMatchMap.has(match.trigger_id)) {
          existingMatchMap.set(match.trigger_id, new Set());
        }
        existingMatchMap.get(match.trigger_id)?.add(eventId);
      }
    });

    // Step 10: Find matches (matchingEngine honors per-trigger event_id binding)
    const allMatches = findMatches(validTriggers, allOdds, existingMatchMap);
    const uniqueMatches = deduplicateMatches(allMatches);
    console.log(`[CronPoll] Found ${uniqueMatches.length} unique matches`);

    // Step 11: Create trigger_matches and send alerts
    let alertsCreated = 0;
    let webhooksSent = 0;

    for (const match of uniqueMatches) {
      try {
        const snapshotKey = `${match.eventId}|${match.teamOrPlayer}|${match.bookmaker}|${match.betType}`;
        const snapshotId = snapshotMap.get(snapshotKey);
        if (!snapshotId) {
          console.warn(`[CronPoll] No snapshot ID found for match: ${snapshotKey}`);
          continue;
        }

        const { data: profileTrigger, error: profileError } = await supabase
          .from("profile_triggers")
          .select("profile_id")
          .eq("trigger_id", match.triggerId)
          .single();

        if (profileError || !profileTrigger) {
          console.error(`[CronPoll] No profile found for trigger ${match.triggerId}:`, profileError);
          continue;
        }

        const { data: triggerMatch, error: matchError } = await supabase
          .from("trigger_matches")
          .insert({
            trigger_id: match.triggerId,
            odds_snapshot_id: snapshotId,
            matched_value: match.oddsValue,
            matched_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (matchError) {
          console.error(`[CronPoll] Failed to create trigger match:`, matchError);
          continue;
        }

        // "once" triggers fire one time total, then complete.
        if (match.frequency === "once") {
          const { error: updateError } = await supabase
            .from("triggers")
            .update({ status: "completed" })
            .eq("id", match.triggerId);
          if (updateError) {
            console.error(`[CronPoll] Failed to mark trigger ${match.triggerId} completed:`, updateError);
          }
        }

        const { data: triggerData } = await supabase
          .from("triggers")
          .select("*")
          .eq("id", match.triggerId)
          .single();

        const { data: snapshotData } = await supabase
          .from("odds_snapshots")
          .select("*")
          .eq("id", snapshotId)
          .single();

        if (!triggerData || !snapshotData) {
          console.error(`[CronPoll] Missing trigger or snapshot data for match`);
          continue;
        }

        const alertSent = await alertService.sendAlert(
          supabase,
          profileTrigger.profile_id,
          triggerData,
          snapshotData,
          triggerMatch.id
        );

        if (alertSent) {
          alertsCreated++;
          webhooksSent++;
          console.log(`[CronPoll] Alert sent for trigger ${match.triggerId}`);
        } else {
          console.error(`[CronPoll] Failed to send alert for trigger ${match.triggerId}`);
        }
      } catch (error) {
        console.error("[CronPoll] Error processing match:", error);
      }
    }

    // Step 12: Complete the evaluation run (correct columns)
    const durationMs = Date.now() - startTime;
    await supabase
      .from("evaluation_runs")
      .update({
        status: "completed",
        triggers_evaluated: triggers.length,
        matches_found: uniqueMatches.length,
        alerts_sent: alertsCreated,
        duration_ms: durationMs,
        completed_at: new Date().toISOString(),
      })
      .eq("id", evalRun.id);

    console.log(`[CronPoll] Completed: ${triggers.length} triggers, ${uniqueMatches.length} matches, ${alertsCreated} alerts (${durationMs}ms)`);

    return {
      success: true,
      evaluationRunId: evalRun.id,
      triggersChecked: triggers.length,
      matchesFound: uniqueMatches.length,
      alertsCreated,
      webhooksSent,
      durationMs,
      liveEventsCount: eventPeriods.size,
      activeSports,
    };
  } catch (error) {
    console.error("[CronPoll] Error:", error);
    const durationMs = Date.now() - startTime;
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      triggersChecked: 0,
      matchesFound: 0,
      alertsCreated: 0,
      webhooksSent: 0,
      durationMs,
    };
  }
}

function formatOdds(odds: number): string {
  if (odds >= 0) {
    return `+${odds}`;
  }
  return `${odds}`;
}
