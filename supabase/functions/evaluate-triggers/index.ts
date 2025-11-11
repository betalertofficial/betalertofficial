
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Database } from "../../../src/types/database.ts";

type Trigger = Database["public"]["Tables"]["triggers"]["Row"];
type SupabaseClient = ReturnType<typeof createClient<Database>>;

interface PollingTarget {
  eventId: string;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
}

interface OddsData {
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

console.log("=== evaluate-triggers function initializing ===");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Step 1: Determine which games need polling based on active triggers
 */
async function determinePollingNeeds(
  supabase: SupabaseClient,
  apiKey: string,
  baseUrl: string
): Promise<{ targets: PollingTarget[]; triggers: Trigger[] }> {
  console.log("\n=== STEP 1: DETERMINING POLLING NEEDS ===");
  
  // Fetch all active triggers
  console.log("Fetching active triggers...");
  const { data: activeTriggers, error: triggersError } = await supabase
    .from("triggers")
    .select("*")
    .eq("status", "active") as { data: Trigger[]; error: any };

  if (triggersError) {
    console.error("❌ Failed to fetch active triggers:", triggersError);
    throw new Error(`Failed to fetch active triggers: ${triggersError.message}`);
  }

  if (!activeTriggers || activeTriggers.length === 0) {
    console.log("⚠️ No active triggers found.");
    return { targets: [], triggers: [] };
  }

  console.log(`✅ Found ${activeTriggers.length} active triggers`);

  // Group by sport
  const sportGroups = new Map<string, Trigger[]>();
  activeTriggers.forEach(trigger => {
    const sport = trigger.sport as string;
    if (!sportGroups.has(sport)) {
      sportGroups.set(sport, []);
    }
    sportGroups.get(sport)!.push(trigger);
  });

  console.log(`Grouped into ${sportGroups.size} sports:`, Array.from(sportGroups.keys()));

  // Find relevant live/upcoming games for each sport
  const pollingTargets: PollingTarget[] = [];

  for (const [sport, triggers] of sportGroups) {
    console.log(`\n>>> Checking sport: ${sport}`);
    console.log(`${triggers.length} triggers for this sport`);
    
    const scoresUrl = `${baseUrl}/v4/sports/${sport}/scores/?apiKey=${apiKey}`;
    console.log(`📡 Fetching scores from API...`);
    
    const scoresResponse = await fetch(scoresUrl);
    
    if (!scoresResponse.ok) {
      const errorText = await scoresResponse.text();
      console.error(`❌ Failed to fetch scores for ${sport}:`, errorText);
      continue;
    }

    const liveGames = await scoresResponse.json();
    console.log(`✅ Received ${liveGames.length} games for ${sport}`);

    // Find games that match our trigger teams
    const relevantGames = liveGames.filter((game: any) =>
      triggers.some((trigger) =>
        game.home_team === trigger.team_or_player || 
        game.away_team === trigger.team_or_player
      )
    );

    console.log(`✅ Found ${relevantGames.length} relevant games matching active triggers`);

    relevantGames.forEach((game: any) => {
      pollingTargets.push({
        eventId: game.id,
        sport: sport,
        homeTeam: game.home_team,
        awayTeam: game.away_team,
        commenceTime: game.commence_time
      });
    });
  }

  console.log(`\n✅ STEP 1 COMPLETE: ${pollingTargets.length} games to poll`);
  return { targets: pollingTargets, triggers: activeTriggers };
}

/**
 * Step 2: Fetch odds for the identified targets and store snapshots
 */
async function fetchAndStoreOdds(
  supabase: SupabaseClient,
  targets: PollingTarget[],
  apiKey: string,
  baseUrl: string
): Promise<{ oddsData: OddsData[]; snapshotsCreated: number }> {
  console.log("\n=== STEP 2: FETCHING AND STORING ODDS ===");

  if (targets.length === 0) {
    console.log("⚠️ No targets to fetch odds for");
    return { oddsData: [], snapshotsCreated: 0 };
  }

  // Group targets by sport for efficient API calls
  const sportGroups = new Map<string, PollingTarget[]>();
  targets.forEach(target => {
    if (!sportGroups.has(target.sport)) {
      sportGroups.set(target.sport, []);
    }
    sportGroups.get(target.sport)!.push(target);
  });

  const allOddsData: OddsData[] = [];
  let snapshotsCreated = 0;

  for (const [sport, sportTargets] of sportGroups) {
    console.log(`\n>>> Fetching odds for ${sport}`);
    
    const eventIds = sportTargets.map(t => t.eventId).join(",");
    const oddsUrl = `${baseUrl}/v4/sports/${sport}/odds/?apiKey=${apiKey}&regions=us&markets=h2h,spreads&eventIds=${eventIds}`;
    
    console.log(`📡 Fetching odds for ${sportTargets.length} events...`);
    
    const oddsResponse = await fetch(oddsUrl);
    
    if (!oddsResponse.ok) {
      const errorText = await oddsResponse.text();
      console.error(`❌ Failed to fetch odds for ${sport}:`, errorText);
      continue;
    }

    const oddsData: OddsData[] = await oddsResponse.json();
    console.log(`✅ Received odds for ${oddsData.length} events`);

    // Store each event's odds as a snapshot
    for (const event of oddsData) {
      console.log(`💾 Storing snapshot for: ${event.home_team} vs ${event.away_team}`);
      
      const { error: snapshotError } = await supabase
        .from("odds_snapshots")
        .insert({
          sport: sport,
          event_id: event.id,
          team_or_player: `${event.home_team} vs ${event.away_team}`,
          commence_time: event.commence_time,
          event_data: event,
        });

      if (snapshotError) {
        console.error("❌ Error storing snapshot:", snapshotError);
      } else {
        snapshotsCreated++;
        console.log(`✅ Snapshot stored`);
      }
    }

    allOddsData.push(...oddsData);
  }

  console.log(`\n✅ STEP 2 COMPLETE: ${snapshotsCreated} snapshots created`);
  return { oddsData: allOddsData, snapshotsCreated };
}

/**
 * Step 3: Evaluate triggers against fetched odds and create alerts
 */
async function evaluateTriggersAndAlert(
  supabase: SupabaseClient,
  triggers: Trigger[],
  oddsData: OddsData[]
): Promise<{ checked: number; hit: number }> {
  console.log("\n=== STEP 3: EVALUATING TRIGGERS AND CREATING ALERTS ===");

  let triggersChecked = 0;
  let triggersHit = 0;

  // Only process FanDuel and DraftKings bookmakers
  const ALLOWED_BOOKMAKERS = ["FanDuel", "DraftKings"];

  for (const trigger of triggers) {
    triggersChecked++;
    console.log(`\n🔍 Evaluating trigger ${trigger.id} for ${trigger.team_or_player}`);

    // Find the odds data for this trigger's team
    const relevantEvent = oddsData.find(event =>
      event.home_team === trigger.team_or_player || 
      event.away_team === trigger.team_or_player
    );

    if (!relevantEvent) {
      console.log(`⚠️ No odds data found for ${trigger.team_or_player}`);
      continue;
    }

    // Filter to only allowed bookmakers
    const allowedBookmakers = relevantEvent.bookmakers.filter(
      bm => ALLOWED_BOOKMAKERS.includes(bm.title)
    );

    if (allowedBookmakers.length === 0) {
      console.log(`⚠️ No FanDuel/DraftKings data for this event`);
      continue;
    }

    // Determine target market
    let targetMarketKey = "h2h"; // moneyline
    if (trigger.bet_type === "spread") {
      targetMarketKey = "spreads";
    } else if (trigger.bet_type === "total") {
      targetMarketKey = "totals";
    }

    // Find best odds across allowed bookmakers
    let bestOdds: number | null = null;
    let foundBookmaker: string | null = null;

    for (const bookmaker of allowedBookmakers) {
      const market = bookmaker.markets.find(m => m.key === targetMarketKey);
      if (!market) continue;

      const teamOutcome = market.outcomes.find(o => 
        o.name === trigger.team_or_player || 
        o.name.includes(trigger.team_or_player as string)
      );
      
      if (!teamOutcome) continue;

      const currentOdds = teamOutcome.price;
      if (bestOdds === null || currentOdds > bestOdds) {
        bestOdds = currentOdds;
        foundBookmaker = bookmaker.title;
      }
    }

    if (bestOdds === null) {
      console.log(`⚠️ No odds found for ${trigger.team_or_player} in ${targetMarketKey} market`);
      continue;
    }

    console.log(`Current odds: ${bestOdds} at ${foundBookmaker}, Target: ${trigger.odds_value}`);

    // Check if condition is met
    let conditionMet = false;
    if (trigger.odds_comparator === "greater_than" && bestOdds > trigger.odds_value) {
      conditionMet = true;
    } else if (trigger.odds_comparator === "less_than" && bestOdds < trigger.odds_value) {
      conditionMet = true;
    } else if (trigger.odds_comparator === "equal_to" && bestOdds === trigger.odds_value) {
      conditionMet = true;
    }

    if (conditionMet) {
      triggersHit++;
      console.log(`🎯 TRIGGER HIT! Creating alert...`);
      
      // Create alert
      const { error: alertError } = await supabase
        .from("alerts")
        .insert({
          user_id: trigger.user_id,
          trigger_id: trigger.id,
          message: `${trigger.team_or_player} odds are now ${bestOdds} at ${foundBookmaker} (${trigger.odds_comparator.replace('_', ' ')} ${trigger.odds_value})`,
          current_odds: bestOdds,
          triggered_at: new Date().toISOString()
        });

      if (alertError) {
        console.error(`❌ Failed to create alert:`, alertError);
      } else {
        console.log(`✅ Alert created successfully`);
        
        // Update trigger status if it's a "once" trigger
        if (trigger.frequency === "once") {
          console.log(`Marking "once" trigger as expired...`);
          const { error: updateError } = await supabase
            .from("triggers")
            .update({ status: "expired" })
            .eq("id", trigger.id);

          if (updateError) {
            console.error(`❌ Failed to update trigger status:`, updateError);
          } else {
            console.log(`✅ Trigger marked as expired`);
          }
        }
      }
    } else {
      console.log(`❌ Condition not met`);
    }
  }

  console.log(`\n✅ STEP 3 COMPLETE: Checked ${triggersChecked}, Hit ${triggersHit}`);
  return { checked: triggersChecked, hit: triggersHit };
}

/**
 * Main orchestrator function
 */
async function evaluateTriggers() {
  console.log("\n=== NEW EVALUATION RUN STARTED ===");
  const supabase = createClient<Database>(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let totalApiCalls = 0;

  // Create run log
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
    // Check if polling is enabled
    console.log("\n--- Checking system settings ---");
    const { data: settings, error: settingsError } = await supabase
      .from("system_settings")
      .select("is_polling_enabled")
      .single();

    if (settingsError) {
      console.error("❌ Failed to fetch system settings:", settingsError);
      throw new Error(`Failed to fetch system settings: ${settingsError.message}`);
    }

    if (!settings?.is_polling_enabled) {
      console.log("⚠️ Polling is DISABLED. Exiting.");
      await supabase.from("evaluation_runs").update({
        status: "completed",
        summary: "Polling is disabled.",
      }).eq("id", runLog.id);
      return { 
        message: "Polling is disabled.",
        checked: 0,
        hit: 0,
        totalApiCalls: 0,
        oddsSnapshotsCreated: 0
      };
    }

    // Get API credentials
    console.log("\n--- Fetching API credentials ---");
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
    if (!apiKey) {
      throw new Error("The Odds API key is missing.");
    }

    // STEP 1: Determine polling needs
    const { targets, triggers } = await determinePollingNeeds(supabase, apiKey, baseUrl);
    totalApiCalls += targets.length > 0 ? sportCount(targets) : 0; // Count scores API calls

    if (targets.length === 0) {
      const summary = "No active triggers or relevant games found.";
      await supabase.from("evaluation_runs").update({
        status: "completed",
        summary: summary,
      }).eq("id", runLog.id);
      return { 
        message: summary,
        checked: 0,
        hit: 0,
        totalApiCalls,
        oddsSnapshotsCreated: 0
      };
    }

    // STEP 2: Fetch and store odds
    const { oddsData, snapshotsCreated } = await fetchAndStoreOdds(
      supabase,
      targets,
      apiKey,
      baseUrl
    );
    totalApiCalls += sportCount(targets); // Count odds API calls

    // STEP 3: Evaluate triggers and create alerts
    const { checked, hit } = await evaluateTriggersAndAlert(
      supabase,
      triggers,
      oddsData
    );

    const summary = `Checked ${checked} triggers, ${hit} hit. Made ${totalApiCalls} API calls, created ${snapshotsCreated} snapshots.`;
    console.log(`\n=== EVALUATION COMPLETE ===`);
    console.log(summary);
    
    await supabase.from("evaluation_runs").update({
      status: "completed",
      summary: summary,
    }).eq("id", runLog.id);
    
    return { 
      message: summary,
      checked,
      hit,
      totalApiCalls,
      oddsSnapshotsCreated: snapshotsCreated
    };
    
  } catch (error: any) {
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

// Helper to count unique sports (for API call tracking)
function sportCount(targets: PollingTarget[]): number {
  return new Set(targets.map(t => t.sport)).size;
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
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
