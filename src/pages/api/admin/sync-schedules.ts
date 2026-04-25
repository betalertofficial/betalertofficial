import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { syncEventSchedules } from "@/services/scheduleService";
import { Database } from "@/integrations/supabase/types";

type TrackedLeague = Database["public"]["Tables"]["tracked_leagues"]["Row"];

/**
 * Admin endpoint to sync event schedules from Odds API
 * POST /api/admin/sync-schedules
 * 
 * Fetches enabled leagues from tracked_leagues and syncs upcoming events
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Get environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const oddsApiKey = process.env.ODDS_API_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return res.status(500).json({ error: "Supabase not configured" });
    }

    if (!oddsApiKey) {
      return res.status(500).json({ error: "Odds API key not configured" });
    }

    // Create admin Supabase client
    const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);

    // Fetch enabled tracked leagues
    const { data: leagues, error: leaguesError } = await supabase
      .from("tracked_leagues")
      .select("*")
      .eq("enabled", true);

    if (leaguesError) {
      console.error("[SyncSchedules] Error fetching tracked leagues:", leaguesError);
      return res.status(500).json({ error: "Failed to fetch tracked leagues" });
    }

    if (!leagues || leagues.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No enabled leagues to sync",
        synced: 0,
        leagues: [],
      });
    }

    const leagueKeys = leagues.map(l => l.league_key);
    console.log(`[SyncSchedules] Syncing schedules for ${leagueKeys.length} leagues:`, leagueKeys);

    // Sync event schedules
    const result = await syncEventSchedules(supabase, oddsApiKey, leagueKeys);

    return res.status(200).json({
      success: true,
      synced: result.synced,
      leagues: leagues.map(l => ({
        key: l.league_key,
        name: l.league_name,
      })),
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (error) {
    console.error("[SyncSchedules] Unexpected error:", error);
    return res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}