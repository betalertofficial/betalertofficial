import type { NextApiRequest, NextApiResponse } from "next";
import { runCronPoll } from "@/services/cronPollingService";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * Admin: manually trigger a polling run (v2, same path as the cron).
 * POST /api/admin/manual-poll-v2  (admin only)
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
  const webhookUrl = process.env.ZAPIER_WEBHOOK_URL || "";
  if (!oddsApiKey) {
    return res.status(500).json({ error: "Odds API key not configured" });
  }

  try {
    console.log(`[ManualPoll] Starting manual poll by user ${auth.userId}`);
    const result = await runCronPoll(auth.admin as any, oddsApiKey, webhookUrl);
    return res.status(200).json({
      success: result.success,
      evaluation_run_id: result.evaluationRunId,
      triggers_checked: result.triggersChecked,
      matches_found: result.matchesFound,
      alerts_created: result.alertsCreated,
      webhooks_sent: result.webhooksSent,
      duration_ms: result.durationMs,
      live_events_count: result.liveEventsCount,
      active_sports: result.activeSports,
      skipped_reason: result.skippedReason,
      error: result.error,
    });
  } catch (error) {
    console.error("[ManualPoll] Error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
