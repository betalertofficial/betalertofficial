import type { NextApiRequest, NextApiResponse } from "next";
import { syncEventSchedules } from "@/services/scheduleService";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * Admin: sync event schedules from the Odds API for enabled tracked leagues.
 * POST /api/admin/sync-schedules  (admin only)
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = await requireAdmin(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }
  const supabase = auth.admin;

  const oddsApiKey = process.env.ODDS_API_KEY;
  if (!oddsApiKey) {
    return res.status(500).json({ error: "Odds API key not configured" });
  }

  try {
    const { data: leagues, error: leaguesError } = await supabase
      .from("tracked_leagues")
      .select("*")
      .eq("enabled", true);
    if (leaguesError) {
      console.error("[SyncSchedules] Error fetching tracked leagues:", leaguesError);
      return res.status(500).json({ error: "Failed to fetch tracked leagues" });
    }
    if (!leagues || leagues.length === 0) {
      return res.status(200).json({ success: true, message: "No enabled leagues to sync", synced: 0, leagues: [] });
    }

    const leagueKeys = leagues.map((l: any) => l.league_key);
    console.log(`[SyncSchedules] Syncing schedules for ${leagueKeys.length} leagues`);

    const result = await syncEventSchedules(supabase as any, oddsApiKey, leagueKeys);

    return res.status(200).json({
      success: true,
      synced: result.synced,
      leagues: leagues.map((l: any) => ({ key: l.league_key, name: l.league_name })),
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (error) {
    console.error("[SyncSchedules] Unexpected error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
