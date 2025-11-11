import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

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
    // Authentication
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "Unauthorized - No auth header" });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return res.status(401).json({ error: "Unauthorized - Invalid token" });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return res.status(403).json({ error: "Access denied - No profile" });
    }

    if (profile.role !== "admin" && profile.role !== "super_admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    // Use service role for database operations
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    console.log("🎯 Starting manual poll and trigger evaluation...");

    // Fetch the Odds API key from vendors table
    const { data: vendorData, error: vendorError } = await supabaseAdmin
      .from("vendors")
      .select("api_key")
      .eq("is_active", true)
      .single();

    if (vendorError || !vendorData || !vendorData.api_key) {
      console.error("❌ Error fetching Odds API key from vendors table:", vendorError);
      return res.status(500).json({ 
        error: "Failed to fetch Odds API key from vendors table", 
        details: vendorError?.message || "No active vendor found" 
      });
    }

    const oddsApiKey = vendorData.api_key;
    console.log("✅ Successfully fetched Odds API key from vendors table");

    // Fetch all active triggers
    const { data: triggersData, error: triggersError } = await supabaseAdmin
      .from("triggers")
      .select("*")
      .eq("is_active", true);

    if (triggersError) {
      console.error("❌ Error fetching triggers:", triggersError);
      return res.status(500).json({ error: "Failed to fetch triggers", details: triggersError.message });
    }

    const triggers: Trigger[] = triggersData || [];

    if (triggers.length === 0) {
      console.log("ℹ️ No active triggers found");
      return res.status(200).json({
        success: true,
        checked: 0,
        hit: 0,
        message: "No active triggers to check"
      });
    }

    console.log(`📊 Found ${triggers.length} active triggers`);

    // Group triggers by sport for efficient API calls
    const triggersBySport = triggers.reduce((acc: { [key: string]: Trigger[] }, trigger) => {
      if (!acc[trigger.sport]) {
        acc[trigger.sport] = [];
      }
      acc[trigger.sport].push(trigger);
      return acc;
    }, {});

    let totalChecked = 0;
    let totalHit = 0;

    // Process each sport
    for (const [sport, sportTriggers] of Object.entries(triggersBySport)) {
      console.log(`🏈 Processing ${sportTriggers.length} triggers for ${sport}`);

      try {
        // Fetch odds from API
        const oddsResponse = await fetch(
          `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${oddsApiKey}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`
        );

        if (!oddsResponse.ok) {
          console.error(`❌ Odds API error for ${sport}:`, await oddsResponse.text());
          continue;
        }

        const eventsData: unknown = await oddsResponse.json();
        
        if (!Array.isArray(eventsData)) {
          console.error(`❌ Odds API for ${sport} did not return an array.`);
          continue;
        }

        const events: OddsApiEvent[] = eventsData;
        console.log(`📥 Received ${events.length} events for ${sport}`);

        // Check each trigger against the events
        for (const trigger of sportTriggers) {
          totalChecked++;

          // Find matching event
          const matchingEvent = events.find(event => 
            event.home_team === trigger.event_name || 
            event.away_team === trigger.event_name ||
            `${event.away_team} @ ${event.home_team}` === trigger.event_name
          );

          if (!matchingEvent) {
            console.log(`⚠️ No matching event found for trigger: ${trigger.event_name}`);
            continue;
          }

          // Extract odds based on bet type
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
                break;
              }
            }
          }

          if (currentOdds === null) {
            console.log(`⚠️ No odds found for trigger: ${trigger.event_name} - ${trigger.team_player}`);
            continue;
          }

          // Check if trigger condition is met
          let conditionMet = false;
          if (trigger.condition === "greater_than" && currentOdds > trigger.threshold) {
            conditionMet = true;
          } else if (trigger.condition === "less_than" && currentOdds < trigger.threshold) {
            conditionMet = true;
          }

          if (conditionMet) {
            totalHit++;
            console.log(`🎯 TRIGGER HIT! ${trigger.event_name} - ${trigger.team_player}: ${currentOdds} ${trigger.condition} ${trigger.threshold}`);

            // Store in alerts table
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
      }
    }

    console.log(`✅ Manual poll complete: Checked ${totalChecked} triggers, ${totalHit} hit`);

    return res.status(200).json({
      success: true,
      checked: totalChecked,
      hit: totalHit,
      message: `Checked ${totalChecked} triggers, ${totalHit} hit`
    });

  } catch (error: any) {
    console.error("❌ CRITICAL ERROR in manual-poll:", error);
    return res.status(500).json({ 
      error: "Internal Server Error",
      details: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
}
