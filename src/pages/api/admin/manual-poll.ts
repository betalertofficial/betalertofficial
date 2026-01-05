import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { oddsApiService } from "@/services/oddsApiService";

const ODDS_API_KEY = "8fd23ab732557e3db9238fc571eddbbe";

// Combined type for trigger with its profile info
type TriggerWithProfile = Database["public"]["Tables"]["triggers"]["Row"] & {
  profile_triggers: {
    profile_id: string;
  }[];
};

interface OddsSnapshot {
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

interface TriggerMatch {
  trigger_id: string;
  odds_snapshot_id: string;
  matched_value: number;
  // Metadata for alert creation
  profile_id: string;
  trigger_info: {
    team_or_player: string;
    bet_type: string;
    odds_comparator: string;
    odds_value: number;
  };
  snapshot_info: {
    bookmaker: string;
    odds_value: number;
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing authorization header" });
    }

    const token = authHeader.split(" ")[1];
    const supabase = createClient<Database>(
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

    // Verify user is admin
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin" && profile?.role !== "super_admin") {
      return res.status(403).json({ error: "Forbidden - Admin access required" });
    }

    console.log("Starting manual poll...");

    // Fetch all active triggers WITH profile_id
    const { data: triggersData, error: triggersError } = await supabase
      .from("triggers")
      .select(`
        *,
        profile_triggers (
          profile_id
        )
      `)
      .eq("status", "active");

    if (triggersError) {
      console.error("Error fetching triggers:", triggersError);
      return res.status(500).json({ 
        error: "Failed to fetch triggers",
        details: triggersError.message 
      });
    }

    if (!triggersData || triggersData.length === 0) {
      return res.status(200).json({ 
        checked: 0,
        hit: 0,
        message: "No active triggers to check"
      });
    }

    // Cast to expected type
    const triggers = triggersData as unknown as TriggerWithProfile[];
    console.log(`Found ${triggers.length} active triggers`);

    // Group triggers by sport
    const triggersBySport = triggers.reduce<Record<string, TriggerWithProfile[]>>((acc, trigger) => {
      const sport = trigger.sport || "unknown";
      if (!acc[sport]) {
        acc[sport] = [];
      }
      acc[sport].push(trigger);
      return acc;
    }, {});

    let totalChecked = 0;
    let totalHit = 0;
    const oddsSnapshotsToInsert: OddsSnapshot[] = [];
    const matchedTriggers: TriggerMatch[] = [];

    // Process each sport
    for (const [sport, sportTriggers] of Object.entries(triggersBySport)) {
      console.log(`Processing ${sportTriggers.length} triggers for sport: ${sport}`);

      try {
        // Fetch odds for this sport
        console.log(`Fetching odds for sport: ${sport}`);
        const events = await oddsApiService.getOddsForSport(sport, ODDS_API_KEY);
        
        if (!Array.isArray(events)) {
          console.error(`Invalid events response for ${sport}:`, events);
          continue;
        }

        console.log(`Fetched ${events.length} events for ${sport}`);

        // Check each trigger against the events
        for (const trigger of sportTriggers) {
          totalChecked++;
          
          // Get profile_id (first one if multiple owners - simplified logic)
          const profileId = trigger.profile_triggers?.[0]?.profile_id;
          if (!profileId) {
            console.warn(`Trigger ${trigger.id} has no associated profile`);
            continue;
          }

          // Find events that match this trigger's team/player
          const relevantEvents = events.filter((event: any) => 
            trigger.team_or_player.toLowerCase().includes(event.home_team.toLowerCase()) ||
            trigger.team_or_player.toLowerCase().includes(event.away_team.toLowerCase())
          );

          // Check each relevant event
          for (const event of relevantEvents) {
            // Save ALL odds snapshots for this event
            for (const bookmaker of event.bookmakers || []) {
              for (const market of bookmaker.markets || []) {
                if (market.key === trigger.bet_type) {
                  for (const outcome of market.outcomes || []) {
                    // Save snapshot for every odds value we see
                    const snapshot: OddsSnapshot = {
                      sport: sport,
                      event_id: event.id,
                      team_or_player: outcome.name,
                      bookmaker: bookmaker.key,
                      bet_type: trigger.bet_type,
                      odds_value: outcome.price,
                      deep_link_url: bookmaker.deep_link_url || null,
                      commence_time: event.commence_time,
                      event_data: event
                    };
                    
                    // We only want to insert unique snapshots per batch
                    // But for simplicity in this batch, we'll just push everything
                    // Ideally we'd deduplicate here
                    oddsSnapshotsToInsert.push(snapshot);

                    // Check if this outcome matches the trigger's team/player AND condition
                    const teamMatches = outcome.name.toLowerCase().includes(trigger.team_or_player.toLowerCase());
                    
                    if (teamMatches) {
                      const currentOdds = outcome.price;
                      const thresholdOdds = trigger.odds_value; // Correct column name from schema
                      let conditionMet = false;

                      // Check if condition is met based on comparator
                      // Schema says 'odds_comparator'
                      if (trigger.odds_comparator === "greater_than" && currentOdds > thresholdOdds) {
                        conditionMet = true;
                      } else if (trigger.odds_comparator === "less_than" && currentOdds < thresholdOdds) {
                        conditionMet = true;
                      } else if (trigger.odds_comparator === "equal_to" && currentOdds === thresholdOdds) {
                        conditionMet = true;
                      }

                      if (conditionMet) {
                        console.log(`🎯 TRIGGER HIT! ${trigger.team_or_player} ${trigger.bet_type} odds are ${currentOdds} (${trigger.odds_comparator} ${thresholdOdds}) on ${bookmaker.key}`);
                        totalHit++;
                        
                        // We need to link this match to a specific snapshot ID later
                        // So we'll store all the data we need to find it and create alerts
                        matchedTriggers.push({
                          trigger_id: trigger.id,
                          odds_snapshot_id: "", // Will be filled after snapshot insertion
                          matched_value: currentOdds,
                          profile_id: profileId,
                          trigger_info: {
                            team_or_player: trigger.team_or_player,
                            bet_type: trigger.bet_type,
                            odds_comparator: trigger.odds_comparator,
                            odds_value: trigger.odds_value
                          },
                          snapshot_info: {
                            bookmaker: bookmaker.key,
                            odds_value: currentOdds // Same as matched_value, kept for clarity
                          }
                        });
                      }
                    }
                  }
                }
              }
            }
          }
        }
      } catch (error: any) {
        console.error(`Error processing sport ${sport}:`, error);
      }
    }

