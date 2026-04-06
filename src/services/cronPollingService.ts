/**
 * Cron Polling Service - Main orchestrator for trigger evaluation
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { findMatches, deduplicateMatches, formatAlertMessage, type Match } from "./matchingEngine";

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

  if (triggersError) {
    console.error("[CronPolling] Error fetching triggers:", triggersError);
    throw new Error(`Failed to fetch triggers: ${triggersError.message}`);
  }

  // Fetch profile associations
  const { data: profileTriggers, error: profileTriggersError } = await supabase
    .from("profile_triggers")
    .select("profile_id, trigger_id");

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
async function fetchLiveOdds(apiKey: string, sports: string[]) {
  console.log(`[CronPolling] Fetching live odds for sports: ${sports.join(", ")}`);

  const oddsSnapshots: any[] = [];

  for (const sport of sports) {
    try {
      const response = await fetch(
        `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${apiKey}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`,
        { method: "GET" }
      );

      if (!response.ok) {
        console.error(`[CronPolling] Failed to fetch odds for ${sport}: ${response.statusText}`);
        continue;
      }

      const events = await response.json();
      console.log(`[CronPolling] Fetched ${events.length} events for ${sport}`);

      // Parse events into odds snapshots
      for (const event of events) {
        for (const bookmaker of event.bookmakers || []) {
          for (const market of bookmaker.markets || []) {
            for (const outcome of market.outcomes || []) {
              oddsSnapshots.push({
                sport,
                event_id: event.id,
                team_or_player: outcome.name,
                bookmaker: bookmaker.key,
                bet_type: market.key,
                odds_value: outcome.price,
                fetched_at: new Date().toISOString(),
              });
            }
          }
        }
      }
    } catch (error) {
      console.error(`[CronPolling] Error fetching odds for ${sport}:`, error);
    }
  }

  console.log(`[CronPolling] Total odds snapshots: ${oddsSnapshots.length}`);
  return oddsSnapshots;
}

/**
 * STEP 3: Store odds snapshots in database
 */
async function storeOddsSnapshots(supabase: SupabaseClient, oddsSnapshots: any[]) {
  console.log(`[CronPolling] Storing ${oddsSnapshots.length} odds snapshots...`);

  if (oddsSnapshots.length === 0) {
    return new Map<string, string>();
  }

  const { data, error } = await supabase
    .from("odds_snapshots")
    .insert(oddsSnapshots)
    .select("id, event_id, team_or_player, bookmaker, bet_type");

  if (error) {
    console.error("[CronPolling] Error storing odds snapshots:", error);
    throw new Error(`Failed to store odds snapshots: ${error.message}`);
  }

  // Create map for linking matches to snapshot IDs
  const snapshotIdMap = new Map<string, string>();
  for (const snapshot of data || []) {
    const key = `${snapshot.event_id}_${snapshot.team_or_player}_${snapshot.bookmaker}_${snapshot.bet_type}`;
    snapshotIdMap.set(key, snapshot.id);
  }

  console.log(`[CronPolling] Stored ${data?.length || 0} odds snapshots`);
  return snapshotIdMap;
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
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  for (const match of matches) {
    // Check for existing match in last 24 hours
    const { data: existing } = await supabase
      .from("trigger_matches")
      .select("id")
      .eq("trigger_id", match.triggerId)
      .gte("matched_at", twentyFourHoursAgo)
      .limit(1);

    if (existing && existing.length > 0) {
      console.log(`[CronPolling] Skipping duplicate match for trigger ${match.triggerId}`);
      continue;
    }

    // Find matching odds snapshot
    const matchingSnapshot = oddsSnapshots.find(
      (s) =>
        s.team_or_player === match.teamOrPlayer &&
        s.bookmaker === match.bookmaker &&
        s.bet_type === match.betType
    );

    const snapshotId = matchingSnapshot?.id || null;

    // Insert new match
    const { data, error } = await supabase
      .from("trigger_matches")
      .insert({
        trigger_id: match.triggerId,
        odds_value: match.oddsValue,
        bookmaker: match.bookmaker,
        event_details: match.eventDetails,
        odds_snapshot_id: snapshotId,
        matched_at: new Date().toISOString(),
      })
      .select("id");

    if (error) {
      console.error(`[CronPolling] Error storing match for trigger ${match.triggerId}:`, error);
      continue;
    }

    if (data && data.length > 0) {
      storedMatches.push({ match_id: data[0].id, trigger_id: match.triggerId });
      console.log(`[CronPolling] Stored match ${data[0].id} for trigger ${match.triggerId}`);
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

  const alerts: { alert_id: string; profile_id: string; message: string }[] = [];

  for (const stored of storedMatches) {
    const match = matchMap.get(stored.trigger_id);
    if (!match) continue;

    // Find profile owners of this trigger
    const owners = profileTriggers.filter((pt) => pt.trigger_id === stored.trigger_id);

    for (const owner of owners) {
      const message = formatAlertMessage(match);

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
          message,
        });
        console.log(`[CronPolling] Created alert ${data[0].id} for profile ${owner.profile_id}`);
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
  alerts: { alert_id: string; profile_id: string; message: string }[],
  webhookUrl: string,
  dryRun: boolean = false
) {
  console.log(`[CronPolling] Sending ${alerts.length} webhook alerts (dryRun: ${dryRun})...`);

  let sent = 0;
  let failed = 0;

  for (const alert of alerts) {
    if (dryRun) {
      console.log(`[CronPolling] [DRY RUN] Would send webhook for alert ${alert.alert_id}`);
      sent++;
      continue;
    }

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile_id: alert.profile_id,
          message: alert.message,
          timestamp: new Date().toISOString(),
        }),
      });

      if (response.ok) {
        await supabase
          .from("alerts")
          .update({
            delivery_status: "sent",
            webhook_response: await response.text(),
          })
          .eq("id", alert.alert_id);
        sent++;
        console.log(`[CronPolling] Sent webhook for alert ${alert.alert_id}`);
      } else {
        throw new Error(`Webhook returned ${response.status}`);
      }
    } catch (error) {
      await supabase
        .from("alerts")
        .update({
          delivery_status: "failed",
          webhook_response: error instanceof Error ? error.message : "Unknown error",
        })
        .eq("id", alert.alert_id);
      failed++;
      console.error(`[CronPolling] Failed to send webhook for alert ${alert.alert_id}:`, error);
    }
  }

  console.log(`[CronPolling] Webhooks sent: ${sent}, failed: ${failed}`);
  return { sent, failed };
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
    const { sent } = await sendWebhookAlerts(supabase, alerts, webhookUrl, options.dryRun);

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
      alertsSent: sent,
      durationMs: Date.now() - startTime,
    });

    console.log(`[CronPolling] Cron poll completed in ${Date.now() - startTime}ms`);

    return {
      success: true,
      evaluationRunId: runId,
      triggersChecked: triggers.length,
      matchesFound: matches.length,
      alertsCreated: alerts.length,
      webhooksSent: sent,
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