/**
 * Cron Polling Service - Main orchestrator for trigger evaluation
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { findMatches, deduplicateMatches, formatAlertMessage, type Match } from "./matchingEngine";

interface OddsSnapshot {
  sport: string;
  event_id: string;
  team_or_player: string;
  bookmaker: string;
  bet_type: string;
  odds_value: number;
}

interface RunCronPollOptions {
  skipPollingCheck?: boolean;
  dryRun?: boolean;
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
}

/**
 * STEP 1: Fetch active triggers and their profile associations
 */
async function fetchActiveTriggers(supabase: SupabaseClient) {
  console.log("[CronPolling] Fetching active triggers...");

  // Fetch active triggers
  const { data: triggers, error: triggersError } = await supabase
    .from("triggers")
    .select("*")
    .eq("status", "active");

  console.log("[CronPolling] DEBUG - Triggers query result:");
  console.log("[CronPolling] DEBUG - Error:", triggersError);
  console.log("[CronPolling] DEBUG - Data:", triggers);
  console.log("[CronPolling] DEBUG - Data length:", triggers?.length || 0);

  if (triggersError) {
    console.error("[CronPolling] Error fetching triggers:", triggersError);
    throw new Error(`Failed to fetch triggers: ${triggersError.message}`);
  }

  // Fetch profile associations
  const { data: profileTriggers, error: profileTriggersError } = await supabase
    .from("profile_triggers")
    .select("profile_id, trigger_id");

  console.log("[CronPolling] DEBUG - Profile triggers query result:");
  console.log("[CronPolling] DEBUG - Error:", profileTriggersError);
  console.log("[CronPolling] DEBUG - Data:", profileTriggers);
  console.log("[CronPolling] DEBUG - Data length:", profileTriggers?.length || 0);

  if (profileTriggersError) {
    console.error("[CronPolling] Error fetching profile_triggers:", profileTriggersError);
    throw new Error(`Failed to fetch profile triggers: ${profileTriggersError.message}`);
  }

  console.log(`[CronPolling] Found ${triggers?.length || 0} active triggers, ${profileTriggers?.length || 0} profile associations`);

  return {
    triggers: triggers || [],
    profileTriggers: profileTriggers || [],
  };
}

/**
 * STEP 2: Fetch live odds from Odds API
 */
async function fetchLiveOdds(apiKey: string, sports: string[]): Promise<OddsSnapshot[]> {
  console.log(`[CronPolling] Fetching live odds for sports: ${sports.join(", ")}`);

  const allOdds: OddsSnapshot[] = [];

  // Bookmaker name normalization: API lowercase -> Database capitalized
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
      console.log(`[CronPolling] Fetching odds for ${sport}...`);
      
      const response = await fetch(
        `https://api.the-odds-api.com/v4/sports/${sport}/odds?apiKey=${apiKey}&regions=us&markets=h2h,spreads,totals&bookmakers=fanduel,draftkings&oddsFormat=american`
      );

      if (!response.ok) {
        console.error(`[CronPolling] Odds API error for ${sport}: ${response.statusText}`);
        continue;
      }

      const events = await response.json();
      console.log(`[CronPolling] Received ${events.length} events for ${sport}`);

      // Parse odds data into normalized format
      for (const event of events) {
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
              });
            }
          }
        }
      }
    } catch (error) {
      console.error(`[CronPolling] Error fetching odds for ${sport}:`, error);
    }
  }

  console.log(`[CronPolling] Total odds fetched: ${allOdds.length}`);
  return allOdds;
}

/**
 * STEP 3: Store odds snapshots in database
 */
