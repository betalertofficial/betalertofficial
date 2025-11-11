import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Database } from "../../../src/types/database.ts";

type Trigger = Database["public"]["Tables"]["triggers"]["Row"];

console.log("=== evaluate-triggers function initializing ===");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function evaluateTriggers() {
  console.log("\n=== NEW EVALUATION RUN STARTED ===");
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let triggersChecked = 0;
  let triggersHit = 0;

  const { data: runLog, error: runLogError } = await supabase
    .from("evaluation_runs")
    .insert({ status: "running" })
    .select()
    .single();

  if (runLogError) {
    console.error("❌ CRITICAL: Failed to create evaluation run log:", runLogError);
    throw new Error(`Failed to create run log: ${runLogError.message}`);
  }
  console.log(`✅ Evaluation run created with ID: ${runLog.id}`);

  try {
    console.log("\n--- Step 1: Checking system settings ---");
    const { data: settings, error: settingsError } = await supabase
      .from("system_settings")
      .select("is_polling_enabled")
      .single();

    if (settingsError) {
      console.error("❌ Failed to fetch system settings:", settingsError);
      throw new Error(`Failed to fetch system settings: ${settingsError.message}`);
    }
    
    console.log("System settings:", JSON.stringify(settings, null, 2));

    if (!settings?.is_polling_enabled) {
      console.log("⚠️ Polling is DISABLED. Exiting.");
      await supabase.from("evaluation_runs").update({
        status: "completed",
        summary: "Polling is disabled.",
      }).eq("id", runLog.id);
      return { 
        message: "Polling is disabled. Operation stopped.",
        checked: 0,
        hit: 0
      };
    }
    console.log("✅ Polling is ENABLED. Proceeding...");

    console.log("\n--- Step 2: Fetching active triggers ---");
    const { data: activeTriggers, error: triggersError } = await supabase
      .from("triggers")
      .select("*")
      .eq("status", "active") as { data: Trigger[]; error: any };

    if (triggersError) {
      console.error("❌ Failed to fetch active triggers:", triggersError);
      throw new Error(`Failed to fetch active triggers: ${triggersError.message}`);
    }
    
    console.log(`Found ${activeTriggers?.length || 0} active triggers`);
    if (activeTriggers && activeTriggers.length > 0) {
      console.log("Active triggers:", JSON.stringify(activeTriggers, null, 2));
    }

    if (!activeTriggers || activeTriggers.length === 0) {
      console.log("⚠️ No active triggers found. Exiting.");
      await supabase.from("evaluation_runs").update({
        status: "completed",
        summary: "No active triggers found.",
      }).eq("id", runLog.id);
      return { 
        message: "No active triggers found. Operation stopped.",
        checked: 0,
        hit: 0
      };
    }

    console.log("\n--- Step 3: Fetching API credentials ---");
    const { data: vendor, error: vendorError } = await supabase
      .from("vendors")
      .select("api_key, base_url")
      .eq("name", "The Odds API")
      .single();

    if (vendorError || !vendor) {
      console.error("❌ Failed to get 'The Odds API' vendor:", vendorError);
      throw new Error("Failed to get 'The Odds API' vendor details.");
    }
    
    const { api_key: apiKey, base_url: baseUrl } = vendor;
    console.log(`✅ API credentials fetched. Base URL: ${baseUrl}`);
    console.log(`API Key present: ${apiKey ? "YES" : "NO"}`);
    
    if (!apiKey) {
      console.error("❌ The Odds API key is missing!");
      throw new Error("The Odds API key is missing.");
    }

    const activeSports = [...new Set(activeTriggers.map((t) => t.sport))] as string[];
    console.log(`\n--- Step 4: Processing ${activeSports.length} sports ---`);
    console.log("Active sports:", activeSports);

    let oddsSnapshotsCreated = 0;
    let totalApiCalls = 0;

    for (const sport of activeSports) {
      console.log(`\n>>> Processing sport: ${sport}`);
      
      const scoresUrl = `${baseUrl}/v4/sports/${sport}/scores/?apiKey=${apiKey}`;
      console.log(`📡 API CALL 1: Fetching live scores`);
      console.log(`URL: ${scoresUrl.replace(apiKey, "***")}`);
      totalApiCalls++;
      
      const scoresResponse = await fetch(scoresUrl);
      console.log(`Response status: ${scoresResponse.status} ${scoresResponse.statusText}`);

      if (!scoresResponse.ok) {
        const errorText = await scoresResponse.text();
        console.error(`❌ Failed to fetch scores:`, errorText);
        continue;
      }

      const liveGames = await scoresResponse.json();
      console.log(`✅ Received ${liveGames.length} live games`);
      console.log("Live games data:", JSON.stringify(liveGames, null, 2));

      if (liveGames.length === 0) {
        console.log("⚠️ No live games for this sport. Moving to next sport.");
        continue;
      }

      const relevantTriggers = activeTriggers.filter((t) => t.sport === sport);
      console.log(`Checking ${relevantTriggers.length} triggers for this sport`);
      
      const relevantGames = liveGames.filter((game: any) =>
        relevantTriggers.some((trigger) =>
          game.home_team === trigger.team || game.away_team === trigger.team
        )
      );
      
      console.log(`✅ Found ${relevantGames.length} relevant games matching triggers`);
      if (relevantGames.length > 0) {
        console.log("Relevant games:", JSON.stringify(relevantGames, null, 2));
      }

      if (relevantGames.length === 0) {
        console.log("⚠️ No games match active triggers. Moving to next sport.");
        continue;
      }

      const eventIds = relevantGames.map((g: any) => g.id).join(",");
      const oddsUrl = `${baseUrl}/v4/sports/${sport}/odds/?apiKey=${apiKey}&regions=us&markets=h2h&eventIds=${eventIds}`;
      
      console.log(`📡 API CALL 2: Fetching odds for ${relevantGames.length} events`);
      console.log(`URL: ${oddsUrl.replace(apiKey, "***")}`);
      console.log(`Event IDs: ${eventIds}`);
      totalApiCalls++;
      
      const oddsResponse = await fetch(oddsUrl);
      console.log(`Response status: ${oddsResponse.status} ${oddsResponse.statusText}`);

      if (!oddsResponse.ok) {
        const errorText = await oddsResponse.text();
        console.error(`❌ Failed to fetch odds:`, errorText);
        continue;
      }

      const oddsData = await oddsResponse.json();
      console.log(`✅ Received odds data for ${oddsData.length} events`);
      console.log("Odds data:", JSON.stringify(oddsData, null, 2));

      for (const trigger of relevantTriggers) {
        triggersChecked++;
        console.log(`\n🔍 Evaluating trigger ${trigger.id} for ${trigger.team}`);
        
        const relevantEvent = oddsData.find((event: any) => 
          event.home_team === trigger.team || event.away_team === trigger.team
        );

        if (!relevantEvent || !relevantEvent.bookmakers || relevantEvent.bookmakers.length === 0) {
          console.log(`⚠️ No odds data found for trigger ${trigger.id}`);
          continue;
        }

        const bookmaker = relevantEvent.bookmakers[0];
        const h2hMarket = bookmaker.markets.find((m: any) => m.key === "h2h");
        
        if (!h2hMarket) {
          console.log(`⚠️ No h2h market found for trigger ${trigger.id}`);
          continue;
        }

        const teamOutcome = h2hMarket.outcomes.find((o: any) => o.name === trigger.team);
        
        if (!teamOutcome) {
          console.log(`⚠️ No outcome found for ${trigger.team}`);
          continue;
        }

        const currentOdds = teamOutcome.price;
        console.log(`Current odds for ${trigger.team}: ${currentOdds}, Target: ${trigger.target_odds}`);

        let conditionMet = false;
        if (trigger.condition === "greater_than" && currentOdds > trigger.target_odds) {
          conditionMet = true;
        } else if (trigger.condition === "less_than" && currentOdds < trigger.target_odds) {
          conditionMet = true;
        }

        if (conditionMet) {
          triggersHit++;
          console.log(`🎯 TRIGGER HIT! Creating alert for trigger ${trigger.id}`);
          
          const { error: alertError } = await supabase
            .from("alerts")
            .insert({
              user_id: trigger.user_id,
              trigger_id: trigger.id,
              message: `${trigger.team} odds are now ${currentOdds} (${trigger.condition === "greater_than" ? "above" : "below"} ${trigger.target_odds})`,
              current_odds: currentOdds,
              triggered_at: new Date().toISOString()
            });

          if (alertError) {
            console.error(`❌ Failed to create alert:`, alertError);
          } else {
            console.log(`✅ Alert created successfully`);
          }
        } else {
          console.log(`❌ Condition not met for trigger ${trigger.id}`);
        }
      }

      if (oddsData && oddsData.length > 0) {
        console.log(`💾 Saving odds snapshot to database...`);
        const { error: snapshotError } = await supabase
          .from("odds_snapshots")
          .insert({
            sport: sport,
            raw_data: oddsData,
          });

        if (snapshotError) {
          console.error("❌ Error inserting odds snapshot:", snapshotError);
        } else {
          oddsSnapshotsCreated++;
          console.log(`✅ Successfully saved odds snapshot for ${sport}`);
        }
      } else {
        console.log("⚠️ No odds data to save");
      }
    }

    const summary = `Checked ${triggersChecked} triggers, ${triggersHit} hit. Processed ${activeSports.length} sports, made ${totalApiCalls} API calls, created ${oddsSnapshotsCreated} odds snapshots.`;
    console.log(`\n=== ${summary} ===`);
    
    await supabase.from("evaluation_runs").update({
      status: "completed",
      summary: summary,
    }).eq("id", runLog.id);
    
    return { 
      message: summary, 
      totalApiCalls, 
      oddsSnapshotsCreated,
      checked: triggersChecked,
      hit: triggersHit
    };
    
  } catch (error) {
    console.error("\n❌❌❌ FATAL ERROR ❌❌❌");
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    
    if (runLog) {
      await supabase.from("evaluation_runs").update({
        status: "failed",
        summary: error.message,
      }).eq("id", runLog.id);
    }
    throw error;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const result = await evaluateTriggers();
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
