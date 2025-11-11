
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Define types inline since we can't import from local files in Deno
interface Trigger {
  id: string;
  sport: string;
  team_or_player: string;
  bet_type: string;
  odds_comparator: string;
  odds_value: number;
  frequency: string;
  status: string;
  vendor_id: string | null;
  created_at: string;
  updated_at: string;
}

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
  supabase: any,
  apiKey: string,
  baseUrl: string
): Promise<{ targets: PollingTarget[]; triggers: Trigger[] }> {
  console.log("\n=== STEP 1: DETERMINING POLLING NEEDS ===");
  
  // Fetch all active triggers
  console.log("Fetching active triggers...");
  const { data: activeTriggers, error: triggersError } = await supabase
    .from("triggers")
    .select("*")
    .eq("status", "active");

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
  activeTriggers.forEach((trigger: Trigger) => {
    const sport = trigger.sport;
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
  supabase: any,
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

  // Only process FanDuel and DraftKings bookmakers
  const ALLOWED_BOOKMAKERS = ["fanduel", "draftkings"];

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

    // First create the feed event
    const { data: feedEvent, error: feedEventError } = await supabase
      .from("odds_feed_events")
      .insert({
        vendor_id: null, // Will be populated if vendor tracking is needed
        raw_payload: { events: oddsData },
        event_count: oddsData.length
      })
      .select()
      .single();

    if (feedEventError) {
      console.error("❌ Error creating feed event:", feedEventError);
      continue;
    }

    console.log(`✅ Feed event created with ID: ${feedEvent.id}`);

    // Store snapshots for each event
    for (const event of oddsData) {
      console.log(`💾 Storing snapshots for: ${event.home_team} vs ${event.away_team}`);
      
      // Filter to only allowed bookmakers
      const allowedBookmakers = event.bookmakers.filter(
        bm => ALLOWED_BOOKMAKERS.includes(bm.key.toLowerCase())
      );

      if (allowedBookmakers.length === 0) {
        console.log(`⚠️ No FanDuel/DraftKings data for this event, skipping`);
        continue;
      }

      // Create snapshots for each team and bookmaker combination
      for (const bookmaker of allowedBookmakers) {
        for (const market of bookmaker.markets) {
          for (const outcome of market.outcomes) {
            const snapshot = {
              feed_event_id: feedEvent.id,
              sport: sport,
              event_id: event.id,
              team_or_player: outcome.name,
              bookmaker: bookmaker.title,
              bet_type: market.key,
              odds_value: outcome.price,
              deep_link_url: null,
              commence_time: event.commence_time,
              event_data: event
            };

            const { error: snapshotError } = await supabase
              .from("odds_snapshots")
              .insert(snapshot);

            if (snapshotError) {
              console.error("❌ Error storing snapshot:", snapshotError);
            } else {
              snapshotsCreated++;
            }
          }
        }
      }
      
      console.log(`✅ Snapshots stored for event`);
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
  supabase: any,
  triggers: Trigger[]
): Promise<{ checked: number; hit: number }> {
  console.log("\n=== STEP 3: EVALUATING TRIGGERS AND CREATING ALERTS ===");

  let triggersChecked = 0;
  let triggersHit = 0;

  // Only process FanDuel and DraftKings bookmakers
  const ALLOWED_BOOKMAKERS = ["FanDuel", "DraftKings"];

  for (const trigger of triggers) {
    triggersChecked++;
    console.log(`\n🔍 Evaluating trigger ${trigger.id} for ${trigger.team_or_player}`);

    // Find the latest matching odds snapshot for this trigger
    const { data: snapshots, error: snapshotsError } = await supabase
      .from("odds_snapshots")
      .select("*")
      .eq("sport", trigger.sport)
      .eq("team_or_player", trigger.team_or_player)
      .eq("bet_type", trigger.bet_type === "moneyline" ? "h2h" : trigger.bet_type)
      .in("bookmaker", ALLOWED_BOOKMAKERS)
      .order("snapshot_at", { ascending: false })
      .limit(1);

    if (snapshotsError || !snapshots || snapshots.length === 0) {
      console.log(`⚠️ No recent odds snapshot found for ${trigger.team_or_player}`);
      continue;
    }

    const snapshot = snapshots[0];
    const currentOdds = snapshot.odds_value;
    const bookmaker = snapshot.bookmaker;

    console.log(`Current odds: ${currentOdds} at ${bookmaker}, Target: ${trigger.odds_value}`);

    // Check if condition is met
    let conditionMet = false;
    if (trigger.odds_comparator === "greater_than" && currentOdds > trigger.odds_value) {
      conditionMet = true;
    } else if (trigger.odds_comparator === "less_than" && currentOdds < trigger.odds_value) {
      conditionMet = true;
    } else if (trigger.odds_comparator === "equal_to" && currentOdds === trigger.odds_value) {
      conditionMet = true;
    } else if (trigger.odds_comparator === ">=" && currentOdds >= trigger.odds_value) {
      conditionMet = true;
    } else if (trigger.odds_comparator === "<=" && currentOdds <= trigger.odds_value) {
      conditionMet = true;
    }

    if (conditionMet) {
      triggersHit++;
      console.log(`🎯 TRIGGER HIT! Creating trigger match and alerts...`);
      
      // Create trigger match
      const { data: triggerMatch, error: matchError } = await supabase
        .from("trigger_matches")
        .insert({
          trigger_id: trigger.id,
          odds_snapshot_id: snapshot.id,
          matched_value: currentOdds
        })
        .select()
        .single();

      if (matchError) {
        console.error(`❌ Failed to create trigger match:`, matchError);
        continue;
      }

      console.log(`✅ Trigger match created`);

      // Get all profiles associated with this trigger
      const { data: profileTriggers, error: profileError } = await supabase
        .from("profile_triggers")
        .select("profile_id")
        .eq("trigger_id", trigger.id);

      if (profileError || !profileTriggers || profileTriggers.length === 0) {
        console.log(`⚠️ No profiles found for trigger ${trigger.id}`);
        continue;
      }

      console.log(`Found ${profileTriggers.length} profiles to alert`);

      // Create alert for each profile
      for (const pt of profileTriggers) {
        const message = `${trigger.team_or_player} odds are now ${currentOdds} at ${bookmaker} (${trigger.odds_comparator.replace('_', ' ')} ${trigger.odds_value})`;
        
        const { error: alertError } = await supabase
          .from("alerts")
          .insert({
            trigger_match_id: triggerMatch.id,
            profile_id: pt.profile_id,
            message: message,
            delivery_status: "pending"
          });

        if (alertError) {
          console.error(`❌ Failed to create alert for profile ${pt.profile_id}:`, alertError);
        } else {
          console.log(`✅ Alert created for profile ${pt.profile_id}`);
        }
      }
      
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
  const supabase = createClient(
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
    // Check if polling is enabled via admin_settings
    console.log("\n--- Checking admin settings ---");
    const { data: settings, error: settingsError } = await supabase
      .from("admin_settings")
      .select("setting_value")
      .eq("setting_key", "polling_enabled")
      .single();

    if (settingsError && settingsError.code !== "PGRST116") {
      console.error("❌ Failed to fetch admin settings:", settingsError);
      throw new Error(`Failed to fetch admin settings: ${settingsError.message}`);
    }

    // If setting doesn't exist or is false, exit
    if (!settings || settings.setting_value?.enabled === false) {
      console.log("⚠️ Polling is DISABLED. Exiting.");
      await supabase.from("evaluation_runs").update({
        status: "completed",
        triggers_evaluated: 0,
        matches_found: 0,
        alerts_sent: 0
      }).eq("id", runLog.id);
      return { 
        message: "Polling is disabled.",
        checked: 0,
        hit: 0,
        totalApiCalls: 0,
        oddsSnapshotsCreated: 0
      };
    }

    console.log("✅ Polling is ENABLED");

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

    console.log("✅ API credentials retrieved");

    // STEP 1: Determine polling needs
    const { targets, triggers } = await determinePollingNeeds(supabase, apiKey, baseUrl);
    totalApiCalls += targets.length > 0 ? sportCount(targets) : 0; // Count scores API calls

    if (targets.length === 0) {
      const message = "No active triggers or relevant games found.";
      await supabase.from("evaluation_runs").update({
        status: "completed",
        triggers_evaluated: 0,
        matches_found: 0,
        alerts_sent: 0
      }).eq("id", runLog.id);
      return { 
        message,
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
      triggers
    );

    const message = `Checked ${checked} triggers, ${hit} hit`;
    console.log(`\n=== EVALUATION COMPLETE ===`);
    console.log(message);
    console.log(`Made ${totalApiCalls} API calls, created ${snapshotsCreated} snapshots.`);
    
    await supabase.from("evaluation_runs").update({
      status: "completed",
      triggers_evaluated: checked,
      matches_found: hit,
      alerts_sent: hit
    }).eq("id", runLog.id);
    
    return { 
      message,
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
        error_message: error.message
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