async function storeOddsSnapshots(
  supabase: SupabaseClient,
  oddsData: OddsSnapshot[]
): Promise<Map<string, string>> {
  console.log(`[CronPolling] Storing ${oddsData.length} odds snapshots...`);

  const snapshotIdMap = new Map<string, string>();

  try {
    // DEBUG: Log unique bookmaker names
    const uniqueBookmakers = [...new Set(oddsData.map(o => o.bookmaker))];
    console.log("[CronPolling] DEBUG - Unique bookmaker names from Odds API:", uniqueBookmakers);
    console.log("[CronPolling] DEBUG - Sample odds data:", oddsData.slice(0, 3));

    // Insert all odds snapshots
    const snapshots = oddsData.map((odds) => ({
      sport: odds.sport,
      event_id: odds.event_id,
      team_or_player: odds.team_or_player,
      bookmaker: odds.bookmaker,
      bet_type: odds.bet_type,
      odds_value: odds.odds_value,
      snapshot_at: new Date().toISOString(),
    }));

    const { data, error } = await supabase
      .from("odds_snapshots")
      .insert(snapshots)
      .select("id, event_id, bookmaker, bet_type, team_or_player");

    if (error) {
      console.error("[CronPolling] Error storing odds snapshots:", error);
      throw new Error(`Failed to store odds snapshots: ${error.message}`);
    }

    // Build map for quick lookup: "eventId|bookmaker|betType|team" -> snapshotId
    if (data) {
      for (const snapshot of data) {
        const key = `${snapshot.event_id}|${snapshot.bookmaker}|${snapshot.bet_type}|${snapshot.team_or_player}`;
        snapshotIdMap.set(key, snapshot.id);
      }
    }

    console.log(`[CronPolling] Stored ${data?.length || 0} odds snapshots`);
    return snapshotIdMap;
  } catch (error) {
    console.error("[CronPolling] Error in storeOddsSnapshots:", error);
    throw error;
  }
}

/**
 * STEP 4: Store trigger matches with 24h deduplication
 */
async function storeTriggerMatches(
  supabase: SupabaseClient,
  matches: Match[],
  snapshotIdMap: Map<string, string>,
  oddsSnapshots: any[]
) {
  console.log(`[CronPolling] Storing ${matches.length} trigger matches...`);

  const storedMatches: { match_id: string; trigger_id: string }[] = [];

  for (const match of matches) {
    console.log(`[CronPolling] Processing match for trigger ${match.triggerId}...`);
    
    // Find matching odds snapshot
    const matchingSnapshot = oddsSnapshots.find(
      (s) =>
        s.team_or_player === match.teamOrPlayer &&
        s.bookmaker === match.bookmaker &&
        s.bet_type === match.betType
    );

    console.log(`[CronPolling] DEBUG - Snapshot lookup:`, {
      searching_for: { team: match.teamOrPlayer, bookmaker: match.bookmaker, betType: match.betType },
      found: matchingSnapshot?.id || null
    });

    const snapshotId = matchingSnapshot?.id || null;

    // Insert new match (no deduplication - every match creates a new entry)
    const { data, error } = await supabase
      .from("trigger_matches")
      .insert({
        trigger_id: match.triggerId,
        matched_value: match.oddsValue,
        odds_snapshot_id: snapshotId,
        matched_at: new Date().toISOString(),
      })
      .select("id");

    console.log(`[CronPolling] DEBUG - Insert result for trigger ${match.triggerId}:`, { data, error });

    if (error) {
      console.error(`[CronPolling] Error storing match for trigger ${match.triggerId}:`, error);
      continue;
    }

    if (data && data.length > 0) {
      storedMatches.push({ match_id: data[0].id, trigger_id: match.triggerId });
      console.log(`[CronPolling] ✅ Stored match ${data[0].id} for trigger ${match.triggerId}`);
    }
  }

  console.log(`[CronPolling] Stored ${storedMatches.length} new matches`);
  return storedMatches;
}

/**
 * STEP 5: Create alerts for profile owners
 */