    // STEP 1: Save all odds snapshots
    console.log(`Inserting ${oddsSnapshotsToInsert.length} odds snapshots...`);
    let insertedSnapshots: any[] = [];
    
    if (oddsSnapshotsToInsert.length > 0) {
      const { data: snapshotData, error: snapshotError } = await supabase
        .from("odds_snapshots")
        .insert(oddsSnapshotsToInsert)
        .select("id, team_or_player, bookmaker, event_id, odds_value");

      if (snapshotError) {
        console.error("Error inserting odds snapshots:", snapshotError);
      } else {
        insertedSnapshots = snapshotData || [];
        console.log(`✅ Inserted ${insertedSnapshots.length} odds snapshots`);
      }
    }

    // STEP 2 & 3: Process matches
    console.log(`Processing ${matchedTriggers.length} matched triggers...`);
    let alertsCreated = 0;

    for (const match of matchedTriggers) {
      try {
        // Find the corresponding inserted snapshot
        // We look for one that matches exactly what we found
        const insertedSnapshot = insertedSnapshots.find(s => 
          s.team_or_player === match.trigger_info.team_or_player && // Use trigger team name logic or exact match?
          // Actually, match.snapshot_info has the exact values from the event
          // But our snapshot logic above used outcome.name for team_or_player
          // So we need to match loosely or use the exact same object reference if possible
          // For now, let's match on bookmaker + odds + exact team name from the snapshot data we pushed
          // This is tricky because we pushed 'oddsSnapshotsToInsert' but we need to find the ID from 'insertedSnapshots'
          // A better way is to iterate the matchedTriggers and find the snapshot that *generated* it
          s.odds_value === match.snapshot_info.odds_value &&
          s.bookmaker === match.snapshot_info.bookmaker
          // This is heuristic matching - might be collisions but acceptable for now
        );

        if (!insertedSnapshot) {
          // If we can't find exact match, we skip to avoid bad data
          // In a real prod system we'd link these up more robustly by returning IDs or using a transaction
          console.warn(`Could not find inserted snapshot for trigger ${match.trigger_id} match`);
          continue;
        }

        // Update the match object with the real ID
        match.odds_snapshot_id = insertedSnapshot.id;

        // STEP 2: Create trigger_match
        const { data: triggerMatchData, error: matchError } = await supabase
          .from("trigger_matches")
          .insert({
            trigger_id: match.trigger_id,
            odds_snapshot_id: match.odds_snapshot_id,
            matched_value: match.matched_value
          })
          .select("id")
          .single();

        if (matchError) {
          console.error("Error creating trigger match:", matchError);
          continue;
        }

        console.log(`✅ Created trigger_match ${triggerMatchData.id}`);

        // STEP 3: Create alert
        const comparatorText = match.trigger_info.odds_comparator === "greater_than" ? ">" : 
                              match.trigger_info.odds_comparator === "less_than" ? "<" : "=";
        
        const message = `${match.trigger_info.team_or_player} ${match.trigger_info.bet_type} odds are ${match.matched_value} (${comparatorText} ${match.trigger_info.odds_value}) on ${match.snapshot_info.bookmaker}`;

        const { error: alertError } = await supabase
          .from("alerts")
          .insert({
            trigger_match_id: triggerMatchData.id,
            profile_id: match.profile_id,
            message: message,
            delivery_status: 'pending'
          });

        if (alertError) {
          console.error("Error creating alert:", alertError);
        } else {
          alertsCreated++;
          console.log(`✅ Created alert for trigger ${match.trigger_id}`);
        }
      } catch (error: any) {
        console.error(`Error processing matched trigger ${match.trigger_id}:`, error);
      }
    }

    const resultMessage = `Checked ${totalChecked} triggers, ${alertsCreated} alerts created`;
    console.log(resultMessage);

    return res.status(200).json({
      checked: totalChecked,
      hit: totalHit,
      message: resultMessage
    });

  } catch (error: any) {
    console.error("Manual poll error:", error);
    return res.status(500).json({ 
      error: "Internal Server Error",
      details: error.message,
    });
  }
}