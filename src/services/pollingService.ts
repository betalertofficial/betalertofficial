import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { oddsApiService } from "./oddsApiService";
import { alertService } from "./alertService";
import { Database } from "@/integrations/supabase/types";

// Create a service-specific supabase client creator
const createServiceClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing Supabase credentials for PollingService");
  }

  return createClient<Database>(supabaseUrl, supabaseServiceKey);
};

export interface PollingResult {
  status: "success" | "skipped" | "failed";
  triggersEvaluated?: number;
  matchesFound?: number;
  alertsSent?: number;
  message?: string;
  duration?: number;
  debugLogs?: string[]; // Add debugLogs to interface
}

export const pollingService = {
  /**
   * Check if polling is enabled via admin settings
   */
  async isPollingEnabled(supabase: SupabaseClient<Database>): Promise<boolean> {
    const { data, error } = await supabase
      .from("admin_settings")
      .select("setting_value")
      .eq("setting_key", "odds_polling_status")
      .single();

    if (error) {
      console.error("Error checking polling status:", error);
      return false; // Default to disabled on error
    }

    return data?.setting_value === "true";
  },

  /**
   * Main polling function
   */
  async evaluateTriggers(): Promise<PollingResult> {
    const logs: string[] = [];
    const log = (msg: string) => {
      console.error(msg);
      logs.push(msg);
    };

    const logPrefix = `[PollingService]`;
    log(`${logPrefix} ========== STARTING TRIGGER EVALUATION ==========`);
    log(`${logPrefix} Starting trigger evaluation...`);
    
    const startTime = Date.now();

    // Check environment variables explicitly
    const hasUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
    const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
    log(`${logPrefix} Env check: URL=${hasUrl}, ServiceKey=${hasServiceKey}`);

    if (!hasUrl || !hasServiceKey) {
       return {
         status: "failed",
         message: "Missing Supabase credentials",
         debugLogs: logs
       };
    }
    
    const supabase = createServiceClient();
    
    log(`${logPrefix} Supabase client created successfully`);
    
    let evaluationRunId: string | null = null;
    
    // Stats tracking
    let triggersEvaluated = 0;
    let matchesFound = 0;
    let alertsSent = 0;

    try {
      // 1. Create evaluation run record
      const { data: runData, error: runError } = await supabase
        .from("evaluation_runs")
        .insert({
          status: "running",
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (runError) {
        log(`${logPrefix} Error creating run record: ${runError.message}`);
        // Continue anyway, just logging locally
      } else {
        evaluationRunId = runData?.id;
      }

      // 2. STEP 1: Fetch ALL active triggers directly
      log(`${logPrefix} Querying triggers table for status='active' (case-insensitive)...`);
      
      // using ilike to be case-insensitive safely
      const { data: activeTriggers, error: triggerError } = await supabase
        .from("triggers")
        .select("*")
        .ilike("status", "active");

      log(`${logPrefix} Query completed. Error: ${triggerError ? triggerError.message : "none"}`);
      log(`${logPrefix} Raw data received: ${activeTriggers ? `${activeTriggers.length} records` : "null/undefined"}`);

      if (triggerError) throw triggerError;

      if (!activeTriggers || activeTriggers.length === 0) {
        log(`${logPrefix} No active triggers found. (Query returned 0 rows)`);
        
        // Debug: Check total triggers count just to be sure
        const { count } = await supabase.from("triggers").select("*", { count: 'exact', head: true });
        log(`${logPrefix} DEBUG: Total triggers in table: ${count}`);
        
        // Debug: Show sample status values to check case sensitivity
        const { data: sampleTriggers } = await supabase.from("triggers").select("id, status").limit(5);
        log(`${logPrefix} DEBUG: Sample status values: ${JSON.stringify(sampleTriggers?.map(t => `${t.id}: "${t.status}"`))}`);

        await this.completeRun(supabase, evaluationRunId, 0, 0, 0, startTime);
        return { 
          status: "success", 
          triggersEvaluated: 0, 
          matchesFound: 0, 
          alertsSent: 0,
          message: "No active triggers found",
          debugLogs: logs
        };
      }

      log(`${logPrefix} Found ${activeTriggers.length} active triggers directly from table.`);
      triggersEvaluated = activeTriggers.length;

      // 3. STEP 2: Fetch Profile Connections for these triggers
      const triggerIds = activeTriggers.map(t => t.id);
      const { data: profileConnections, error: connectionError } = await supabase
        .from("profile_triggers")
        .select(`
          trigger_id,
          profile_id,
          profiles (
            phone_e164
          )
        `)
        .in("trigger_id", triggerIds);

      if (connectionError) throw connectionError;

      // Map trigger IDs to their profile data
      const triggerProfileMap = new Map();
      profileConnections?.forEach(pc => {
        // Handle array or single object response for profiles
        const profile = Array.isArray(pc.profiles) ? pc.profiles[0] : pc.profiles;
        if (profile && profile.phone_e164) {
          triggerProfileMap.set(pc.trigger_id, {
            profileId: pc.profile_id,
            phone: profile.phone_e164
          });
        }
      });
      
      log(`${logPrefix} Mapped ${triggerProfileMap.size} triggers to profiles.`);

      // 4. Group triggers by Sport to minimize API calls
      const triggersBySport: Record<string, typeof activeTriggers> = {};
      activeTriggers.forEach(trigger => {
        const sport = trigger.sport;
        if (!triggersBySport[sport]) {
          triggersBySport[sport] = [];
        }
        triggersBySport[sport].push(trigger);
      });

      // 5. Evaluate per sport
      for (const [sport, sportTriggers] of Object.entries(triggersBySport)) {
        try {
          log(`${logPrefix} Fetching odds for sport: ${sport}`);
          const events = await oddsApiService.getOddsForSport(sport);
          log(`${logPrefix} Got ${events.length} events for ${sport}`);
          
          for (const trigger of sportTriggers) {
            // Get profile info from our map
            const profileInfo = triggerProfileMap.get(trigger.id);
            
            // If we can't find who owns this trigger, we can't alert them, but we still evaluated the trigger logic
            if (!profileInfo) {
              log(`${logPrefix} Trigger ${trigger.id} has no valid profile/phone linked. Skipping alert check.`);
              continue;
            }

            // Find matching event for team/player
            const event = events.find(e => 
              e.home_team.toLowerCase().includes(trigger.team_or_player.toLowerCase()) ||
              e.away_team.toLowerCase().includes(trigger.team_or_player.toLowerCase())
            );

            if (!event) continue;

            // Check odds based on bet type
            let relevantOdds: { bookmaker: string; odds: number; point?: number }[] = [];
            
            if (trigger.bet_type === 'h2h') {
              relevantOdds = oddsApiService.extractMoneylineOdds(event, trigger.team_or_player);
            } else if (trigger.bet_type === 'spreads') {
              relevantOdds = oddsApiService.extractSpreadOdds(event, trigger.team_or_player);
            } else if (trigger.bet_type === 'totals') {
              relevantOdds = [
                ...oddsApiService.extractTotalsOdds(event, "over"),
                ...oddsApiService.extractTotalsOdds(event, "under")
              ];
            }

            // Filter by bookmaker if specified
            if (trigger.bookmaker) {
              relevantOdds = relevantOdds.filter(o => 
                o.bookmaker.toLowerCase().includes(trigger.bookmaker!.toLowerCase())
              );
            }

            // Check comparator
            const match = relevantOdds.find(odd => {
              if (trigger.odds_comparator === 'greater_than') {
                return odd.odds > trigger.odds_value;
              } else {
                return odd.odds < trigger.odds_value;
              }
            });

            if (match) {
              matchesFound++;
              log(`${logPrefix} Match found for trigger ${trigger.id}: ${match.odds} ${trigger.odds_comparator} ${trigger.odds_value}`);

              const message = `Bet Alert! ${trigger.team_or_player} ${trigger.bet_type} odds: ${match.odds} (Target: ${trigger.odds_value}) at ${match.bookmaker}`;
              
              const triggerMatchId = crypto.randomUUID();

              // Send Alert
              await alertService.sendWebhookAlert({
                trigger_id: trigger.id,
                trigger_match_id: triggerMatchId,
                recipient_profile_id: profileInfo.profileId,
                message: message,
                fired_value: match.odds,
                fired_context: match,
                sport: sport,
                team: trigger.team_or_player,
                vendor: "odds-api",
                bookmakers: [match.bookmaker],
                timestamp: new Date().toISOString()
              });

              // Create DB Alert Record
              try {
                 await alertService.createAlert(
                  profileInfo.profileId,
                  triggerMatchId,
                  message
                );
              } catch (alertError) {
                console.error("Error creating alert record:", alertError);
                // Don't fail the whole run just because DB record failed, webhook was sent
              }

              alertsSent++;
            }
          }
        } catch (err: any) {
          log(`${logPrefix} Error processing sport ${sport}: ${err.message}`);
        }
      }

      // 6. Complete run
      await this.completeRun(
        supabase, 
        evaluationRunId, 
        triggersEvaluated, 
        matchesFound, 
        alertsSent, 
        startTime
      );

      return {
        status: "success",
        triggersEvaluated,
        matchesFound,
        alertsSent,
        duration: Date.now() - startTime,
        debugLogs: logs
      };

    } catch (error: any) {
      log(`${logPrefix} Critical error: ${error.message}`);
      
      if (evaluationRunId) {
        await supabase
          .from("evaluation_runs")
          .update({
            status: "failed",
            error_message: error.message,
            completed_at: new Date().toISOString(),
            duration_ms: Date.now() - startTime
          })
          .eq("id", evaluationRunId);
      }
      
      throw error;
    }
  },

  async completeRun(
    supabase: SupabaseClient<Database>, 
    runId: string, 
    evaluated: number, 
    matches: number, 
    sent: number, 
    startTime: number
  ) {
    if (!runId) return;
    
    await supabase
      .from("evaluation_runs")
      .update({
        status: "completed",
        triggers_evaluated: evaluated,
        matches_found: matches,
        alerts_sent: sent,
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startTime
      })
      .eq("id", runId);
  }
};