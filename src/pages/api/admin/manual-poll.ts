import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { oddsApiService } from "@/services/oddsApiService";

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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    console.log("🔍 Manual poll request received");

    // 1. Validate Required Environment Variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const oddsApiKey = process.env.ODDS_API_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("❌ Missing Supabase configuration");
      return res.status(500).json({ 
        error: "Configuration Error", 
        details: "Supabase credentials not configured" 
      });
    }

    if (!oddsApiKey) {
      console.error("❌ Missing Odds API key");
      return res.status(500).json({ 
        error: "Configuration Error", 
        details: "Odds API key not configured in environment variables" 
      });
    }

    console.log("✅ Retrieved Odds API key from environment variables");

    // 2. Create Supabase Admin Client (Service Role)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 3. Validate Authentication (Optional - check if user is admin)
    const authHeader = req.headers.authorization;
    if (authHeader && typeof authHeader === 'string') {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
      
      if (!userError && user) {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        if (profile?.role !== "admin" && profile?.role !== "super_admin") {
          return res.status(403).json({ 
            error: "Access Denied", 
            details: "Admin privileges required" 
          });
        }
      }
    }

    console.log("✅ Authentication successful, starting trigger evaluation");

    // 4. Fetch Active Triggers
    const { data: triggersData, error: triggersError } = await supabaseAdmin
      .from("triggers")
      .select("id, profile_id, sport, team_or_player, bet_type, odds_comparator, odds_value, frequency, status, vendor_id")
      .eq("status", "active");

    if (triggersError) {
      console.error("❌ Error fetching triggers:", triggersError);
      return res.status(500).json({ 
        error: "Database Error", 
        details: triggersError.message 
      });
    }

    const triggers: Trigger[] = triggersData || [];
    console.log(`📊 Found ${triggers.length} active triggers`);

    if (triggers.length === 0) {
      return res.status(200).json({
        success: true,
        checked: 0,
        hit: 0,
        message: "No active triggers to check"
      });
    }

    // 5. Group Triggers by Sport
    const triggersBySport = triggers.reduce((acc: { [key: string]: Trigger[] }, trigger) => {
      const sport = trigger.sport || 'upcoming';
      if (!acc[sport]) {
        acc[sport] = [];
      }
      acc[sport].push(trigger);
      return acc;
    }, {});

    let totalChecked = 0;
    let totalHit = 0;

    // 6. Process Each Sport
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
        const events = await oddsApiService.getOddsForSport(sportKey, oddsApiKey);
        console.log(`Found ${events.length} events for ${sportKey}`);

        // 7. Check Each Trigger Against Events
        for (const trigger of sportTriggers) {
          totalChecked++;
          console.log(`🔍 Checking trigger: ${trigger.team_or_player} (${trigger.bet_type}) ${trigger.odds_comparator} ${trigger.odds_value}`);

          // Find all events that might contain this team
          const matchingEvents = events.filter(event => 
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

            // 8. Check Condition
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

            // 9. Create Alert if Condition Met
            if (conditionMet) {
              totalHit++;
              const eventName = `${matchingEvent.away_team} @ ${matchingEvent.home_team}`;
              console.log(`🎯 TRIGGER HIT: ${eventName} - ${trigger.team_or_player} @ ${currentOdds} (${trigger.odds_comparator} ${thresholdValue})`);

              await supabaseAdmin.from("alerts").insert({
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