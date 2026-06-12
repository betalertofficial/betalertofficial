import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { syncEventSchedules } from "@/services/scheduleService";
import { Database } from "@/integrations/supabase/types";

/**
 * Daily cron: sync upcoming game schedules from the Odds API for every ENABLED
 * tracked league. This is the automated version of the admin "Sync Schedules"
 * action (/api/admin/sync-schedules) — same logic, but it runs unattended on a
 * Vercel Cron and authenticates with CRON_SECRET instead of an admin session.
 *
 * Scheduled in vercel.json. Vercel Cron automatically sends
 * `Authorization: Bearer <CRON_SECRET>` when it invokes this path, so no manual
 * auth is needed for the scheduled run. (The same bearer also lets you trigger
 * it by hand with curl for testing.)
 */

// Schedule syncs can chain several Odds API calls (one per league); give it room.
export const config = { maxDuration: 300 };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Vercel Cron invokes via GET; allow POST too for manual triggering.
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Authenticate the request (Vercel injects this bearer for scheduled runs).
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[Cron/sync-schedules] CRON_SECRET not configured");
    return res.status(500).json({ error: "Cron secret not configured" });
  }
  if (req.headers.authorization !== `Bearer ${cronSecret}`) {
    console.error("[Cron/sync-schedules] Unauthorized request");
    return res.status(401).json({ error: "Unauthorized" });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const oddsApiKey = process.env.ODDS_API_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: "Supabase not configured" });
  }
  if (!oddsApiKey) {
    return res.status(500).json({ error: "Odds API key not configured" });
  }

  try {
    const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Fetch the leagues the user has turned on for tracking.
    const { data: leagues, error: leaguesError } = await supabase
      .from("tracked_leagues")
      .select("*")
      .eq("enabled", true);

    if (leaguesError) {
      console.error("[Cron/sync-schedules] Error fetching tracked leagues:", leaguesError);
      return res.status(500).json({ error: "Failed to fetch tracked leagues" });
    }

    if (!leagues || leagues.length === 0) {
      console.log("[Cron/sync-schedules] No enabled leagues to sync");
      return res.status(200).json({ success: true, message: "No enabled leagues to sync", synced: 0, leagues: [] });
    }

    const leagueKeys = leagues.map((l) => l.league_key);
    console.log(`[Cron/sync-schedules] Syncing ${leagueKeys.length} leagues:`, leagueKeys);

    const result = await syncEventSchedules(supabase, oddsApiKey, leagueKeys);

    console.log(
      `[Cron/sync-schedules] Done — synced ${result.synced} events across ${leagues.length} leagues` +
        (result.errors.length > 0 ? ` (${result.errors.length} errors)` : "")
    );

    return res.status(200).json({
      success: true,
      synced: result.synced,
      leagues: leagues.map((l) => ({ key: l.league_key, name: l.league_name })),
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (error) {
    console.error("[Cron/sync-schedules] Unexpected error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
