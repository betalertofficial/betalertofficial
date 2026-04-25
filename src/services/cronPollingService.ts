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
 * Main cron polling function - schedule-aware trigger evaluation
 */
export async function runCronPoll(
  supabase: SupabaseClient<Database>,
  oddsApiKey: string,
  webhookUrl: string
): Promise<CronPollResult> {
  const startTime = Date.now();
  console.log("[CronPoll] Starting schedule-aware poll");

  try {
    // Step 1: Update event statuses based on commence_time
    console.log("[CronPoll] Updating event statuses...");
    const markedLive = await markEventsAsLive(supabase);
    const markedCompleted = await markEventsAsCompleted(supabase);
    console.log(`[CronPoll] Status updates: ${markedLive} → live, ${markedCompleted} → completed`);

    // Step 2: Get sports with live events
    const activeSports = await getActiveSports(supabase);
    
    if (activeSports.length === 0) {
      console.log("[CronPoll] ✅ No live events - skipping Odds API (saving API calls)");
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

    // Step 4: Fetch odds ONLY for sports with live events
    const allOdds = await fetchLiveOddsForSports(oddsApiKey, activeSports);

    if (allOdds.length === 0) {
      console.log("[CronPoll] No live odds data returned");
      await supabase
        .from("evaluation_runs")
        .update({ 
          status: "completed",
          triggers_checked: 0,
          matches_found: 0,
          alerts_created: 0,
          duration_ms: Date.now() - startTime,
        })
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

    // Step 5: Store odds snapshots
    await storeOddsSnapshots(supabase, allOdds);

    // Step 6: Complete evaluation run (trigger matching will be handled separately)
    const durationMs = Date.now() - startTime;
    await supabase
      .from("evaluation_runs")
      .update({
        status: "completed",
        triggers_checked: 0, // Will be updated when trigger matching is implemented
        matches_found: 0,
        alerts_created: 0,
        duration_ms: durationMs,
      })
      .eq("id", evalRun.id);

    console.log(`[CronPoll] ✅ Completed: ${allOdds.length} odds stored (${durationMs}ms)`);

    return {
      success: true,
      evaluationRunId: evalRun.id,
      triggersChecked: 0,
      matchesFound: 0,
      alertsCreated: 0,
      webhooksSent: 0,
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