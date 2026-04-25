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
      };
    }

    console.log(`[CronPoll] Found ${activeSports.length} sports with live events:`, activeSports);

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

    // Step 6: Store odds snapshots
    await storeOddsSnapshots(supabase, allOdds);

    // Step 7: Load existing matches for recurring triggers
    const { data: existingAlerts } = await supabase
      .from("alerts")
      .select("trigger_id, event_id")
      .in("trigger_id", triggers.filter(t => t.frequency === "recurring").map(t => t.id));

    const existingMatches = new Map<string, Set<string>>();
    existingAlerts?.forEach(alert => {
      if (!existingMatches.has(alert.trigger_id)) {
        existingMatches.set(alert.trigger_id, new Set());
      }
      existingMatches.get(alert.trigger_id)?.add(alert.event_id);
    });

    // Step 8: Find matches using matching engine
    const allMatches = findMatches(triggers, allOdds, existingMatches);
    const uniqueMatches = deduplicateMatches(allMatches);
    
    console.log(`[CronPoll] Found ${uniqueMatches.length} unique matches`);

    // Step 9: Create alerts and send webhooks
    let alertsCreated = 0;
    let webhooksSent = 0;

    for (const match of uniqueMatches) {
      try {
        const { data: alert, error: alertError } = await supabase
          .from("alerts")
          .insert({
            evaluation_run_id: evalRun.id,
            sport: match.sport,
            home_team: match.eventDetails.split(" ")[0] || "",
            away_team: match.teamOrPlayer,
            triggered_odds: match.oddsValue,
            game_detail: match.eventDetails,
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