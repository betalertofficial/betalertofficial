import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { oddsApiService } from "@/services/oddsApiService";
import { apiSportsService } from "@/services/apiSportsService";
import { alertService } from "@/services/alertService";

// Zapier webhook URL for alert notifications
const ZAPIER_WEBHOOK_URL = "https://hooks.zapier.com/hooks/catch/7723146/u140xkd/";

export interface EvaluationResult {
  triggersEvaluated: number;
  matchesFound: number;
  alertsSent: number;
  durationMs: number;
  debug?: {
    oddsEventsFetched: number;
    snapshotsStored: number;
    sampleOddsEvent?: any;
    sampleSnapshot?: any;
    triggerDetails?: any[];
    matchDetails?: any[];
  };
}

// Database Trigger Interface
interface DatabaseTrigger {
  id: string;
  // profile_id is not directly on the triggers table, but mapped from join
  profile_id?: string; 
  sport: string;
  team_or_player: string;
  bet_type: string;
  odds_comparator: string;
  odds_value: number;
  frequency: string;
  status: string;
  bookmaker?: string | null;
  vendor_id?: string | null;
}

interface OddsSnapshotInsert {
  sport: string;
  event_id: string;
  team_or_player: string;
  bookmaker: string;
  bet_type: string;
  odds_value: number;
  deep_link_url: string | null;
  commence_time: string;
  event_data: any;
}

interface OddsSnapshot extends OddsSnapshotInsert {
  id: string;
  created_at?: string;
}

interface TriggerMatchInsert {
  trigger_id: string;
  odds_snapshot_id: string;
  matched_value: number;
}

interface PollingResult {
  success: boolean;
  checked: number;
  hit: number;
  matches: number;
  alerts: number;
  message: string;
  pollingDisabled?: boolean;
}

// Map our sport names to Odds API sport keys
const SPORT_KEY_MAP: Record<string, string> = {
  "NBA": "basketball_nba",
  "NFL": "americanfootball_nfl",
  "MLB": "baseball_mlb",
  "NHL": "icehockey_nhl",
  "Soccer": "soccer_epl"
};

