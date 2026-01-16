import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { oddsApiService } from "@/services/oddsApiService";
import { apiSportsService } from "@/services/apiSportsService";

// Use local API key
const ODDS_API_KEY = "8fd23ab732557e3db9238fc571eddbbe";

// Zapier webhook URL for alert notifications
const ZAPIER_WEBHOOK_URL = "https://hooks.zapier.com/hooks/catch/7723146/u140xkd/";

// Odds API Event Interface
interface OddsApiEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Array<{
    key: string;
    title: string;
    markets: Array<{
      key: string;
      outcomes: Array<{
        name: string;
        price: number;
        point?: number;
      }>;
    }>;
  }>;
}

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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Get auth token from request
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const token = authHeader.replace("Bearer ", "");

    // Create Supabase client with user's token
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }
    );

    // Verify admin access
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || (profile.role !== "admin" && profile.role !== "super_admin")) {
      return res.status(403).json({ error: "Forbidden: Admin access required" });
    }

    console.log("=== Starting Manual Poll ===");

    // 1. Fetch all active triggers with their profile info
    const { data: profileTriggers, error: triggersError } = await supabase
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
        // Handle potential array wrapping from Supabase joins
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
      return res.status(200).json({
        success: true,
        message: "No active triggers found",
        triggersEvaluated: 0,
        hits: 0,
        snapshotsCreated: 0,
        matchesRecorded: 0,
        alertsSent: 0
      });
    }

    console.log(`Found ${triggers.length} active triggers`);

    // Group triggers by sport for efficient API calls
    const triggersBySport = (triggers as any[]).reduce<Record<string, DatabaseTrigger[]>>((acc, trigger) => {
      const sport = trigger.sport || "Unknown";
      if (!acc[sport]) {
        acc[sport] = [];
      }
      acc[sport].push(trigger as DatabaseTrigger);
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
    const triggersToComplete: string[] = []; // Track one-time triggers that hit

    // Map our sport names to Odds API sport keys
    const sportKeyMap: Record<string, string> = {
      "NBA": "basketball_nba",
      "NFL": "americanfootball_nfl",
      "MLB": "baseball_mlb",
      "NHL": "icehockey_nhl",
      "Soccer": "soccer_epl"
    };

    // Process each sport
    for (const [sport, sportTriggers] of Object.entries(triggersBySport)) {
      const sportKey = sportKeyMap[sport];
      if (!sportKey) {
        console.log(`No sport key mapping for ${sport}, skipping`);
        continue;
      }

      try {
        // Fetch odds for this sport
        console.log(`Fetching odds for sport: ${sport} (${sportKey})`);
        const [events, scores] = await Promise.all([
          oddsApiService.getOddsForSport(sportKey, ODDS_API_KEY),
          oddsApiService.getScores(sportKey, ODDS_API_KEY)
        ]);
        
        console.log(`Found ${events.length} events and ${scores.length} scores for ${sportKey}`);

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
          console.log(`Checking trigger ${trigger.id} for ${trigger.team_or_player}`);

          // Find matching events (team/player)
          const matchingEvents = eventsWithScores.filter(event =>
            trigger.team_or_player.toLowerCase().includes(event.home_team.toLowerCase()) ||
            trigger.team_or_player.toLowerCase().includes(event.away_team.toLowerCase())
          );

          if (matchingEvents.length === 0) {
            console.log(`No matching events found for ${trigger.team_or_player}`);
            continue;
          }

          console.log(`Found ${matchingEvents.length} matching events for ${trigger.team_or_player}`);

          // Process each matching event
          for (const event of matchingEvents) {
            // Filter markets by trigger's bet type
            const relevantMarkets = event.bookmakers
              .flatMap((bookmaker) => {
                // If trigger has a specific bookmaker, only use that one
                if (trigger.bookmaker && bookmaker.key !== trigger.bookmaker) {
                  return [];
                }

                return bookmaker.markets
                  .filter((market) => {
                    // Map bet types
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

            // Process each relevant market
            for (const market of relevantMarkets) {
              // Find the outcome for this team/player
              const outcome = market.outcomes.find(o =>
                o.name.toLowerCase().includes(trigger.team_or_player.toLowerCase())
              );

              if (!outcome) continue;

              const currentOdds = outcome.price;

              // Prepare odds snapshot data
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

              // Save odds snapshot
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
                console.log(`🎯 TRIGGER HIT! ${trigger.team_or_player} ${trigger.bet_type} ${trigger.odds_comparator} ${trigger.odds_value} (current: ${currentOdds})`);
                totalHit++;

                // Store trigger hit data (we'll link it to snapshot after insertion)
                triggerHits.push({
                  triggerId: trigger.id,
                  profileId: trigger.profile_id,
                  snapshotData,
                  trigger
                });

                // If this is a one-time trigger, mark it for completion
                if ((trigger as any).frequency === 'once') {
                  if (!triggersToComplete.includes(trigger.id)) {
                    triggersToComplete.push(trigger.id);
                  }
                }
              }
            }
          }
        }
      } catch (error: any) {
        console.error(`Error processing sport ${sport}:`, error);
        // Continue with other sports
      }
    }

    // Batch insert odds snapshots and get their IDs
    const triggerMatchesToInsert: TriggerMatchInsert[] = [];
    
    if (snapshotsToInsert.length > 0) {
      console.log(`Inserting ${snapshotsToInsert.length} odds snapshots`);
      const { data: insertedSnapshots, error: snapshotError } = await supabase
        .from("odds_snapshots")
        .insert(snapshotsToInsert)
        .select("id, sport, event_id, team_or_player, bookmaker, bet_type, odds_value");

      if (snapshotError) {
        console.error("Error inserting odds snapshots:", snapshotError);
      } else if (insertedSnapshots) {
        console.log(`✅ Successfully saved ${insertedSnapshots.length} odds snapshots`);

        // Match trigger hits with their corresponding snapshot IDs
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
      console.log(`Inserting ${triggerMatchesToInsert.length} trigger matches`);
      const { data, error: matchError } = await supabase
        .from("trigger_matches")
        .insert(triggerMatchesToInsert)
        .select();

      if (matchError) {
        console.error("Error inserting trigger matches:", matchError);
        console.error("Match error details:", JSON.stringify(matchError, null, 2));
        throw new Error(`Failed to insert trigger matches: ${matchError.message}`);
      } else {
        insertedMatches = data || [];
        console.log(`✅ Successfully created ${insertedMatches.length} trigger matches`);
        console.log("Inserted matches:", JSON.stringify(insertedMatches, null, 2));
      }
    }

    // Create alerts for each trigger match
    const alertsToInsert: any[] = [];
    if (insertedMatches.length > 0) {
      for (let i = 0; i < insertedMatches.length; i++) {
        const match = insertedMatches[i];
        const hit = triggerHits[i]; // Same order as insertion

        if (hit) {
          const { trigger, snapshotData } = hit;
          
          // Get detailed score data from API-Sports if available
          let scoreInfo = '';
          const event = snapshotData.event_data;
          
          if (event) {
            // Extract date from event commence_time (format: YYYY-MM-DD)
            const eventDate = event.commence_time.split('T')[0];
            
            try {
              // Fetch detailed game info from API-Sports
              const detailedScore = await apiSportsService.findGame(
                event.home_team,
                event.away_team,
                eventDate
              );
              
              if (detailedScore) {
                // Format the score
                const awayTeamName = detailedScore.awayTeam;
                const homeTeamName = detailedScore.homeTeam;
                const awayScore = detailedScore.awayScore;
                const homeScore = detailedScore.homeScore;
                
                // Format the time based on clock availability
                let timeInfo = '';
                if (detailedScore.clock && detailedScore.clock !== 'N/A') {
                  timeInfo = ` | Time: ${detailedScore.clock} left in Q${detailedScore.quarter}`;
                } else {
                  timeInfo = ` | Time: End of Q${detailedScore.quarter}`;
                }
                
                scoreInfo = ` | ${awayTeamName} ${awayScore} - ${homeTeamName} ${homeScore}${timeInfo}`;
              }
            } catch (error) {
              console.error('Error fetching detailed score from API-Sports:', error);
              // Fallback to Odds API score data if available
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
          
          // Generate descriptive alert message
          const message = `🎯 ${trigger.team_or_player} ${trigger.bet_type} ${trigger.odds_comparator} ${trigger.odds_value} HIT! Current odds: ${snapshotData.odds_value} on ${snapshotData.bookmaker}${scoreInfo}`;

          alertsToInsert.push({
            trigger_match_id: match.id,
            profile_id: trigger.profile_id,
            message,
            delivery_status: 'pending'
          });
        }
      }

      // Batch insert alerts
      if (alertsToInsert.length > 0) {
        console.log(`Creating ${alertsToInsert.length} alerts`);
        const { error: alertError } = await supabase
          .from("alerts")
          .insert(alertsToInsert);

        if (alertError) {
          console.error("Error creating alerts:", alertError);
          console.error("Alert error details:", JSON.stringify(alertError, null, 2));
          throw new Error(`Failed to create alerts: ${alertError.message}`);
        } else {
          console.log(`✅ Successfully created ${alertsToInsert.length} alerts`);
          
          // Send webhook notifications for each alert
          console.log(`Sending ${alertsToInsert.length} webhook notifications to Zapier`);
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
                console.error(`Failed to send webhook for profile ${alert.profile_id}:`, response.statusText);
              } else {
                console.log(`✅ Webhook sent successfully for profile ${alert.profile_id}`);
              }
            } catch (error) {
              console.error(`Error sending webhook for profile ${alert.profile_id}:`, error);
            }
          });

          // Wait for all webhooks to complete (but don't block on failures)
          await Promise.allSettled(webhookPromises);
          console.log(`✅ All webhook notifications processed`);
        }
      }
    }

    // Update one-time triggers to completed status
    if (triggersToComplete.length > 0) {
      console.log(`Marking ${triggersToComplete.length} one-time triggers as completed`);
      const { error: updateError } = await supabase
        .from("triggers")
        .update({ status: 'completed' })
        .in('id', triggersToComplete);

      if (updateError) {
        console.error("Error updating trigger status:", updateError);
      } else {
        console.log(`✅ Successfully marked ${triggersToComplete.length} triggers as completed`);
      }
    }

    console.log("=== Manual Poll Complete ===");
    console.log(`Checked: ${totalChecked}, Hit: ${totalHit}`);

    return res.status(200).json({
      checked: totalChecked,
      hit: totalHit,
      matches: triggerMatchesToInsert.length,
      alerts: alertsToInsert.length,
      message: `Checked ${totalChecked} triggers, ${totalHit} hits detected, ${triggerMatchesToInsert.length} matches recorded, ${alertsToInsert.length} alerts created`
    });

  } catch (error: any) {
    console.error("Manual poll error:", error);
    return res.status(500).json({ 
      error: "Internal Server Error",
      details: error.message,
    });
  }
}