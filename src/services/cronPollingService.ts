/**
 * Cron Polling Service - Main orchestrator for trigger evaluation
 * 
 * SCHEDULE-AWARE OPTIMIZATION:
 * - Checks event_schedules before fetching odds
 * - Only polls leagues with live events
 * - Skips Odds API entirely when no games are happening
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/integrations/supabase/types";
import { getActiveSports, markEventsAsLive, markEventsAsCompleted } from "./scheduleService";
import { findMatches, deduplicateMatches } from "./matchingEngine";
import { espnService } from "./espnService";
import { alertService } from "./alertService";

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
      
      const response = await fetch(
        `https://api.the-odds-api.com/v4/sports/${sport}/odds?apiKey=${oddsApiKey}&regions=us&markets=h2h,spreads,totals&bookmakers=fanduel,draftkings&oddsFormat=american`
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

        const eventData = {
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
          
          for (const market of bookmaker.markets || []) {
            for (const outcome of market.outcomes || []) {
              allOdds.push({
                sport,
                event_id: event.id,
                team_or_player: outcome.name,
                bookmaker: normalizedBookmaker,
                bet_type: market.key,
                odds_value: outcome.price,
                event_data: eventData,
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
 * Main cron polling function - runs scheduled trigger evaluation
 * 
 * SCHEDULE-AWARE OPTIMIZATION WITH TIME PERIOD VALIDATION:
 * 1. Load active triggers and identify those with time period constraints
 * 2. Query event_schedules for live events matching trigger sports
 * 3. Fetch ESPN data for games with active triggers to validate periods
 * 4. Filter triggers to only those that pass time period validation
 * 5. Fetch odds and evaluate only validated triggers
 */
