import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Database } from "../../../src/types/database.ts";

// Define a simple type for our trigger, since we can't import from the main project
type Trigger = Database["public"]["Tables"]["triggers"]["Row"];

console.log("evaluate-triggers function initializing");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function evaluateTriggers() {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  console.log("Supabase client initialized.");

  const { data: runLog, error: runLogError } = await supabase
    .from("evaluation_runs")
    .insert({ status: "running" })
    .select()
    .single();

  if (runLogError) {
    console.error("Error creating evaluation run log:", runLogError.message);
    throw new Error(`Failed to create run log: ${runLogError.message}`);
  }
  console.log(`Started evaluation run with ID: ${runLog.id}`);

  try {
    const { data: settings, error: settingsError } = await supabase
      .from("system_settings")
      .select("is_polling_enabled")
      .single();

    if (settingsError) {
      throw new Error(
        `Failed to fetch system settings: ${settingsError.message}`,
      );
    }
    if (!settings?.is_polling_enabled) {
      await supabase.from("evaluation_runs").update({
        status: "completed",
        summary: "Polling is disabled.",
      }).eq("id", runLog.id);
      return { message: "Polling is disabled. Operation stopped." };
    }
    console.log("Polling is enabled. Proceeding...");

    const { data: activeTriggers, error: triggersError } = await supabase
      .from("triggers")
      .select("*")
      .eq("status", "active") as { data: Trigger[]; error: any };

    if (triggersError) {
      throw new Error(
        `Failed to fetch active triggers: ${triggersError.message}`,
      );
    }
    if (!activeTriggers || activeTriggers.length === 0) {
      await supabase.from("evaluation_runs").update({
        status: "completed",
        summary: "No active triggers found.",
      }).eq("id", runLog.id);
      return { message: "No active triggers found. Operation stopped." };
    }
    console.log(`Found ${activeTriggers.length} active triggers.`);

    const { data: vendor, error: vendorError } = await supabase
      .from("vendors")
      .select("api_key, base_url")
      .eq("name", "The Odds API")
      .single();

    if (vendorError || !vendor) {
      throw new Error("Failed to get 'The Odds API' vendor details.");
    }
    const { api_key: apiKey, base_url: baseUrl } = vendor;
    if (!apiKey) throw new Error("The Odds API key is missing.");

    console.log("Successfully fetched API credentials.");

    const activeSports = [
      ...new Set(activeTriggers.map((t) => t.sport)),
    ] as string[];
    console.log(`Active sports: ${activeSports.join(", ")}`);

    let oddsSnapshotsCreated = 0;

    for (const sport of activeSports) {
      console.log(`Fetching live scores for sport: ${sport}...`);
      const scoresUrl =
        `${baseUrl}/v4/sports/${sport}/scores/?apiKey=${apiKey}`;
      const scoresResponse = await fetch(scoresUrl);

      if (!scoresResponse.ok) {
        console.error(
          `Failed to fetch scores for ${sport}:`,
          await scoresResponse.text(),
        );
        continue;
      }

      const liveGames = await scoresResponse.json();
      console.log(`Found ${liveGames.length} live games for ${sport}.`);

      if (liveGames.length === 0) continue;

      const relevantTriggers = activeTriggers.filter((t) => t.sport === sport);
      const relevantGames = liveGames.filter((game: any) =>
        relevantTriggers.some((trigger) =>
          game.home_team === trigger.team || game.away_team === trigger.team
        )
      );
      console.log(
        `Found ${relevantGames.length} relevant games for active triggers.`,
      );

      if (relevantGames.length === 0) continue;

      const eventIds = relevantGames.map((g: any) => g.id).join(",");
      const oddsUrl =
        `${baseUrl}/v4/sports/${sport}/odds/?apiKey=${apiKey}&regions=us&markets=h2h&eventIds=${eventIds}`;
      console.log(`Fetching odds for ${relevantGames.length} events...`);
      const oddsResponse = await fetch(oddsUrl);

      if (!oddsResponse.ok) {
        console.error(
          `Failed to fetch odds for events:`,
          await oddsResponse.text(),
        );
        continue;
      }
      const oddsData = await oddsResponse.json();

      if (oddsData && oddsData.length > 0) {
        const { error: snapshotError } = await supabase
          .from("odds_snapshots")
          .insert({
            sport: sport,
            raw_data: oddsData,
          });

        if (snapshotError) {
          console.error(
            "Error inserting odds snapshot:",
            snapshotError.message,
          );
        } else {
          oddsSnapshotsCreated++;
          console.log(`Successfully created odds snapshot for ${sport}.`);
        }
      }
    }

    const summary =
      `Evaluation complete. Processed ${activeSports.length} sports. Created ${oddsSnapshotsCreated} odds snapshots.`;
    await supabase.from("evaluation_runs").update({
      status: "completed",
      summary: summary,
    }).eq("id", runLog.id);
    console.log("Evaluation run completed successfully.");
    return { message: summary };
  } catch (error) {
    console.error("Error during trigger evaluation:", error.message);
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