export const pollingService = {
  /**
   * Check if polling is enabled in admin settings
   */
  async isPollingEnabled(supabaseClient: SupabaseClient): Promise<boolean> {
    const { data: settings, error } = await supabaseClient
      .from("admin_settings")
      .select("setting_value")
      .eq("setting_key", "odds_polling_status")
      .single();

    if (error) {
      console.error("[POLLING] Error fetching polling status:", error.message);
      return false;
    }

    return settings?.setting_value === "true";
  },

  /**
   * Main polling logic - evaluates all active triggers against current odds
   */
  async evaluateTriggers(
    supabaseClient: SupabaseClient,
    oddsApiKey: string,
    skipPollingCheck: boolean = false
  ): Promise<{ success: boolean; data?: EvaluationResult; error?: string }> {
    const startTime = Date.now();
    console.log(`[PollingService] Starting trigger evaluation at ${new Date().toISOString()}`);

    try {
      // 1. Check if polling is enabled (skip for manual polls)
      if (!skipPollingCheck) {
        const isEnabled = await pollingService.isPollingEnabled(supabaseClient);
        if (!isEnabled) {
          console.log("[PollingService] Polling is disabled, skipping evaluation");
          return {
            success: true,
            data: {
              triggersEvaluated: 0,
              matchesFound: 0,
              alertsSent: 0,
              durationMs: Date.now() - startTime,
            },
          };
        }
      }

      console.log("[PollingService] Fetching active triggers...");

      // 2. Fetch active triggers and their profile associations
      // We query profile_triggers to find which profiles own which active triggers
      const { data: profileTriggers, error: profileTriggersError } = await supabaseClient
        .from("profile_triggers")
        .select(`
          id,
          profile_id,
          trigger_id,
          triggers!profile_triggers_trigger_id_fkey (
            id,
            sport,
            team_or_player,
            bet_type,
            odds_comparator,
            odds_value,
            frequency,
            status,
            bookmaker,
            team_id
          )
        `)
        .eq("triggers.status", "active");

      if (profileTriggersError) {
        console.error("[PollingService] Error fetching triggers:", profileTriggersError);
        throw new Error(`Failed to fetch triggers: ${profileTriggersError.message}`);
      }

      if (!profileTriggers || profileTriggers.length === 0) {
        console.log("[PollingService] No active triggers found");
        return {
          success: true,
          data: {
            triggersEvaluated: 0,
            matchesFound: 0,
            alertsSent: 0,
            durationMs: Date.now() - startTime,
          },
        };
      }

      console.log(`[PollingService] Found ${profileTriggers.length} active trigger associations`);
      
      // DEBUG: Log raw data structure
      console.log(`[PollingService] DEBUG - First profile trigger structure:`, JSON.stringify(profileTriggers[0], null, 2));
      console.log(`[PollingService] DEBUG - Sample of first 3 profile triggers:`, profileTriggers.slice(0, 3).map((pt: any) => ({
        profile_id: pt.profile_id,
        trigger_id: pt.trigger_id,
        triggers_type: typeof pt.triggers,
        triggers_is_array: Array.isArray(pt.triggers),
        triggers_value: pt.triggers
      })));

      // 3. Transform the data into a usable format
      // Supabase returns joined relations as arrays, so we need to extract the first item
      const triggersWithProfiles = profileTriggers
        .map((pt: any, index: number): DatabaseTrigger | null => {
          console.log(`[PollingService] DEBUG - Processing profile trigger ${index}:`, {
            profile_id: pt.profile_id,
            trigger_id: pt.trigger_id,
            triggers_raw: pt.triggers
          });
          
          const trigger = Array.isArray(pt.triggers) ? pt.triggers[0] : pt.triggers;
          
          console.log(`[PollingService] DEBUG - Extracted trigger data for index ${index}:`, trigger);
          
          if (!trigger) {
            console.log(`[PollingService] DEBUG - Skipping profile trigger at index ${index}: trigger is ${trigger}`);
            return null;
          }
          
          const processedTrigger: DatabaseTrigger = {
            id: trigger.id,
            profile_id: pt.profile_id,
            sport: trigger.sport,
            team_or_player: trigger.team_or_player,
            bet_type: trigger.bet_type,
            odds_comparator: trigger.odds_comparator,
            odds_value: trigger.odds_value,
            frequency: trigger.frequency,
            status: trigger.status,
            bookmaker: trigger.bookmaker || null,
            vendor_id: trigger.vendor_id || null,
          };
          
          console.log(`[PollingService] DEBUG - Processed trigger ${index}:`, processedTrigger);
          
          return processedTrigger;
        })
        .filter((t): t is DatabaseTrigger => t !== null);

      console.log(`[PollingService] Processing ${triggersWithProfiles.length} triggers (started with ${profileTriggers.length} associations)`);
      console.log(`[PollingService] DEBUG - First processed trigger:`, triggersWithProfiles[0]);
      
      if (triggersWithProfiles.length < profileTriggers.length) {
        console.warn(`[PollingService] WARNING: Lost ${profileTriggers.length - triggersWithProfiles.length} triggers during transformation!`);
      }

      // 4. Fetch odds from vendor
      console.log("[PollingService] Fetching latest odds data...");
      const oddsData = await oddsApiService.fetchOdds(oddsApiKey);

      if (!oddsData || oddsData.length === 0) {
        console.log("[PollingService] No odds data available");
        return {
          success: true,
          data: {
            triggersEvaluated: triggersWithProfiles.length,
            matchesFound: 0,
            alertsSent: 0,
            durationMs: Date.now() - startTime,
          },
        };
      }

      console.log(`[PollingService] Received ${oddsData.length} events with odds data`);
      console.log(`[PollingService] DEBUG - First odds event:`, JSON.stringify(oddsData[0], null, 2));

      // 5. Store odds snapshots
      const snapshots = await pollingService.storeOddsSnapshots(supabaseClient, oddsData);
      console.log(`[PollingService] Stored ${snapshots.length} odds snapshots`);
      console.log(`[PollingService] DEBUG - First snapshot:`, JSON.stringify(snapshots[0], null, 2));

      // 6. Evaluate each trigger
      let matchesFound = 0;
      let alertsSent = 0;
      const debugTriggerDetails: any[] = [];
      const debugMatchDetails: any[] = [];

      for (const trigger of triggersWithProfiles) {
        try {
          console.log(`[PollingService] Evaluating trigger ${trigger.id}:`, {
            sport: trigger.sport,
            team_or_player: trigger.team_or_player,
            bet_type: trigger.bet_type,
            odds_comparator: trigger.odds_comparator,
            odds_value: trigger.odds_value
          });
          
          // Collect trigger details for debug
          debugTriggerDetails.push({
            id: trigger.id,
            sport: trigger.sport,
            team_or_player: trigger.team_or_player,
            bet_type: trigger.bet_type,
            odds_comparator: trigger.odds_comparator,
            odds_value: trigger.odds_value
          });
          
          const matchingSnapshots = pollingService.findMatchingOdds(trigger, snapshots);
          
          console.log(`[PollingService] Found ${matchingSnapshots.length} matches for trigger ${trigger.id}`);

          if (matchingSnapshots.length > 0) {
            console.log(
              `[PollingService] Found ${matchingSnapshots.length} matches for trigger ${trigger.id}`
            );

            // Store trigger matches
            for (const snapshot of matchingSnapshots) {
              debugMatchDetails.push({
                trigger_id: trigger.id,
                snapshot: {
                  sport: snapshot.sport,
                  team_or_player: snapshot.team_or_player,
                  bet_type: snapshot.bet_type,
                  odds_value: snapshot.odds_value,
                  bookmaker: snapshot.bookmaker
                }
              });
              
              const { data: matchData, error: matchError } = await supabaseClient
                .from("trigger_matches")
                .insert({
                  trigger_id: trigger.id,
                  odds_snapshot_id: snapshot.id,
                  matched_value: snapshot.odds_value,
                })
                .select("id")
                .single();

              if (!matchError && matchData) {
                matchesFound++;

                // Send alert
                const alertSent = await alertService.sendAlert(
                  supabaseClient,
                  trigger.profile_id,
                  trigger,
                  snapshot,
                  matchData.id
                );

                if (alertSent) {
                  alertsSent++;
                }
              }
            }
          }
        } catch (error) {
          console.error(`[PollingService] Error processing trigger ${trigger.id}:`, error);
        }
      }

      const durationMs = Date.now() - startTime;
      console.log(
        `[PollingService] Evaluation complete: ${triggersWithProfiles.length} triggers, ${matchesFound} matches, ${alertsSent} alerts sent in ${durationMs}ms`
      );

      return {
        success: true,
        data: {
          triggersEvaluated: triggersWithProfiles.length,
          matchesFound,
          alertsSent,
          durationMs,
          debug: {
            oddsEventsFetched: oddsData.length,
            snapshotsStored: snapshots.length,
            sampleOddsEvent: oddsData[0],
            sampleSnapshot: snapshots[0],
            triggerDetails: debugTriggerDetails,
            matchDetails: debugMatchDetails
          }
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("[PollingService] Error in evaluateTriggers:", errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    }
  },

  /**
   * Store odds snapshots in the database
   */
  async storeOddsSnapshots(
    supabaseClient: SupabaseClient,
    oddsData: any[]
  ): Promise<OddsSnapshot[]> {
    const snapshots: OddsSnapshot[] = [];

    for (const event of oddsData) {
      const sport = event.sport_key;
      const event_id = event.event_id;
      const team_or_player = event.team;
      const bookmaker = event.bookmaker;
      const bet_type = event.bet_type;
      const odds_value = event.odds;
      const deep_link_url = event.deep_link_url;
      const commence_time = event.commence_time;
      const event_data = event;

      const { data: snapshotData, error: snapshotError } = await supabaseClient
        .from("odds_snapshots")
        .insert({
          sport,
          event_id,
          team_or_player,
          bookmaker,
          bet_type,
          odds_value,
          deep_link_url,
          commence_time,
          event_data,
        })
        .select();

      if (!snapshotError && snapshotData) {
        // Cast to OddsSnapshot to satisfy TypeScript (includes id)
        snapshots.push(...(snapshotData as unknown as OddsSnapshot[]));
      }
    }

    return snapshots;
  },

  /**
   * Find matching odds snapshots for a trigger
   */
  findMatchingOdds(
    trigger: DatabaseTrigger,
    snapshots: OddsSnapshot[]
  ): OddsSnapshot[] {
    const { sport, team_or_player, bet_type, odds_comparator, odds_value } = trigger;
    const matches: OddsSnapshot[] = [];

    console.log(`[findMatchingOdds] Looking for matches. Trigger:`, {
      sport,
      team_or_player,
      bet_type,
      odds_comparator,
      odds_value,
      total_snapshots: snapshots.length
    });

    for (const snapshot of snapshots) {
      const { sport: snapshotSport, team_or_player: snapshotTeam, bet_type: snapshotBetType, odds_value: snapshotOddsValue } = snapshot;

      // Log first 3 snapshots for debugging
      if (matches.length === 0 && snapshots.indexOf(snapshot) < 3) {
        console.log(`[findMatchingOdds] Sample snapshot ${snapshots.indexOf(snapshot)}:`, {
          snapshotSport,
          snapshotTeam,
          snapshotBetType,
          snapshotOddsValue
        });
      }

      // Basic matching logic - can be expanded
      // If trigger has specific sport, it must match
      if (sport && snapshotSport !== sport && snapshotSport !== SPORT_KEY_MAP[sport]) {
        continue;
      }

      // If trigger has team/player, it must match (case insensitive partial match)
      if (team_or_player && !snapshotTeam.toLowerCase().includes(team_or_player.toLowerCase()) && !team_or_player.toLowerCase().includes(snapshotTeam.toLowerCase())) {
        continue;
      }

      // If trigger has bet type, it must match
      if (bet_type && snapshotBetType !== bet_type) {
        continue;
      }

      // Check odds value using comparator
      if (pollingService.compareOdds(odds_comparator, snapshotOddsValue, odds_value)) {
        console.log(`[findMatchingOdds] MATCH FOUND!`, {
          snapshotSport,
          snapshotTeam,
          snapshotBetType,
          snapshotOddsValue,
          comparison: `${snapshotOddsValue} ${odds_comparator} ${odds_value}`
        });
        matches.push(snapshot);
      }
    }

    console.log(`[findMatchingOdds] Total matches found: ${matches.length}`);
    return matches;
  },

  /**
   * Compare odds values based on the comparator
   */
  compareOdds(
    comparator: string,
    snapshotOddsValue: number,
    triggerOddsValue: number
  ): boolean {
    switch (comparator) {
      case "gt":
        return snapshotOddsValue > triggerOddsValue;
      case "lt":
        return snapshotOddsValue < triggerOddsValue;
      case "eq":
        return snapshotOddsValue === triggerOddsValue;
      case "gte":
        return snapshotOddsValue >= triggerOddsValue;
      case "lte":
        return snapshotOddsValue <= triggerOddsValue;
      default:
        return false;
    }
  }
};