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
    const validatedEventIds = new Set<string>();
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

          // Cache ESPN data for this event
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
            
            // First try to parse period type from detail string
            if (espnData.detail) {
              const periodWord = espnData.detail.toLowerCase();
              
              // Map period word to standard type
              if (periodWord.includes('quarter')) currentPeriodType = 'quarter';
              else if (periodWord.includes('inning')) currentPeriodType = 'inning';
              else if (periodWord.includes('period')) currentPeriodType = 'period';
              else if (periodWord.includes('half')) currentPeriodType = 'half';
            }

            // If detail didn't contain a period keyword, infer from sport/league
            if (!currentPeriodType) {
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
          }

          if (currentPeriod === null || !currentPeriodType) {
            console.log(`[CronPoll] ⚠️ Could not extract period data. Period: ${espnData.period}, Detail: "${espnData.detail}", Sport: ${event.league_key}`);
            continue;
          }

          console.log(`[CronPoll] 📊 Parsed game state: ${currentPeriodType} ${currentPeriod}`);

          // Check if any triggers for this event pass time period validation
          const eventTriggers = triggersWithTimePeriod.filter(t => 
            t.sport === event.league_key &&
            (t.team_or_player.toLowerCase().includes(event.home_team.toLowerCase()) ||
             t.team_or_player.toLowerCase().includes(event.away_team.toLowerCase()) ||
             event.home_team.toLowerCase().includes(t.team_or_player.toLowerCase()) ||
             event.away_team.toLowerCase().includes(t.team_or_player.toLowerCase()))
          );

          console.log(`[CronPoll] Found ${eventTriggers.length} triggers for this event`);

          for (const trigger of eventTriggers) {
            console.log(`[CronPoll] Checking trigger ${trigger.id}: ${trigger.team_or_player} - ${trigger.time_period_type} >= ${trigger.time_period_min}`);
            
            // Validate period type matches
            if (trigger.time_period_type !== currentPeriodType) {
              console.log(`[CronPoll] ❌ Period type mismatch for trigger ${trigger.id}: ${currentPeriodType} != ${trigger.time_period_type}`);
              continue;
            }

            // Validate period number meets minimum
            if (currentPeriod < (trigger.time_period_min || 0)) {
              console.log(`[CronPoll] ❌ Period too early for trigger ${trigger.id}: ${currentPeriod} < ${trigger.time_period_min}`);
              continue;
            }

            console.log(`[CronPoll] ✅ Event ${event.event_id} passes time period validation for trigger ${trigger.id}`);
            validatedEventIds.add(event.event_id);
          }
        } catch (error) {
          console.error(`[CronPoll] Error validating event ${event.event_id}:`, error);
        }
      }

      console.log(`[CronPoll] ${validatedEventIds.size} events passed time period validation`);
      console.log(`[CronPoll] Validated event IDs:`, Array.from(validatedEventIds));
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

      // If trigger has time period constraint, check if any odds for this trigger
      // come from a validated event
      const hasValidatedOdds = allOdds.some(odds => {
        // Check if odds match this trigger's team
        const teamMatch = 
          odds.team_or_player.toLowerCase().includes(trigger.team_or_player.toLowerCase()) ||
          trigger.team_or_player.toLowerCase().includes(odds.team_or_player.toLowerCase());
        
        if (teamMatch) {
          console.log(`[CronPoll]   - Found odds for ${odds.team_or_player} on event ${odds.event_id}`);
          console.log(`[CronPoll]   - Event validated? ${validatedEventIds.has(odds.event_id)}`);
        }

        // Check if event passed validation
        return teamMatch && validatedEventIds.has(odds.event_id);
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

    // Step 12: Create trigger_matches and alerts
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

        // Fetch ESPN game data for alert
        const oddsSnapshot = allOdds.find(o => 
          o.event_id === match.eventId && 
          o.team_or_player === match.teamOrPlayer &&
          o.bookmaker === match.bookmaker &&
          o.bet_type === match.betType
        );

        let espnData = null;
        if (oddsSnapshot?.event_data) {
          const eventData = oddsSnapshot.event_data;
          console.log(`[CronPoll] Fetching ESPN data for alert: ${eventData.away_team} @ ${eventData.home_team} (${match.sport})`);
          
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

        // Build alert message with ESPN game data
        let alertMessage = `${match.teamOrPlayer} ${match.betType} hit! ${match.bookmaker}: ${formatOdds(match.oddsValue)}`;
        
        if (espnData?.found) {
          alertMessage += `\n\n📊 Game Status: ${espnService.formatScore(espnData)}`;
        }

        // Create alert with profile_id and ESPN game data
        const { data: alert, error: alertError } = await supabase
          .from("alerts")
          .insert({
            trigger_match_id: triggerMatch.id,
            profile_id: profileTrigger.profile_id,
            message: alertMessage,
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
            const { data: triggerData } = await supabase
              .from("triggers")
              .select("*")
              .eq("id", match.triggerId)
              .single();

            await fetch(webhookUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                trigger_id: match.triggerId,
                alert_id: alert.id,
                message: alert.message,
                event: match.eventDetails,
                sport: match.sport,
                team: match.teamOrPlayer,
                bet_type: match.betType,
                odds: match.oddsValue,
                bookmaker: match.bookmaker,
                game_status: alert.game_status,
                game_detail: alert.game_detail,
                home_team: alert.home_team,
                away_team: alert.away_team,
                home_score: alert.home_score,
                away_score: alert.away_score,
                period: alert.period,
                clock: alert.clock,
                score_summary: alert.score_summary,
                matched_at: triggerMatch.matched_at,
                delivery_status: alert.delivery_status,
                trigger: triggerData,
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
      liveEventsCount: validatedEventIds.size,
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