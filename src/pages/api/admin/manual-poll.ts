import type { NextApiRequest, NextApiResponse } from "next";
import { pollingService } from "@/services/pollingService";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * Admin: manually trigger a polling run (legacy v1 path).
 * POST /api/admin/manual-poll  (admin only)
 *
 * Uses the server-side ODDS_API_KEY env var (no hardcoded key).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = await requireAdmin(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const oddsApiKey = process.env.ODDS_API_KEY;
  if (!oddsApiKey) {
    return res.status(500).json({ error: "Odds API key not configured" });
  }

  try {
    console.log("=== Starting Manual Poll ===");
    const result = await pollingService.evaluateTriggers(auth.admin as any, oddsApiKey, true);
    const stats = result.data || { triggersEvaluated: 0, matchesFound: 0, alertsSent: 0, durationMs: 0 };
    console.log(`=== Manual Poll Complete === Checked: ${stats.triggersEvaluated}, Hit: ${stats.matchesFound}`);

    return res.status(200).json({
      success: result.success,
      checked: stats.triggersEvaluated,
      hit: stats.matchesFound,
      matches: stats.matchesFound,
      alerts: stats.alertsSent,
      message: result.error || "Manual poll completed successfully",
    });
  } catch (error) {
    console.error("Manual poll error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