async function createAlerts(
  supabase: SupabaseClient,
  storedMatches: { match_id: string; trigger_id: string }[],
  matchMap: Map<string, Match>,
  profileTriggers: any[]
) {
  console.log(`[CronPolling] Creating alerts for ${storedMatches.length} matches...`);
  console.log(`[CronPolling] DEBUG - storedMatches:`, storedMatches);
  console.log(`[CronPolling] DEBUG - matchMap size:`, matchMap.size);
  console.log(`[CronPolling] DEBUG - profileTriggers:`, profileTriggers);

  const alerts: { alert_id: string; profile_id: string; trigger_id: string; phone_number: string }[] = [];

  for (const stored of storedMatches) {
    console.log(`[CronPolling] Processing stored match: ${stored.match_id} for trigger ${stored.trigger_id}`);
    
    const match = matchMap.get(stored.trigger_id);
    if (!match) {
      console.log(`[CronPolling] ⚠️ No match found in matchMap for trigger ${stored.trigger_id}`);
      continue;
    }

    // Find profile owners of this trigger
    const owners = profileTriggers.filter((pt) => pt.trigger_id === stored.trigger_id);
    console.log(`[CronPolling] Found ${owners.length} profile owners for trigger ${stored.trigger_id}`);

    if (owners.length === 0) {
      console.log(`[CronPolling] ⚠️ No profile owners found for trigger ${stored.trigger_id}`);
    }

    for (const owner of owners) {
      const message = formatAlertMessage(match);

      // Fetch profile phone number
      const { data: profile } = await supabase
        .from("profiles")
        .select("phone")
        .eq("id", owner.profile_id)
        .single();

      const phoneNumber = profile?.phone || "";
      console.log(`[CronPolling] Profile ${owner.profile_id} phone: ${phoneNumber || '(none)'}`);

      const { data, error } = await supabase
        .from("alerts")
        .insert({
          trigger_match_id: stored.match_id,
          profile_id: owner.profile_id,
          message,
          delivery_status: "pending",
        })
        .select("id");

      if (error) {
        console.error(`[CronPolling] Error creating alert:`, error);
        continue;
      }

      if (data && data.length > 0) {
        alerts.push({
          alert_id: data[0].id,
          profile_id: owner.profile_id,
          trigger_id: stored.trigger_id,
          phone_number: phoneNumber,
        });
        console.log(`[CronPolling] ✅ Created alert ${data[0].id} for profile ${owner.profile_id}`);
      } else {
        console.log(`[CronPolling] ⚠️ Alert insert returned no data for profile ${owner.profile_id}`);
      }
    }
  }

  console.log(`[CronPolling] Created ${alerts.length} alerts`);
  return alerts;
}

/**
 * STEP 6: Send webhook alerts
 */
