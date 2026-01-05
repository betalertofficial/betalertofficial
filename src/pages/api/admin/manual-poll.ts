import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

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

// Trigger Interface
interface Trigger {
  id: string;
  user_id: string;
  sport: string;
  event_name: string;
  bet_type: string;
  team_player: string;
  condition: string;
  threshold: number;
  is_active: boolean;
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
      console.error("❌ ODDS_API_KEY is missing");
      return res.status(500).json({ 
        error: "Configuration Error", 
        details: "ODDS_API_KEY not configured" 
      });
    }

    // 2. Validate Authentication (User must be logged in)
    const authHeader = req.headers.authorization;
    console.log("🔑 Auth header present:", !!authHeader);

    if (!authHeader || typeof authHeader !== 'string') {
      return res.status(401).json({ 
        error: "Unauthorized", 
        details: "Missing Authorization header" 
      });
    }

    // Create client with user token for auth check
    const supabaseUser = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: {
        headers: { Authorization: authHeader }
      }
    });

    // Verify user is authenticated
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    
    console.log("👤 User check:", { 
      userId: user?.id, 
      hasError: !!userError,
      errorMessage: userError?.message 
    });

    if (userError || !user) {
      return res.status(401).json({ 
        error: "Unauthorized", 
        details: userError?.message || "Invalid or expired token" 
      });
    }

    // 3. Create Admin Client (Service Role for privileged operations)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 4. Verify User is Admin
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    console.log("🛡️ Admin check:", { 
      role: profile?.role,
      hasError: !!profileError 
    });

    if (profileError || !profile) {
      return res.status(403).json({ 
        error: "Access Denied", 
        details: "Profile not found" 
      });
    }

    if (profile.role !== "admin" && profile.role !== "super_admin") {
      return res.status(403).json({ 
        error: "Access Denied", 
        details: "Admin privileges required" 
      });
    }

    console.log("✅ Authentication successful, starting trigger evaluation");

    // 5. Fetch Active Triggers
    const { data: triggersData, error: triggersError } = await supabaseAdmin
      .from("triggers")
      .select("*")
      .eq("is_active", true);

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

    // 6. Group Triggers by Sport
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

    // 7. Process Each Sport
    for (const [sport, sportTriggers] of Object.entries(triggersBySport)) {
      console.log(`🏈 Processing ${sportTriggers.length} triggers for sport: ${sport}`);

      try {
        // Construct Odds API URL per documentation
        const apiUrl = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${oddsApiKey}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`;
        
        console.log(`📡 Fetching odds for ${sport}`);
        const oddsResponse = await fetch(apiUrl);

        if (!oddsResponse.ok) {
          const errorText = await oddsResponse.text();
          console.error(`❌ Odds API error for ${sport} (${oddsResponse.status}):`, errorText);
          continue; // Skip this sport, continue with others
        }

        const eventsData: unknown = await oddsResponse.json();
        
        if (!Array.isArray(eventsData)) {
          console.error(`❌ Odds API for ${sport} did not return an array`);
          continue;
        }

        const events: OddsApiEvent[] = eventsData;
        console.log(`✅ Retrieved ${events.length} events for ${sport}`);
        
        // 8. Check Each Trigger Against Events
        for (const trigger of sportTriggers) {
          totalChecked++;

          // Find matching event
          const matchingEvent = events.find(event => 
            event.home_team === trigger.event_name || 
            event.away_team === trigger.event_name ||
            `${event.away_team} @ ${event.home_team}` === trigger.event_name
          );

          if (!matchingEvent) {
            continue; // No matching event found
          }

          // Extract odds from bookmakers
          let currentOdds: number | null = null;

          for (const bookmaker of matchingEvent.bookmakers) {
            const market = bookmaker.markets.find(m => {
              if (trigger.bet_type === "moneyline") return m.key === "h2h";
              if (trigger.bet_type === "spread") return m.key === "spreads";
              if (trigger.bet_type === "total") return m.key === "totals";
              return false;
            });

            if (market) {
              const outcome = market.outcomes.find(o => 
                o.name === trigger.team_player ||
                o.name.includes(trigger.team_player)
              );

              if (outcome) {
                currentOdds = outcome.price;
                break; // Found odds
              }
            }
          }

          if (currentOdds === null) {
            continue; // No odds found for this trigger
          }

          // 9. Check Condition
          let conditionMet = false;
          if (trigger.condition === "greater_than" && currentOdds > trigger.threshold) {
            conditionMet = true;
          } else if (trigger.condition === "less_than" && currentOdds < trigger.threshold) {
            conditionMet = true;
          }

          // 10. Create Alert if Condition Met
          if (conditionMet) {
            totalHit++;
            console.log(`🎯 TRIGGER HIT: ${trigger.event_name} - ${trigger.team_player} @ ${currentOdds}`);

            await supabaseAdmin.from("alerts").insert({
              trigger_id: trigger.id,
              user_id: trigger.user_id,
              message: `${trigger.event_name} - ${trigger.team_player} odds are now ${currentOdds} (threshold: ${trigger.threshold})`,
              odds_value: currentOdds,
            });
          }
        }
      } catch (error: any) {
        console.error(`❌ Error processing ${sport}:`, error.message);
        // Continue with other sports
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