export async function runCronPoll(
  supabase: SupabaseClient<Database>,
  oddsApiKey: string,
  webhookUrl: string
): Promise<CronPollResult> {
  const startTime = Date.now();
  console.log("[CronPoll] Starting scheduled poll");

  try {
    // Step 1: Update event statuses based on commence_time
    console.log("[CronPoll] Updating event statuses...");
    const markedLive = await markEventsAsLive(supabase);
    const markedCompleted = await markEventsAsCompleted(supabase);
    console.log(`[CronPoll] Status updates: ${markedLive} → live, ${markedCompleted} → completed`);

    // Step 2: Fetch active triggers first
    const { data: triggers, error: triggersError } = await supabase
      .from("triggers")
      .select("*")
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
          triggers_checked: 0,
          matches_found: 0,
          alerts_created: 0,
          duration_ms: durationMs,
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

    // Step 3: Get sports with live events
    const activeSports = await getActiveSports(supabase);
    
    if (activeSports.length === 0) {
      console.log("[CronPoll] No live events found - skipping polling");
      const durationMs = Date.now() - startTime;
      
      const { data: evalRun } = await supabase
        .from("evaluation_runs")
        .insert({
          status: "completed",
          triggers_checked: triggers.length,
          matches_found: 0,
          alerts_created: 0,
          duration_ms: durationMs,
          error_message: "No live events - skipped polling",
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
        skippedReason: "No live events",
        liveEventsCount: 0,
        activeSports: [],
      };
    }

    console.log(`[CronPoll] Found ${activeSports.length} sports with live events:`, activeSports);

    // Step 4: Filter triggers with time period constraints that need validation
    const triggersWithTimePeriod = triggers.filter(t => 
      t.time_period_type && t.time_period_min !== null
    );

    console.log(`[CronPoll] ${triggersWithTimePeriod.length} triggers have time period constraints`);

    // Step 5: Get live events for sports with time-period triggers
    const sportsNeedingValidation = [...new Set(triggersWithTimePeriod.map(t => t.sport))];
    // Maps event_id → actual current period number and period type from ESPN.
    // Keyed per-event (not per-trigger) so Step 8 can independently check each
    // trigger's own time_period_min rather than sharing a single validated set.
    const eventPeriods = new Map<string, number>(); // event_id → current period (1-based)
    const eventPeriodTypes = new Map<string, string>(); // event_id → "quarter" | "inning" | "period" | "half"
    const espnDataCache = new Map<string, any>(); // Cache ESPN data by event_id

    if (sportsNeedingValidation.length > 0) {
      console.log(`[CronPoll] Validating time periods for ${sportsNeedingValidation.length} sports...`);

      // Query live events for these sports
      const { data: liveEvents } = await supabase
        .from("event_schedules")
        .select("*")
        .eq("status", "live")
        .in("league_key", sportsNeedingValidation);

      console.log(`[CronPoll] Found ${liveEvents?.length || 0} live events to validate`);

      // For each live event, fetch ESPN data and validate time periods
      for (const event of liveEvents || []) {
        try {
          console.log(`[CronPoll] Checking ESPN for: ${event.away_team} @ ${event.home_team}`);
          
          const espnData = await espnService.findGameScore(
            event.league_key,
            event.home_team,
            event.away_team
          );

          if (!espnData.found) {
            console.log(`[CronPoll] ESPN data not found for event ${event.event_id}`);
            continue;
          }

          // Cache ESPN data IMMEDIATELY for this event (before validation)
          // This ensures scores_data is stored even if period parsing fails
          espnDataCache.set(event.event_id, espnData);
          
          console.log(`[CronPoll] ESPN data for ${event.event_id}:`, {
            state: espnData.state,
            detail: espnData.detail,
            period: espnData.period,
            homeTeam: espnData.homeTeam,
            awayTeam: espnData.awayTeam,
            homeScore: espnData.homeScore,
            awayScore: espnData.awayScore,
          });

          // Extract period info from ESPN data
          let currentPeriod: number | null = null;
          let currentPeriodType: string | null = null;

          // Use the period field directly from ESPN
          if (espnData.period !== undefined && espnData.period !== null) {
            currentPeriod = espnData.period;
            
            // Infer period type from sport/league (don't parse detail string)
            const sport = event.league_key.toLowerCase();
            
            if (sport.includes('baseball') || sport.includes('mlb')) {
              currentPeriodType = 'inning';
            } else if (sport.includes('basketball') || sport.includes('nba')) {
              currentPeriodType = 'quarter';
            } else if (sport.includes('hockey') || sport.includes('nhl')) {
              currentPeriodType = 'period';
            } else if (sport.includes('soccer') || sport.includes('football')) {
              currentPeriodType = 'half';
            }
          }

          if (currentPeriod === null || !currentPeriodType) {
            console.log(`[CronPoll] ⚠️ Could not extract period data. Period: ${espnData.period}, Detail: "${espnData.detail}", Sport: ${event.league_key}`);
            continue;
          }

          console.log(`[CronPoll] 📊 Parsed game state: ${currentPeriodType} ${currentPeriod}`);

          // Store period data for this event so Step 8 can independently evaluate
          // each trigger's own time_period_min against the actual period.
          // Previously a shared validatedEventIds Set caused cross-trigger contamination:
          // if trigger A (min=2) validated the event, trigger B (min=3) would also pass.
          eventPeriods.set(event.event_id, currentPeriod);
          eventPeriodTypes.set(event.event_id, currentPeriodType);
          console.log(`[CronPoll] ✅ Stored period data for event ${event.event_id}: ${currentPeriodType} ${currentPeriod}`);
        } catch (error) {
          console.error(`[CronPoll] Error validating event ${event.event_id}:`, error);
        }
      }

      console.log(`[CronPoll] ${eventPeriods.size} events have ESPN period data`);
      console.log(`[CronPoll] Event periods:`, Object.fromEntries(
        [...eventPeriods.entries()].map(([id, p]) => [id, `${eventPeriodTypes.get(id)} ${p}`])
      ));
    }

    // Step 6: Create evaluation run
    const { data: evalRun, error: evalError } = await supabase
      .from("evaluation_runs")
      .insert({
        status: "running",
      })
      .select()
      .single();

    if (evalError || !evalRun) {
      throw new Error(`Failed to create evaluation run: ${evalError?.message}`);
    }

    console.log(`[CronPoll] Created evaluation run: ${evalRun.id}`);

    // Step 7: Fetch odds ONLY for sports with live events
    const allOdds = await fetchLiveOddsForSports(oddsApiKey, activeSports);
    console.log(`[CronPoll] Total live odds collected: ${allOdds.length}`);

    // Step 8: Filter triggers based on time period validation
    // Remove triggers that have time period constraints but their events didn't pass validation
    const validTriggers = triggers.filter(trigger => {
      // If trigger has no time period constraint, it's always valid
      if (!trigger.time_period_type || trigger.time_period_min === null) {
        console.log(`[CronPoll] Trigger ${trigger.id} has no time period constraint - VALID`);
        return true;
      }

      console.log(`[CronPoll] Validating trigger ${trigger.id} (${trigger.team_or_player}, ${trigger.time_period_type} >= ${trigger.time_period_min})...`);

      // Check if any odds for this trigger come from an event whose current period
      // meets THIS trigger's own time_period_min. Each trigger is evaluated
      // independently so a looser trigger (min=2) cannot validate a stricter one (min=3).
      const hasValidatedOdds = allOdds.some(odds => {
        const teamMatch =
          odds.team_or_player.toLowerCase().includes(trigger.team_or_player.toLowerCase()) ||
          trigger.team_or_player.toLowerCase().includes(odds.team_or_player.toLowerCase());

        if (!teamMatch) return false;

        const eventPeriod = eventPeriods.get(odds.event_id);
        const eventPeriodType = eventPeriodTypes.get(odds.event_id);

        console.log(`[CronPoll]   - Found odds for ${odds.team_or_player} on event ${odds.event_id}`);
        console.log(`[CronPoll]   - Event period: ${eventPeriodType} ${eventPeriod ?? "unknown"}, trigger needs: ${trigger.time_period_type} >= ${trigger.time_period_min}`);

        if (eventPeriod === undefined || eventPeriodType === undefined) {
          console.log(`[CronPoll]   - No ESPN period data for this event → failing validation`);
          return false;
        }
        if (eventPeriodType !== trigger.time_period_type) {
          console.log(`[CronPoll]   - Period type mismatch: ${eventPeriodType} != ${trigger.time_period_type}`);
          return false;
        }
        const passes = eventPeriod >= (trigger.time_period_min || 0);
        console.log(`[CronPoll]   - Period check: ${eventPeriod} >= ${trigger.time_period_min} → ${passes}`);
        return passes;
      });

      if (!hasValidatedOdds) {
        console.log(`[CronPoll] Filtering out trigger ${trigger.id} - no validated events`);
      } else {
        console.log(`[CronPoll] Trigger ${trigger.id} has validated odds - VALID`);
      }

      return hasValidatedOdds;
    });

    console.log(`[CronPoll] ${validTriggers.length}/${triggers.length} triggers remain after time period filtering`);
    console.log(`[CronPoll] Valid trigger IDs:`, validTriggers.map(t => t.id));

    // Step 8b: Attach each user's preferred sportsbook (profiles.preferred_sportsbook)
    // so the matching engine can filter odds per-user. Batch-fetch via the
    // profile_triggers join table. A trigger may have multiple profile_triggers
    // rows; we use the first/any. Defaults to "best" (no book filter) when missing.
    const validTriggerIds = validTriggers.map(t => t.id);
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
      (trigger as any).preferredSportsbook =
        preferredBookByTrigger.get(trigger.id) || "best";
    }

    if (validTriggers.length === 0) {
      console.log("[CronPoll] No valid triggers after time period filtering");
      const durationMs = Date.now() - startTime;
      
      await supabase
        .from("evaluation_runs")
        .update({
          status: "completed",
          triggers_checked: triggers.length,
          matches_found: 0,
          alerts_created: 0,
          duration_ms: durationMs,
          error_message: "No triggers passed time period validation",
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
      };
    }

    // Step 9: Store odds snapshots and get IDs
    const storedSnapshots = await storeOddsSnapshots(supabase, allOdds, espnDataCache);

    // Create lookup map: event_id + team + bookmaker + bet_type -> snapshot_id
    const snapshotMap = new Map<string, string>();
    storedSnapshots.forEach((snapshot, index) => {
      const odds = allOdds[index];
      const key = `${odds.event_id}|${odds.team_or_player}|${odds.bookmaker}|${odds.bet_type}`;
      snapshotMap.set(key, snapshot.id);
    });

    // Step 10: Load existing matches for recurring triggers
    const recurringTriggerIds = validTriggers
      .filter(t => t.frequency === "recurring")
      .map(t => t.id);

    const { data: existingMatches } = await supabase
      .from("trigger_matches")
      .select("trigger_id, odds_snapshot_id, odds_snapshots(event_id)")
      .in("trigger_id", recurringTriggerIds);

    const existingMatchMap = new Map<string, Set<string>>();
    existingMatches?.forEach(match => {
      const eventId = (match.odds_snapshots as any)?.event_id;
      if (eventId) {
        if (!existingMatchMap.has(match.trigger_id)) {
          existingMatchMap.set(match.trigger_id, new Set());
        }
        existingMatchMap.get(match.trigger_id)?.add(eventId);
      }
    });

    // Step 11: Find matches using matching engine (with validated triggers only)
    const allMatches = findMatches(validTriggers, allOdds, existingMatchMap);
    const uniqueMatches = deduplicateMatches(allMatches);
    
    console.log(`[CronPoll] Found ${uniqueMatches.length} unique matches`);

    // Step 12: Create trigger_matches and send alerts
    let matchesCreated = 0;
    let alertsCreated = 0;
    let webhooksSent = 0;

    for (const match of uniqueMatches) {
      try {
        // Find the snapshot ID for this match
        const snapshotKey = `${match.eventId}|${match.teamOrPlayer}|${match.bookmaker}|${match.betType}`;
        const snapshotId = snapshotMap.get(snapshotKey);

        if (!snapshotId) {
          console.warn(`[CronPoll] No snapshot ID found for match: ${snapshotKey}`);
          continue;
        }

        // Get profile_id for this trigger from profile_triggers junction table
        const { data: profileTrigger, error: profileError } = await supabase
          .from("profile_triggers")
          .select("profile_id")
          .eq("trigger_id", match.triggerId)
          .single();

        if (profileError || !profileTrigger) {
          console.error(`[CronPoll] No profile found for trigger ${match.triggerId}:`, profileError);
          continue;
        }

        // Create trigger_match
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

        matchesCreated++;

        // If this is a "once" trigger, mark it as completed
        if (match.frequency === "once") {
          const { error: updateError } = await supabase
            .from("triggers")
            .update({ status: "completed" })
            .eq("id", match.triggerId);
          
          if (updateError) {
            console.error(`[CronPoll] Failed to mark trigger ${match.triggerId} as completed:`, updateError);
          } else {
            console.log(`[CronPoll] Marked trigger ${match.triggerId} as completed (frequency=once)`);
          }
        }

        // Get trigger and snapshot data for alert
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

        // Use alertService.sendAlert which routes to Telegram or webhook
        console.log(`[CronPoll] Sending alert via alertService for user ${profileTrigger.profile_id}`);
        const alertSent = await alertService.sendAlert(
          supabase,
          profileTrigger.profile_id,
          triggerData,
          snapshotData,
          triggerMatch.id
        );

        if (alertSent) {
          alertsCreated++;
          webhooksSent++; // Count as webhook even if it went to Telegram
          console.log(`[CronPoll] Alert sent successfully for trigger ${match.triggerId}`);
        } else {
          console.error(`[CronPoll] Failed to send alert for trigger ${match.triggerId}`);
        }
      } catch (error) {
        console.error("[CronPoll] Error processing match:", error);
      }
    }

    // Step 13: Update evaluation run
    const durationMs = Date.now() - startTime;
    await supabase
      .from("evaluation_runs")
      .update({
        status: "completed",
        triggers_checked: triggers.length,
        matches_found: uniqueMatches.length,
        alerts_created: alertsCreated,
        duration_ms: durationMs,
      })
      .eq("id", evalRun.id);

    console.log(`[CronPoll] Completed: ${triggers.length} triggers, ${uniqueMatches.length} matches, ${alertsCreated} alerts, ${webhooksSent} webhooks (${durationMs}ms)`);

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