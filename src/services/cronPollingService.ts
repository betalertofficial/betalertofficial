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
  oddsData: OddsSnapshot[]
): Promise<{ id: string; event_id: string }[]> {
  if (oddsData.length === 0) {
    return [];
  }

  console.log(`[CronPoll] Storing ${oddsData.length} odds snapshots...`);

  const snapshots = oddsData.map((odds) => ({
    sport: odds.sport,
    event_id: odds.event_id,
    team_or_player: odds.team_or_player,
    bookmaker: odds.bookmaker,
    bet_type: odds.bet_type,
    odds_value: odds.odds_value,
    event_data: odds.event_data,
    snapshot_at: new Date().toISOString(),
  }));

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
 * SCHEDULE-AWARE OPTIMIZATION:
 * 1. Updates event statuses (scheduled → live → completed)
 * 2. Queries for leagues with live events (uses league_key format)
 * 3. Only fetches odds for leagues with active games
 * 4. Skips Odds API entirely if no live events
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

    // Step 2: Get sports with live events (returns league_keys like "basketball_nba")
    const activeSports = await getActiveSports(supabase);
    
    if (activeSports.length === 0) {
      console.log("[CronPoll] No live events found - skipping Odds API");
      const durationMs = Date.now() - startTime;
      
      // Create evaluation run showing skip
      const { data: evalRun } = await supabase
        .from("evaluation_runs")
        .insert({
          status: "completed",
          triggers_checked: 0,
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
        triggersChecked: 0,
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

    // Count total live events
    const { count: liveEventsCount } = await supabase
      .from("event_schedules")
      .select("*", { count: "exact", head: true })
      .eq("status", "live");

    console.log(`[CronPoll] Total live events: ${liveEventsCount}`);

    // Step 3: Create evaluation run
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

    // Step 4: Fetch active triggers
    const { data: triggers, error: triggersError } = await supabase
      .from("triggers")
      .select("*")
      .eq("status", "active");

    if (triggersError) {
      throw new Error(`Failed to fetch triggers: ${triggersError.message}`);
    }

    if (!triggers || triggers.length === 0) {
      console.log("[CronPoll] No active triggers found");
      await supabase
        .from("evaluation_runs")
        .update({ status: "completed", triggers_checked: 0 })
        .eq("id", evalRun.id);

      return {
        success: true,
        evaluationRunId: evalRun.id,
        triggersChecked: 0,
        matchesFound: 0,
        alertsCreated: 0,
        webhooksSent: 0,
        durationMs: Date.now() - startTime,
      };
    }

    console.log(`[CronPoll] Loaded ${triggers.length} active triggers`);

    // Step 5: Fetch odds ONLY for sports with live events
    // activeSports now contains league_keys (e.g., "basketball_nba")
    const allOdds = await fetchLiveOddsForSports(oddsApiKey, activeSports);
    console.log(`[CronPoll] Total live odds collected: ${allOdds.length}`);

    // Step 6: Store odds snapshots and get IDs
    const storedSnapshots = await storeOddsSnapshots(supabase, allOdds);

    // Create lookup map: event_id + team + bookmaker + bet_type -> snapshot_id
    const snapshotMap = new Map<string, string>();
    storedSnapshots.forEach((snapshot, index) => {
      const odds = allOdds[index];
      const key = `${odds.event_id}|${odds.team_or_player}|${odds.bookmaker}|${odds.bet_type}`;
      snapshotMap.set(key, snapshot.id);
    });

    // Step 7: Load existing matches for recurring triggers
    const recurringTriggerIds = triggers
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

    // Step 8: Find matches using matching engine
    const allMatches = findMatches(triggers, allOdds, existingMatchMap);
    const uniqueMatches = deduplicateMatches(allMatches);
    
    console.log(`[CronPoll] Found ${uniqueMatches.length} unique matches`);

    // Step 9: Create trigger_matches and alerts
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

        // Fetch ESPN game data
        const oddsSnapshot = allOdds.find(o => 
          o.event_id === match.eventId && 
          o.team_or_player === match.teamOrPlayer &&
          o.bookmaker === match.bookmaker &&
          o.bet_type === match.betType
        );

        let espnData = null;
        if (oddsSnapshot?.event_data) {
          const eventData = oddsSnapshot.event_data;
          console.log(`[CronPoll] Fetching ESPN data for: ${eventData.away_team} @ ${eventData.home_team} (${match.sport})`);
          
          espnData = await espnService.findGameScore(
            match.sport,
            eventData.home_team,
            eventData.away_team
          );
          
          if (espnData.found) {
            console.log(`[CronPoll] ESPN data found: ${espnService.formatScore(espnData)}`);
          } else {
            console.log(`[CronPoll] ESPN data not found for this game`);
          }
        }

        // Create alert with profile_id and ESPN game data
        const { data: alert, error: alertError } = await supabase
          .from("alerts")
          .insert({
            trigger_match_id: triggerMatch.id,
            profile_id: profileTrigger.profile_id,
            message: `${match.teamOrPlayer} ${match.betType} hit! ${match.bookmaker}: ${formatOdds(match.oddsValue)}`,
            // ESPN game data fields
            game_status: espnData?.state || null,
            game_detail: espnData?.detail || null,
            home_team: espnData?.homeTeam || null,
            away_team: espnData?.awayTeam || null,
            home_score: espnData?.homeScore || null,
            away_score: espnData?.awayScore || null,
            period: espnData?.period || null,
            clock: espnData?.clock || null,
            score_summary: espnData?.found ? espnService.formatScore(espnData) : null,
          })
          .select()
          .single();

        if (alertError) {
          console.error(`[CronPoll] Failed to create alert:`, alertError);
          continue;
        }

        alertsCreated++;
        console.log(`[CronPoll] Created alert for trigger ${match.triggerId}: ${match.eventDetails} @ ${match.oddsValue}`);

        // Send webhook if URL is configured
        if (webhookUrl) {
          try {
            await fetch(webhookUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                trigger_id: match.triggerId,
                alert_id: alert.id,
                event: match.eventDetails,
                sport: match.sport,
                odds: match.oddsValue,
                bookmaker: match.bookmaker,
              }),
            });
            webhooksSent++;
          } catch (webhookError) {
            console.error("[CronPoll] Webhook failed:", webhookError);
          }
        }
      } catch (error) {
        console.error("[CronPoll] Error processing match:", error);
      }
    }

    // Step 10: Update evaluation run
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
      liveEventsCount: liveEventsCount || 0,
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