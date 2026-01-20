import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { oddsApiService } from "@/services/oddsApiService";
import { apiSportsService } from "@/services/apiSportsService";

// Zapier webhook URL for alert notifications
const ZAPIER_WEBHOOK_URL = "https://hooks.zapier.com/hooks/catch/7723146/u140xkd/";

// Database Trigger Interface
interface DatabaseTrigger {
  id: string;
  profile_id: string;
  sport: string;
  team_or_player: string;
  bet_type: string;
  odds_comparator: string;
  odds_value: number;
  frequency: string;
  status: string;
  bookmaker?: string | null;
  vendor_id?: string | null;
  phone_e164: string;
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
        const isEnabled = await this.isPollingEnabled(supabaseClient);
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
      const { data: profileTriggers, error: profileTriggersError } = await supabaseClient
        .from("profile_triggers")
        .select(`
          profile_id,
          trigger_id,
          triggers!inner (
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

      // 3. Transform the data into a usable format
      const triggersWithProfiles = profileTriggers.map((pt) => ({
        ...pt.triggers,
        profile_id: pt.profile_id,
      }));

      console.log(`[PollingService] Processing ${triggersWithProfiles.length} triggers`);

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

      // 5. Store odds snapshots
      const snapshots = await this.storeOddsSnapshots(supabaseClient, oddsData);
      console.log(`[PollingService] Stored ${snapshots.length} odds snapshots`);

      // 6. Evaluate each trigger
      let matchesFound = 0;
      let alertsSent = 0;

      for (const trigger of triggersWithProfiles) {
        try {
          const matchingSnapshots = this.findMatchingOdds(trigger, snapshots);

          if (matchingSnapshots.length > 0) {
            console.log(
              `[PollingService] Found ${matchingSnapshots.length} matches for trigger ${trigger.id}`
            );

            // Store trigger matches
            for (const snapshot of matchingSnapshots) {
              const { error: matchError } = await supabaseClient
                .from("trigger_matches")
                .insert({
                  trigger_id: trigger.id,
                  odds_snapshot_id: snapshot.id,
                  matched_value: snapshot.odds_value,
                });

              if (!matchError) {
                matchesFound++;

                // Send alert
                const alertSent = await alertService.sendAlert(
                  supabaseClient,
                  trigger.profile_id,
                  trigger,
                  snapshot
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
  }
};