async function sendWebhookAlerts(
  supabase: SupabaseClient,
  alerts: { alert_id: string; profile_id: string; trigger_id: string; phone_number: string }[],
  webhookUrl: string,
  dryRun: boolean = false
): Promise<number> {
  console.log(`[CronPolling] Sending ${alerts.length} webhook alerts (dryRun: ${dryRun})...`);

  let successCount = 0;
  let failedCount = 0;

  for (const alert of alerts) {
    if (dryRun) {
      console.log(`[CronPolling] [DRY RUN] Would send webhook for alert ${alert.alert_id}`);
      successCount++;
      continue;
    }

    try {
      // Fetch additional details for the webhook payload
      const { data: triggerData } = await supabase
        .from("triggers")
        .select("sport, team_or_player, bet_type, odds_comparator, odds_value")
        .eq("id", alert.trigger_id)
        .single();

      const { data: matchData } = await supabase
        .from("trigger_matches")
        .select("matched_value, odds_snapshot_id")
        .eq("trigger_id", alert.trigger_id)
        .order("matched_at", { ascending: false })
        .limit(1)
        .single();

      // Build query parameters for GET request (Zapier-friendly approach)
      const params = new URLSearchParams();
      params.append("alert_id", alert.alert_id);
      params.append("phone_number", alert.phone_number);
      params.append("timestamp", new Date().toISOString());
      
      if (triggerData) {
        params.append("sport", triggerData.sport || "");
        params.append("team_or_player", triggerData.team_or_player || "");
        params.append("bet_type", triggerData.bet_type || "");
        params.append("odds_comparator", triggerData.odds_comparator || "");
        params.append("odds_value", String(triggerData.odds_value || ""));
      }
      
      if (matchData) {
        params.append("matched_odds", String(matchData.matched_value || ""));
      }

      const fullUrl = `${webhookUrl}?${params.toString()}`;
      console.log(`[CronPolling] Sending GET webhook for alert ${alert.alert_id} to ${webhookUrl.substring(0, 50)}...`);

      // Use GET request with query parameters (avoids CORS preflight and SSL issues)
      const response = await fetch(fullUrl, {
        method: "GET",
      });

      if (!response.ok) {
        throw new Error(`Webhook returned status ${response.status}: ${response.statusText}`);
      }

      console.log(`[CronPolling] ✅ Webhook sent successfully for alert ${alert.alert_id}`);

      // Update alert delivery status
      await supabase
        .from("alerts")
        .update({ delivery_status: "sent" })
        .eq("id", alert.alert_id);

      successCount++;
    } catch (error) {
      console.error(`[CronPolling] Failed to send webhook for alert ${alert.alert_id}:`, error);
      failedCount++;

      // Update alert delivery status to failed
      await supabase
        .from("alerts")
        .update({ 
          delivery_status: "failed",
          delivery_error: error instanceof Error ? error.message : "Unknown error"
        })
        .eq("id", alert.alert_id);
    }
  }

  console.log(`[CronPolling] Webhooks sent: ${successCount}, failed: ${failedCount}`);
  return successCount;
}

/**
 * STEP 7: Update 'once' triggers to completed
 */
async function updateMatchedTriggers(supabase: SupabaseClient, triggerIds: string[], triggers: any[]) {
  console.log(`[CronPolling] Updating matched triggers...`);

  const onceTriggers = triggers.filter(
    (t) => triggerIds.includes(t.id) && t.frequency === "once"
  );

  if (onceTriggers.length === 0) {
    console.log("[CronPolling] No 'once' triggers to update");
    return;
  }

  const { error } = await supabase
    .from("triggers")
    .update({ status: "completed" })
    .in("id", onceTriggers.map((t) => t.id));

  if (error) {
    console.error("[CronPolling] Error updating triggers:", error);
  } else {
    console.log(`[CronPolling] Updated ${onceTriggers.length} 'once' triggers to completed`);
  }
}

/**
 * STEP 8: Create evaluation run record
 */
async function createEvaluationRun(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("evaluation_runs")
    .insert({
      status: "running",
      started_at: new Date().toISOString(),
    })
    .select("id");

  if (error) {
    console.error("[CronPolling] Error creating evaluation run:", error);
    throw new Error(`Failed to create evaluation run: ${error.message}`);
  }

  const runId = data?.[0]?.id;
  console.log(`[CronPolling] Created evaluation run: ${runId}`);
  return runId;
}

/**
 * STEP 9: Complete evaluation run with stats
 */
async function completeEvaluationRun(
  supabase: SupabaseClient,
  runId: string,
  stats: {
    triggersEvaluated: number;
    matchesFound: number;
    alertsSent: number;
    durationMs: number;
  }
) {
  const { error } = await supabase
    .from("evaluation_runs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      triggers_evaluated: stats.triggersEvaluated,
      matches_found: stats.matchesFound,
      alerts_sent: stats.alertsSent,
      duration_ms: stats.durationMs,
    })
    .eq("id", runId);

  if (error) {
    console.error("[CronPolling] Error completing evaluation run:", error);
  } else {
    console.log(`[CronPolling] Completed evaluation run ${runId}`);
  }
}

