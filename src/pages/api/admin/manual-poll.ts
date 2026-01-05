import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { oddsApiService } from "@/services/oddsApiService";

// Hardcoded API key for now
const ODDS_API_KEY = "8fd23ab732557e3db9238fc571eddbbe";

// Odds API Event Interface
interface OddsApiEvent {
  id: string;
  sport_key: string;
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
      }>;
    }>;
  }>;
}

// Trigger Interface (matching actual database schema)
interface Trigger {
  id: string;
  profile_id: string;
  sport: string;
  team_or_player: string;
  bet_type: string;
  odds_comparator: string;
  odds_value: string;
  frequency: string;
  status: string;
  vendor_id: string | null;
}

// Sport mapping
const SPORT_KEY_MAP: Record<string, string> = {
  NBA: "basketball_nba",
  NFL: "americanfootball_nfl",
  MLB: "baseball_mlb",
  NHL: "icehockey_nhl",
  NCAAB: "basketball_ncaab",
  NCAAF: "americanfootball_ncaaf"
};

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
      return res.status(401).json({ error: "Missing authorization token" });
    }

    const token = authHeader.substring(7);
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the user is an admin
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile || (profile.role !== "admin" && profile.role !== "super_admin")) {
      return res.status(403).json({ error: "Unauthorized - Admin access required" });
    }

    console.log("Starting manual poll and trigger check...");

    // Fetch all active triggers
    const { data: triggers, error: triggersError } = await supabase
      .from("triggers")
      .select("*")
      .eq("status", "active");

    if (triggersError) {
      console.error("Error fetching triggers:", triggersError);
      throw new Error(`Database Error: ${triggersError.message}`);
    }

    console.log(`Found ${triggers?.length || 0} active triggers to check`);

    if (!triggers || triggers.length === 0) {
      return res.status(200).json({
        checked: 0,
        hit: 0,
        message: "No active triggers to check"
      });
    }

    // Type assertion for triggers
    const typedTriggers = triggers as Trigger[];

    // 6. Group Triggers by Sport
    const triggersBySport: Record<string, Trigger[]> = {};
    
    for (const trigger of typedTriggers) {
      const sport = trigger.sport || 'upcoming';
      if (!triggersBySport[sport]) {
        triggersBySport[sport] = [];
      }
      triggersBySport[sport].push(trigger);
    }

    let totalChecked = 0;
    let totalHit = 0;

    // 7. Process Each Sport
    for (const [sport, sportTriggers] of Object.entries(triggersBySport)) {
      console.log(`🏈 Processing ${sportTriggers.length} triggers for sport: ${sport}`);

      try {
        // Map sport name to Odds API sport key
        const sportKeyMap: { [key: string]: string } = {
          'NBA': 'basketball_nba',
          'NFL': 'americanfootball_nfl',
          'MLB': 'baseball_mlb',
          'NHL': 'icehockey_nhl',
          'NCAAF': 'americanfootball_ncaaf',
          'NCAAB': 'basketball_ncaab',
        };

        const sportKey = sportKeyMap[sport.toUpperCase()] || sport.toLowerCase();
        
        // Fetch odds for this sport
        console.log(`Fetching odds for sport: ${sportKey}`);
        const events = await oddsApiService.getOddsForSport(sportKey, ODDS_API_KEY) as OddsApiEvent[];
        console.log(`Found ${events.length} events for ${sportKey}`);
        
        // 8. Check Each Trigger Against Events
        for (const trigger of sportTriggers) {
          totalChecked++;
          console.log(`🔍 Checking trigger: ${trigger.team_or_player} (${trigger.bet_type}) ${trigger.odds_comparator} ${trigger.odds_value}`);

          // Find all events that might contain this team
          const matchingEvents = events.filter((event: OddsApiEvent) => 
            event.home_team.includes(trigger.team_or_player) || 
            event.away_team.includes(trigger.team_or_player) ||
            trigger.team_or_player.includes(event.home_team) ||
            trigger.team_or_player.includes(event.away_team)
          );

          if (matchingEvents.length === 0) {
            console.log(`⚠️ No matching events found for: ${trigger.team_or_player}`);
            continue;
          }

          // Check each matching event
          for (const matchingEvent of matchingEvents) {
            // Extract odds from bookmakers
            let currentOdds: number | null = null;

            for (const bookmaker of matchingEvent.bookmakers) {
              const market = bookmaker.markets.find(m => {
                if (trigger.bet_type === "moneyline") return m.key === "h2h";
                if (trigger.bet_type === "spread") return m.key === "spreads";
                if (trigger.bet_type === "total" || trigger.bet_type === "totals") return m.key === "totals";
                return false;
              });

              if (market) {
                const outcome = market.outcomes.find(o => 
                  o.name === trigger.team_or_player ||
                  o.name.includes(trigger.team_or_player) ||
                  trigger.team_or_player.includes(o.name)
                );

                if (outcome) {
                  currentOdds = outcome.price;
                  console.log(`📊 Found odds for ${trigger.team_or_player}: ${currentOdds} (bookmaker: ${bookmaker.title})`);
                  break;
                }
              }
            }

            if (currentOdds === null) {
              console.log(`⚠️ No odds found for ${trigger.team_or_player} in event: ${matchingEvent.home_team} vs ${matchingEvent.away_team}`);
              continue;
            }

            // 9. Check Condition
            const thresholdValue = parseFloat(trigger.odds_value);
            let conditionMet = false;

            if (trigger.odds_comparator === ">=" && currentOdds >= thresholdValue) {
              conditionMet = true;
            } else if (trigger.odds_comparator === "<=" && currentOdds <= thresholdValue) {
              conditionMet = true;
            } else if (trigger.odds_comparator === ">" && currentOdds > thresholdValue) {
              conditionMet = true;
            } else if (trigger.odds_comparator === "<" && currentOdds < thresholdValue) {
              conditionMet = true;
            } else if (trigger.odds_comparator === "==" && currentOdds === thresholdValue) {
              conditionMet = true;
            }

            // 10. Create Alert if Condition Met
            if (conditionMet) {
              totalHit++;
              const eventName = `${matchingEvent.away_team} @ ${matchingEvent.home_team}`;
              console.log(`🎯 TRIGGER HIT: ${eventName} - ${trigger.team_or_player} @ ${currentOdds} (${trigger.odds_comparator} ${thresholdValue})`);

              await supabase.from("alerts").insert({
                trigger_id: trigger.id,
                profile_id: trigger.profile_id,
                message: `${eventName} - ${trigger.team_or_player} odds are now ${currentOdds} (condition: ${trigger.odds_comparator} ${thresholdValue})`,
                odds_value: currentOdds.toString(),
              });

              console.log(`✅ Alert created for trigger ${trigger.id}`);
            } else {
              console.log(`❌ Condition NOT met: ${currentOdds} ${trigger.odds_comparator} ${thresholdValue} = false`);
            }
          }
        }
      } catch (error: any) {
        console.error(`❌ Error processing ${sport}:`, error.message);
      }
    }

    console.log(`✅ Manual poll complete: ${totalChecked} checked, ${totalHit} hit`);

    return res.status(200).json({
      success: true,
      checked: totalChecked,
      hit: totalHit,
      message: `Checked ${totalChecked} triggers, ${totalHit} alerts created`
    });

  } catch (error: any) {
    console.error("❌ CRITICAL ERROR in manual-poll:", error);
    return res.status(500).json({ 
      error: "Internal Server Error",
      details: error.message,
    });
  }
}