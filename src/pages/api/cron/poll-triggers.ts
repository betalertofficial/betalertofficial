import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { runCronPoll } from "@/services/cronPollingService";

/**
 * Cron endpoint for trigger evaluation
 * GET /api/cron/poll-triggers
 * Requires: Authorization: Bearer CRON_SECRET
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Verify authorization
    const authHeader = req.headers.authorization;
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error("[Cron] CRON_SECRET not configured");
      return res.status(500).json({ error: "Cron secret not configured" });
    }

    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
      console.error("[Cron] Unauthorized request");
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Get environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const oddsApiKey = process.env.ODDS_API_KEY;
    const webhookUrl = process.env.ZAPIER_WEBHOOK_URL;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("[Cron] Supabase credentials not configured");
      return res.status(500).json({ error: "Supabase not configured" });
    }

    if (!oddsApiKey) {
      console.error("[Cron] Odds API key not configured");
      return res.status(500).json({ error: "Odds API key not configured" });
    }

    if (!webhookUrl) {
      console.error("[Cron] Webhook URL not configured");
      return res.status(500).json({ error: "Webhook URL not configured" });
    }

    // Create admin Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Run cron poll
    const result = await runCronPoll(supabase, oddsApiKey, webhookUrl);

    return res.status(200).json({
      success: result.success,
      evaluation_run_id: result.evaluationRunId,
      triggers_checked: result.triggersChecked,
      matches_found: result.matchesFound,
      alerts_created: result.alertsCreated,
      webhooks_sent: result.webhooksSent,
      duration_ms: result.durationMs,
      error: result.error,
    });
  } catch (error) {
    console.error("[Cron] Unexpected error:", error);
    return res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}