/**
 * MAIN ORCHESTRATOR: Run cron poll
 */
export async function runCronPoll(
  supabase: SupabaseClient,
  oddsApiKey: string,
  webhookUrl: string,
  options: RunCronPollOptions = {}
): Promise<CronPollResult> {
  const startTime = Date.now();
  let runId: string | undefined;

  try {
    console.log("[CronPolling] Starting cron poll...");

    // Check if polling is enabled
    if (!options.skipPollingCheck) {
      const { data: settings } = await supabase
        .from("admin_settings")
        .select("polling_enabled")
        .single();

      if (!settings?.polling_enabled) {
        console.log("[CronPolling] Polling is disabled, skipping");
        return {
          success: true,
          triggersChecked: 0,
          matchesFound: 0,
          alertsCreated: 0,
          webhooksSent: 0,
          durationMs: Date.now() - startTime,
        };
      }
    }

    // Create evaluation run
    runId = await createEvaluationRun(supabase);

    // Fetch active triggers
    const { triggers, profileTriggers } = await fetchActiveTriggers(supabase);

    if (triggers.length === 0) {
      await completeEvaluationRun(supabase, runId, {
        triggersEvaluated: 0,
        matchesFound: 0,
        alertsSent: 0,
        durationMs: Date.now() - startTime,
      });

      return {
        success: true,
        evaluationRunId: runId,
        triggersChecked: 0,
        matchesFound: 0,
        alertsCreated: 0,
        webhooksSent: 0,
        durationMs: Date.now() - startTime,
      };
    }

    // Get unique sports from triggers
    const sports = [...new Set(triggers.map((t: any) => {
      const sportMap: Record<string, string> = {
        NBA: "basketball_nba",
        NFL: "americanfootball_nfl",
        MLB: "baseball_mlb",
        NHL: "icehockey_nhl",
      };
      return sportMap[t.sport] || t.sport.toLowerCase();
    }))];

    // Fetch live odds
    const oddsSnapshots = await fetchLiveOdds(oddsApiKey, sports);

    // Store odds snapshots
    const snapshotIdMap = await storeOddsSnapshots(supabase, oddsSnapshots);

    // Find matches
    const rawMatches = findMatches(triggers, oddsSnapshots);
    const matches = deduplicateMatches(rawMatches);

    // Create match map for alert creation
    const matchMap = new Map<string, Match>();
    for (const match of matches) {
      matchMap.set(match.triggerId, match);
    }

    // Store matches
    const storedMatches = await storeTriggerMatches(supabase, matches, snapshotIdMap, oddsSnapshots);

    // Create alerts
    const alerts = await createAlerts(supabase, storedMatches, matchMap, profileTriggers);

    // Send webhooks
    const webhooksSent = await sendWebhookAlerts(supabase, alerts, webhookUrl, options.dryRun);

    // Update 'once' triggers
    await updateMatchedTriggers(
      supabase,
      storedMatches.map((m) => m.trigger_id),
      triggers
    );

    // Complete evaluation run
    await completeEvaluationRun(supabase, runId, {
      triggersEvaluated: triggers.length,
      matchesFound: matches.length,
      alertsSent: webhooksSent,
      durationMs: Date.now() - startTime,
    });

    console.log(`[CronPolling] Cron poll completed in ${Date.now() - startTime}ms`);

    return {
      success: true,
      evaluationRunId: runId,
      triggersChecked: triggers.length,
      matchesFound: matches.length,
      alertsCreated: alerts.length,
      webhooksSent: webhooksSent,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    console.error("[CronPolling] Error during cron poll:", error);

    if (runId) {
      await supabase
        .from("evaluation_runs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - startTime,
        })
        .eq("id", runId);
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      triggersChecked: 0,
      matchesFound: 0,
      alertsCreated: 0,
      webhooksSent: 0,
      durationMs: Date.now() - startTime,
    };
  }
}