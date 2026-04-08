/**
 * Cron Polling Service - Main orchestrator for trigger evaluation
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { findMatches, deduplicateMatches, formatAlertMessage, type Match } from "./matchingEngine";
import { espnService } from "@/services/espnService";

interface OddsSnapshot {
  sport: string;
  event_id: string;
  team_or_player: string;
  bookmaker: string;
  bet_type: string;
  odds_value: number;
  event_data?: any; // Store full event object from Odds API
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
        // Store event data for ESPN score lookup
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
                event_data: eventData, // Include event data for later use
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
): Promise<{ id: string; team_or_player: string; bookmaker: string; bet_type: string; event_data: any }[]> {
  console.log(`[CronPolling] Storing ${oddsData.length} odds snapshots...`);

  try {
    // DEBUG: Log unique bookmaker names
    const uniqueBookmakers = [...new Set(oddsData.map(o => o.bookmaker))];
    console.log("[CronPolling] DEBUG - Unique bookmaker names from Odds API:", uniqueBookmakers);
    console.log("[CronPolling] DEBUG - Sample odds data:", oddsData.slice(0, 3));

    // Insert all odds snapshots with event_data
    const snapshots = oddsData.map((odds) => ({
      sport: odds.sport,
      event_id: odds.event_id,
      team_or_player: odds.team_or_player,
      bookmaker: odds.bookmaker,
      bet_type: odds.bet_type,
      odds_value: odds.odds_value,
      event_data: odds.event_data, // Store full event data
      snapshot_at: new Date().toISOString(),
    }));

    const { data, error } = await supabase
      .from("odds_snapshots")
      .insert(snapshots)
      .select("id, event_id, bookmaker, bet_type, team_or_player, event_data");

    if (error) {
      console.error("[CronPolling] Error storing odds snapshots:", error);
      throw new Error(`Failed to store odds snapshots: ${error.message}`);
    }

    console.log(`[CronPolling] Stored ${data?.length || 0} odds snapshots with event data`);
    return data || [];
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
  storedSnapshots: { id: string; team_or_player: string; bookmaker: string; bet_type: string; event_data: any }[]
) {
  console.log(`[CronPolling] Storing ${matches.length} trigger matches...`);

  const storedMatches: { match_id: string; trigger_id: string }[] = [];

  for (const match of matches) {
    console.log(`[CronPolling] Processing match for trigger ${match.triggerId}...`);

    // Find matching odds snapshot (now with database ID!)
    const matchingSnapshot = storedSnapshots.find(
      (s) =>
        s.team_or_player === match.teamOrPlayer &&
        s.bookmaker === match.bookmaker &&
        s.bet_type === match.betType
    );

    console.log(`[CronPolling] DEBUG - Snapshot lookup:`, {
      searching_for: { team: match.teamOrPlayer, bookmaker: match.bookmaker, betType: match.betType },
      found: matchingSnapshot?.id || null,
      total_snapshots: storedSnapshots.length
    });

    if (!matchingSnapshot) {
      console.log(`[CronPolling] ⚠️ WARNING: No matching snapshot found!`);
      console.log(`[CronPolling] DEBUG - Sample snapshots:`, storedSnapshots.slice(0, 3).map(s => ({
        id: s.id,
        team: s.team_or_player,
        bookmaker: s.bookmaker,
        bet_type: s.bet_type
      })));
    } else {
      console.log(`[CronPolling] ✅ Found matching snapshot:`, {
        id: matchingSnapshot.id,
        team: matchingSnapshot.team_or_player,
        bookmaker: matchingSnapshot.bookmaker,
        bet_type: matchingSnapshot.bet_type,
        has_event_data: !!matchingSnapshot.event_data
      });
    }

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

    console.log(`[CronPolling] DEBUG - Insert result for trigger ${match.triggerId}:`, { data, error, snapshotId });

    if (error) {
      console.error(`[CronPolling] Error storing match for trigger ${match.triggerId}:`, error);
      continue;
    }

    if (data && data.length > 0) {
      storedMatches.push({ match_id: data[0].id, trigger_id: match.triggerId });
      console.log(`[CronPolling] ✅ Stored match ${data[0].id} for trigger ${match.triggerId} with snapshot ${snapshotId}`);
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
  matchMap: Map<string, Match>
): Promise<{ alert_id: string; profile_id: string; phone_number: string }[]> {
  console.log(`[CronPolling] Creating alerts for ${storedMatches.length} matches...`);
  console.log(`[CronPolling] DEBUG - storedMatches:`, storedMatches);
  console.log(`[CronPolling] DEBUG - matchMap size:`, matchMap.size);
  console.log(`[CronPolling] DEBUG - matchMap keys:`, Array.from(matchMap.keys()));

  const alertsData: { alert_id: string; profile_id: string; phone_number: string }[] = [];

  for (const storedMatch of storedMatches) {
    console.log(`[CronPolling] DEBUG - Processing storedMatch:`, storedMatch);
    
    const trigger = triggers?.find((t) => t.id === storedMatch.trigger_id);
    console.log(`[CronPolling] DEBUG - Found trigger:`, trigger ? `Yes (${trigger.id})` : 'No');
    
    const match = matchMap.get(storedMatch.trigger_id);
    console.log(`[CronPolling] DEBUG - Found match in matchMap:`, match ? 'Yes' : 'No');

    if (!trigger || !match) {
      console.log(`[CronPolling] Skipping alert: no trigger or match data found (trigger: ${!!trigger}, match: ${!!match})`);
      continue;
    }

    const phoneNumber = profileMap.get(trigger.user_id);
    if (!phoneNumber) {
      console.log(`[CronPolling] Skipping alert: no phone number for user ${trigger.user_id}`);
      continue;
    }

    // Fetch ESPN score for this match
    let scoreSummary = "";
    let espnScore = null;
    try {
      // Get the odds snapshot to extract event data
      const { data: matchData } = await supabase
        .from("trigger_matches")
        .select("odds_snapshot_id")
        .eq("id", storedMatch.match_id)
        .single();

      if (matchData?.odds_snapshot_id) {
        const { data: snapshotData } = await supabase
          .from("odds_snapshots")
          .select("event_data")
          .eq("id", matchData.odds_snapshot_id)
          .single();

        if (snapshotData?.event_data) {
          const eventData = snapshotData.event_data as any;
          const homeTeam = eventData.home_team;
          const awayTeam = eventData.away_team;

          if (homeTeam && awayTeam) {
            console.log(`[CronPolling] Fetching ESPN score for alert message: ${awayTeam} @ ${homeTeam}`);
            espnScore = await espnService.findGameScore(homeTeam, awayTeam);

            if (espnScore.found) {
              scoreSummary = `\n📊 ${espnService.formatScore(espnScore)}`;
              console.log(`[CronPolling] ✅ Added score to alert message: ${scoreSummary.trim()}`);
            }
          }
        }
      }
    } catch (error) {
      console.error(`[CronPolling] Error fetching ESPN score for alert:`, error);
      // Continue without score - don't block alert creation
    }

    // Build formatted message with score summary
    const message = `🚨 ${trigger.team_or_player} ${trigger.bet_type} hit ${
      trigger.odds_comparator
    } ${trigger.odds_value > 0 ? "+" : ""}${trigger.odds_value} on ${match.bookmaker}! Current: ${
      match.oddsValue > 0 ? "+" : ""
    }${match.oddsValue}${scoreSummary}`;

    // Build alert data with ESPN fields
    const alertData: any = {
      trigger_match_id: storedMatch.match_id,
      profile_id: trigger.user_id,
      message,
      delivery_status: "pending",
    };

    // Add ESPN score fields if available
    if (espnScore?.found) {
      alertData.game_status = espnScore.state;
      alertData.game_detail = espnScore.detail;
      alertData.home_team = espnScore.homeTeam;
      alertData.away_team = espnScore.awayTeam;
      alertData.home_score = espnScore.homeScore;
      alertData.away_score = espnScore.awayScore;
      alertData.period = espnScore.period;
      alertData.clock = espnScore.clock;
      alertData.score_summary = espnService.formatScore(espnScore);
    }

    const { data, error } = await supabase
      .from("alerts")
      .insert(alertData)
      .select("id");

    if (error) {
      console.error(`[CronPolling] Error creating alert:`, error);
      continue;
    }

    if (data && data.length > 0) {
      alertsData.push({
        alert_id: data[0].id,
        profile_id: trigger.user_id,
        phone_number: phoneNumber,
      });
      console.log(`[CronPolling] ✅ Created alert ${data[0].id} with ESPN score data`);
    }
  }

  console.log(`[CronPolling] Created ${alertsData.length} alerts`);
  return alertsData;
}

/**
 * STEP 6: Send webhook alerts
 */
