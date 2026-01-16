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
    logPrefix: string = "[POLLING]"
  ): Promise<PollingResult> {
    console.log(`${logPrefix} Starting trigger evaluation...`);

    try {
      // Check if polling is enabled
      const pollingEnabled = await this.isPollingEnabled(supabaseClient);
      if (!pollingEnabled) {
        console.log(`${logPrefix} Polling is disabled in admin_settings. Skipping evaluation.`);
        return {
          success: true,
          checked: 0,
          hit: 0,
          matches: 0,
          alerts: 0,
          message: "Polling disabled in admin_settings",
          pollingDisabled: true
        };
      }

      // 1. Fetch all active triggers with their profile info
      const { data: profileTriggers, error: triggersError } = await supabaseClient
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
            vendor_id
          ),
          profiles!profile_triggers_profile_id_fkey (
            phone_e164
          )
        `)
        .eq("triggers.status", "active");

      if (triggersError || !profileTriggers) {
        throw new Error(`Failed to fetch triggers: ${triggersError?.message}`);
      }

      // Transform the nested structure into flat triggers array
      const triggers: DatabaseTrigger[] = profileTriggers
        .map((pt: any): DatabaseTrigger | null => {
          const trigger = Array.isArray(pt.triggers) ? pt.triggers[0] : pt.triggers;
          const profile = Array.isArray(pt.profiles) ? pt.profiles[0] : pt.profiles;

          if (!trigger || !profile) return null;

          return {
            id: trigger.id,
            profile_id: pt.profile_id,
            sport: trigger.sport,
            team_or_player: trigger.team_or_player,
            bet_type: trigger.bet_type,
            odds_comparator: trigger.odds_comparator,
            odds_value: trigger.odds_value,
            frequency: trigger.frequency,
            status: trigger.status,
            bookmaker: trigger.bookmaker,
            vendor_id: trigger.vendor_id,
            phone_e164: profile.phone_e164
          };
        })
        .filter((t): t is DatabaseTrigger => t !== null);

      if (triggers.length === 0) {
        console.log(`${logPrefix} No active triggers found`);
        return {
          success: true,
          checked: 0,
          hit: 0,
          matches: 0,
          alerts: 0,
          message: "No active triggers found"
        };
      }

      console.log(`${logPrefix} Found ${triggers.length} active triggers`);

      // Group triggers by sport for efficient API calls
      const triggersBySport = triggers.reduce<Record<string, DatabaseTrigger[]>>((acc, trigger) => {
        const sport = trigger.sport || "Unknown";
        if (!acc[sport]) {
          acc[sport] = [];
        }
        acc[sport].push(trigger);
        return acc;
      }, {});

      let totalChecked = 0;
      let totalHit = 0;
      const snapshotsToInsert: OddsSnapshotInsert[] = [];
      const triggerHits: Array<{ 
        triggerId: string; 
        profileId: string;
        snapshotData: OddsSnapshotInsert;
        trigger: DatabaseTrigger;
      }> = [];
      const triggersToComplete: string[] = [];

      // Process each sport
      for (const [sport, sportTriggers] of Object.entries(triggersBySport)) {
        const sportKey = SPORT_KEY_MAP[sport];
        if (!sportKey) {
          console.log(`${logPrefix} No sport key mapping for ${sport}, skipping`);
          continue;
        }

        try {
          console.log(`${logPrefix} Fetching odds for sport: ${sport} (${sportKey})`);
          const [events, scores] = await Promise.all([
            oddsApiService.getOddsForSport(sportKey, oddsApiKey),
            oddsApiService.getScores(sportKey, oddsApiKey)
          ]);
          
          console.log(`${logPrefix} Found ${events.length} events and ${scores.length} scores for ${sportKey}`);

          // Merge score data with events
          const eventsWithScores = events.map(event => {
            const scoreData = scores.find(score => score.id === event.id);
            return {
              ...event,
              score_data: scoreData
            };
          });

          // Check each trigger against the events
          for (const trigger of sportTriggers) {
            totalChecked++;
            console.log(`${logPrefix} Checking trigger ${trigger.id} for ${trigger.team_or_player}`);

            // Find matching events (team/player)
            const matchingEvents = eventsWithScores.filter(event =>
              trigger.team_or_player.toLowerCase().includes(event.home_team.toLowerCase()) ||
              trigger.team_or_player.toLowerCase().includes(event.away_team.toLowerCase())
            );

            if (matchingEvents.length === 0) {
              console.log(`${logPrefix} No matching events found for ${trigger.team_or_player}`);
              continue;
            }

            console.log(`${logPrefix} Found ${matchingEvents.length} matching events for ${trigger.team_or_player}`);

            // Process each matching event
            for (const event of matchingEvents) {
              const relevantMarkets = event.bookmakers
                .flatMap((bookmaker) => {
                  if (trigger.bookmaker && bookmaker.key !== trigger.bookmaker) {
                    return [];
                  }

                  return bookmaker.markets
                    .filter((market) => {
                      if (trigger.bet_type === "moneyline" && market.key === "h2h") return true;
                      if (trigger.bet_type === "spread" && market.key === "spreads") return true;
                      if (trigger.bet_type === "total" && market.key === "totals") return true;
                      return false;
                    })
                    .map((market) => ({
                      ...market,
                      bookmaker_key: bookmaker.key,
                      bookmaker_title: bookmaker.title
                    }));
                });

              for (const market of relevantMarkets) {
                const outcome = market.outcomes.find(o =>
                  o.name.toLowerCase().includes(trigger.team_or_player.toLowerCase())
                );

                if (!outcome) continue;

                const currentOdds = outcome.price;

                const snapshotData: OddsSnapshotInsert = {
                  sport: trigger.sport,
                  event_id: event.id,
                  team_or_player: trigger.team_or_player,
                  bookmaker: market.bookmaker_title,
                  bet_type: trigger.bet_type,
                  odds_value: currentOdds,
                  deep_link_url: null,
                  commence_time: event.commence_time,
                  event_data: event
                };

                snapshotsToInsert.push(snapshotData);

                // Check if trigger condition is met
                let conditionMet = false;
                switch (trigger.odds_comparator) {
                  case ">=":
                    conditionMet = currentOdds >= trigger.odds_value;
                    break;
                  case "<=":
                    conditionMet = currentOdds <= trigger.odds_value;
                    break;
                  case ">":
                    conditionMet = currentOdds > trigger.odds_value;
                    break;
                  case "<":
                    conditionMet = currentOdds < trigger.odds_value;
                    break;
                  case "==":
                    conditionMet = currentOdds === trigger.odds_value;
                    break;
                }

                if (conditionMet) {
                  console.log(`${logPrefix} 🎯 TRIGGER HIT! ${trigger.team_or_player} ${trigger.bet_type} ${trigger.odds_comparator} ${trigger.odds_value} (current: ${currentOdds})`);
                  totalHit++;

                  triggerHits.push({
                    triggerId: trigger.id,
                    profileId: trigger.profile_id,
                    snapshotData,
                    trigger
                  });

                  if (trigger.frequency === 'once') {
                    if (!triggersToComplete.includes(trigger.id)) {
                      triggersToComplete.push(trigger.id);
                    }
                  }
                }
              }
            }
          }
        } catch (error: any) {
          console.error(`${logPrefix} Error processing sport ${sport}:`, error);
        }
      }

      // Batch insert odds snapshots
      const triggerMatchesToInsert: TriggerMatchInsert[] = [];
      
      if (snapshotsToInsert.length > 0) {
        console.log(`${logPrefix} Inserting ${snapshotsToInsert.length} odds snapshots`);
        const { data: insertedSnapshots, error: snapshotError } = await supabaseClient
          .from("odds_snapshots")
          .insert(snapshotsToInsert)
          .select("id, sport, event_id, team_or_player, bookmaker, bet_type, odds_value");

        if (snapshotError) {
          console.error(`${logPrefix} Error inserting odds snapshots:`, snapshotError);
        } else if (insertedSnapshots) {
          console.log(`${logPrefix} ✅ Successfully saved ${insertedSnapshots.length} odds snapshots`);

          for (const hit of triggerHits) {
            const matchingSnapshot = insertedSnapshots.find(snapshot =>
              snapshot.sport === hit.snapshotData.sport &&
              snapshot.event_id === hit.snapshotData.event_id &&
              snapshot.team_or_player === hit.snapshotData.team_or_player &&
              snapshot.bookmaker === hit.snapshotData.bookmaker &&
              snapshot.bet_type === hit.snapshotData.bet_type &&
              snapshot.odds_value === hit.snapshotData.odds_value
            );

            if (matchingSnapshot) {
              triggerMatchesToInsert.push({
                trigger_id: hit.triggerId,
                odds_snapshot_id: matchingSnapshot.id,
                matched_value: hit.snapshotData.odds_value
              });
            }
          }
        }
      }

      // Insert trigger matches
      let insertedMatches: any[] = [];
      if (triggerMatchesToInsert.length > 0) {
        console.log(`${logPrefix} Inserting ${triggerMatchesToInsert.length} trigger matches`);
        const { data, error: matchError } = await supabaseClient
          .from("trigger_matches")
          .insert(triggerMatchesToInsert)
          .select();

        if (matchError) {
          console.error(`${logPrefix} Error inserting trigger matches:`, matchError);
          throw new Error(`Failed to insert trigger matches: ${matchError.message}`);
        } else {
          insertedMatches = data || [];
          console.log(`${logPrefix} ✅ Successfully created ${insertedMatches.length} trigger matches`);
        }
      }

      // Create alerts for each trigger match
      const alertsToInsert: any[] = [];
      if (insertedMatches.length > 0) {
        for (let i = 0; i < insertedMatches.length; i++) {
          const match = insertedMatches[i];
          const hit = triggerHits[i];

          if (hit) {
            const { trigger, snapshotData } = hit;
            
            let scoreInfo = '';
            const event = snapshotData.event_data;
            
            if (event) {
              const eventDate = event.commence_time.split('T')[0];
              
              try {
                const detailedScore = await apiSportsService.findGame(
                  event.home_team,
                  event.away_team,
                  eventDate
                );
                
                if (detailedScore) {
                  const awayTeamName = detailedScore.awayTeam;
                  const homeTeamName = detailedScore.homeTeam;
                  const awayScore = detailedScore.awayScore;
                  const homeScore = detailedScore.homeScore;
                  
                  let timeInfo = '';
                  if (detailedScore.clock && detailedScore.clock !== 'N/A') {
                    timeInfo = ` | Time: ${detailedScore.clock} left in Q${detailedScore.quarter}`;
                  } else {
                    timeInfo = ` | Time: End of Q${detailedScore.quarter}`;
                  }
                  
                  scoreInfo = ` | ${awayTeamName} ${awayScore} - ${homeTeamName} ${homeScore}${timeInfo}`;
                }
              } catch (error) {
                console.error(`${logPrefix} Error fetching detailed score from API-Sports:`, error);
                if (event.score_data?.scores && event.score_data.scores.length > 0) {
                  const homeScore = event.score_data.scores.find((s: any) => s.name === event.home_team);
                  const awayScore = event.score_data.scores.find((s: any) => s.name === event.away_team);
                  
                  if (homeScore && awayScore) {
                    const status = event.score_data.completed ? '(Final)' : '(Live)';
                    scoreInfo = ` | Score: ${awayScore.name} ${awayScore.score} - ${homeScore.name} ${homeScore.score} ${status}`;
                  }
                }
              }
            }
            
            const message = `🎯 ${trigger.team_or_player} ${trigger.bet_type} ${trigger.odds_comparator} ${trigger.odds_value} HIT! Current odds: ${snapshotData.odds_value} on ${snapshotData.bookmaker}${scoreInfo}`;

            alertsToInsert.push({
              trigger_match_id: match.id,
              profile_id: trigger.profile_id,
              message,
              delivery_status: 'pending'
            });
          }
        }

        if (alertsToInsert.length > 0) {
          console.log(`${logPrefix} Creating ${alertsToInsert.length} alerts`);
          const { error: alertError } = await supabaseClient
            .from("alerts")
            .insert(alertsToInsert);

          if (alertError) {
            console.error(`${logPrefix} Error creating alerts:`, alertError);
            throw new Error(`Failed to create alerts: ${alertError.message}`);
          } else {
            console.log(`${logPrefix} ✅ Successfully created ${alertsToInsert.length} alerts`);
            
            console.log(`${logPrefix} Sending ${alertsToInsert.length} webhook notifications to Zapier`);
            const webhookPromises = alertsToInsert.map(async (alert) => {
              try {
                const response = await fetch(ZAPIER_WEBHOOK_URL, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    profile_id: alert.profile_id,
                    message: alert.message,
                    trigger_match_id: alert.trigger_match_id,
                    timestamp: new Date().toISOString()
                  }),
                });

                if (!response.ok) {
                  console.error(`${logPrefix} Failed to send webhook for profile ${alert.profile_id}:`, response.statusText);
                } else {
                  console.log(`${logPrefix} ✅ Webhook sent successfully for profile ${alert.profile_id}`);
                }
              } catch (error) {
                console.error(`${logPrefix} Error sending webhook for profile ${alert.profile_id}:`, error);
              }
            });

            await Promise.allSettled(webhookPromises);
            console.log(`${logPrefix} ✅ All webhook notifications processed`);
          }
        }
      }

      // Update one-time triggers to completed status
      if (triggersToComplete.length > 0) {
        console.log(`${logPrefix} Marking ${triggersToComplete.length} one-time triggers as completed`);
        const { error: updateError } = await supabaseClient
          .from("triggers")
          .update({ status: 'completed' })
          .in('id', triggersToComplete);

        if (updateError) {
          console.error(`${logPrefix} Error updating trigger status:`, updateError);
        } else {
          console.log(`${logPrefix} ✅ Successfully marked ${triggersToComplete.length} triggers as completed`);
        }
      }

      console.log(`${logPrefix} Evaluation complete - Checked: ${totalChecked}, Hit: ${totalHit}`);

      return {
        success: true,
        checked: totalChecked,
        hit: totalHit,
        matches: triggerMatchesToInsert.length,
        alerts: alertsToInsert.length,
        message: `Checked ${totalChecked} triggers, ${totalHit} hits detected, ${triggerMatchesToInsert.length} matches recorded, ${alertsToInsert.length} alerts created`
      };

    } catch (error: any) {
      console.error(`${logPrefix} Error during evaluation:`, error.message);
      throw error;
    }
  }
};