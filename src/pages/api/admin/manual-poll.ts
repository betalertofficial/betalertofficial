import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { oddsApiService } from "@/services/oddsApiService";

// Use local API key
const ODDS_API_KEY = "8fd23ab732557e3db9238fc571eddbbe";

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
  status: string;
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

    // Fetch all active triggers
    const { data: triggers, error: triggersError } = await supabase
      .from("triggers")
      .select("*")
      .eq("status", "active");

    if (triggersError) {
      console.error("Error fetching triggers:", triggersError);
      throw new Error(`Failed to fetch triggers: ${triggersError.message}`);
    }

    if (!triggers || triggers.length === 0) {
      return res.status(200).json({
        checked: 0,
        hit: 0,
        message: "No active triggers to check"
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
    const snapshotsToInsert: any[] = [];
    const alertsToInsert: any[] = [];

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
        const events = await oddsApiService.getOddsForSport(sportKey, ODDS_API_KEY) as OddsApiEvent[];
        console.log(`Found ${events.length} events for ${sportKey}`);

        // Check each trigger against the events
        for (const trigger of sportTriggers) {
          totalChecked++;
          console.log(`Checking trigger ${trigger.id} for ${trigger.team_or_player}`);

          // Find matching events (team/player)
          const matchingEvents = events.filter(event =>
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
            // Extract odds for this bet type from all bookmakers
            for (const bookmaker of event.bookmakers) {
              const market = bookmaker.markets.find(m => {
                if (trigger.bet_type === "moneyline") return m.key === "h2h";
                if (trigger.bet_type === "spread") return m.key === "spreads";
                if (trigger.bet_type === "totals") return m.key === "totals";
                return false;
              });

              if (!market) continue;

              // Find the outcome for this team/player
              const outcome = market.outcomes.find(o =>
                o.name.toLowerCase().includes(trigger.team_or_player.toLowerCase())
              );

              if (!outcome) continue;

              const currentOdds = outcome.price;

              // Save odds snapshot
              snapshotsToInsert.push({
                sport: trigger.sport,
                event_id: event.id,
                team_or_player: trigger.team_or_player,
                bookmaker: bookmaker.title,
                bet_type: trigger.bet_type,
                odds_value: currentOdds,
                deep_link_url: null,
                commence_time: event.commence_time,
                event_data: event
              });

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

                // Create alert message
                const message = `${trigger.team_or_player} ${trigger.bet_type} odds are ${currentOdds} (${trigger.odds_comparator} ${trigger.odds_value}) on ${bookmaker.title}`;

                alertsToInsert.push({
                  trigger_id: trigger.id,
                  profile_id: trigger.profile_id,
                  message,
                  odds_value: currentOdds,
                  bookmaker: bookmaker.title,
                  event_id: event.id,
                  sport: trigger.sport,
                  team_or_player: trigger.team_or_player,
                  bet_type: trigger.bet_type
                });
              }
            }
          }
        }
      } catch (error: any) {
        console.error(`Error processing sport ${sport}:`, error);
        // Continue with other sports
      }
    }

    // Batch insert odds snapshots
    if (snapshotsToInsert.length > 0) {
      console.log(`Inserting ${snapshotsToInsert.length} odds snapshots`);
      const { error: snapshotError } = await supabase
        .from("odds_snapshots")
        .insert(snapshotsToInsert);

      if (snapshotError) {
        console.error("Error inserting odds snapshots:", snapshotError);
      } else {
        console.log(`✅ Successfully saved ${snapshotsToInsert.length} odds snapshots`);
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
      } else {
        console.log(`✅ Successfully created ${alertsToInsert.length} alerts`);
      }
    }

    console.log("=== Manual Poll Complete ===");
    console.log(`Checked: ${totalChecked}, Hit: ${totalHit}`);

    return res.status(200).json({
      checked: totalChecked,
      hit: totalHit,
      message: `Checked ${totalChecked} triggers, ${alertsToInsert.length} alerts created`
    });

  } catch (error: any) {
    console.error("Manual poll error:", error);
    return res.status(500).json({ 
      error: "Internal Server Error",
      details: error.message,
    });
  }
}