async function sendWebhookAlerts(
  supabase: SupabaseClient,
  alertsData: { alert_id: string; profile_id: string; phone_number: string }[],
  webhookUrl: string,
  dryRun: boolean
): Promise<number> {
  console.log(`[CronPolling] Sending ${alertsData.length} webhook alerts (dryRun: ${dryRun})...`);

  let successCount = 0;
  let failedCount = 0;

  for (const alert of alertsData) {
    if (dryRun) {
      console.log(`[CronPolling] [DRY RUN] Would send webhook for alert ${alert.alert_id}`);
      successCount++;
      continue;
    }

    try {
      // Fetch alert with trigger_match relationship
      const { data: alertData } = await supabase
        .from("alerts")
        .select(`
          *,
          trigger_matches!inner (
            trigger_id,
            matched_value
          )
        `)
        .eq("id", alert.alert_id)
        .single();

      if (!alertData || !alertData.trigger_matches) {
        console.log(`[CronPolling] ⚠️ Could not fetch alert or trigger match data for alert ${alert.alert_id}`);
        continue;
      }

      const triggerMatchData = Array.isArray(alertData.trigger_matches) 
        ? alertData.trigger_matches[0] 
        : alertData.trigger_matches;

      // Fetch trigger data
      const { data: triggerData } = await supabase
        .from("triggers")
        .select("odds_comparator, team_or_player, bet_type, sport, odds_value, bookmaker")
        .eq("id", triggerMatchData.trigger_id)
        .single();

      if (!triggerData) {
        console.log(`[CronPolling] ⚠️ Could not fetch trigger data for trigger ${triggerMatchData.trigger_id}`);
        continue;
      }

      // Fetch additional details for the webhook payload
      const { data: matchData } = await supabase
        .from("trigger_matches")
        .select("matched_value, odds_snapshot_id, trigger_id")
        .eq("id", alertData.trigger_match_id)
        .single();

      // Fetch live score from ESPN if we have odds snapshot data
      let espnScore = null;
      if (matchData?.odds_snapshot_id) {
        console.log(`[CronPolling] DEBUG - Match data:`, matchData);
        
        // Get the odds snapshot to extract event data
        const { data: snapshotData } = await supabase
          .from("odds_snapshots")
          .select("event_data")
          .eq("id", matchData.odds_snapshot_id)
          .single();

        console.log(`[CronPolling] DEBUG - Snapshot data:`, snapshotData);

        if (snapshotData?.event_data) {
          const eventData = snapshotData.event_data as any;
          console.log(`[CronPolling] DEBUG - Event data from snapshot:`, eventData);
          
          const homeTeam = eventData.home_team;
          const awayTeam = eventData.away_team;

          console.log(`[CronPolling] DEBUG - Extracted teams: home="${homeTeam}", away="${awayTeam}"`);

          if (homeTeam && awayTeam) {
            console.log(`[CronPolling] Fetching ESPN score for ${awayTeam} @ ${homeTeam}...`);
            espnScore = await espnService.findGameScore(homeTeam, awayTeam);
            
            console.log(`[CronPolling] DEBUG - ESPN score result:`, espnScore);
            
            if (espnScore.found) {
              console.log(`[CronPolling] ✅ ESPN score found: ${espnService.formatScore(espnScore)}`);
            } else {
              console.log(`[CronPolling] ⚠️ No ESPN score found for this game`);
            }
          } else {
            console.log(`[CronPolling] ⚠️ Missing home or away team in event_data`);
          }
        } else {
          console.log(`[CronPolling] ⚠️ No event_data in snapshot`);
        }
      } else {
        console.log(`[CronPolling] ⚠️ No odds_snapshot_id in match data`);
      }

      // Build query parameters for GET request (Zapier-friendly approach)
      const params = new URLSearchParams();
      params.append("alert_id", alert.alert_id);
      params.append("phone_number", alert.phone_number);
      params.append("timestamp", new Date().toISOString());
      
      // Add the alert message
      if (alertData?.message) {
        params.append("message", alertData.message);
      }
      
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

      // Add ESPN score data if available
      if (espnScore?.found) {
        console.log(`[CronPolling] ✅ Adding ESPN score to webhook payload`);
        params.append("game_status", espnScore.state || "");
        params.append("game_detail", espnScore.detail || "");
        params.append("home_team", espnScore.homeTeam || "");
        params.append("away_team", espnScore.awayTeam || "");
        params.append("home_score", String(espnScore.homeScore || 0));
        params.append("away_score", String(espnScore.awayScore || 0));
        params.append("period", String(espnScore.period || 0));
        params.append("clock", espnScore.clock || "");
        params.append("score_summary", espnService.formatScore(espnScore));
      } else {
        console.log(`[CronPolling] ⚠️ No ESPN score to add to webhook (espnScore.found = ${espnScore?.found})`);
      }

      const fullUrl = `${webhookUrl}?${params.toString()}`;
      console.log(`[CronPolling] Sending GET webhook for alert ${alert.alert_id} to ${webhookUrl.substring(0, 50)}...`);
      console.log(`[CronPolling] DEBUG - Full webhook URL params:`, params.toString());

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
    const storedMatches = await storeTriggerMatches(supabase, matches, snapshotIdMap);

    // Create alerts
    const alerts = await createAlerts(supabase, storedMatches, matchMap);

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