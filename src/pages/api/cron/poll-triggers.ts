import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { runCronPoll } from "@/services/cronPollingService";

/**
 * Smart cron endpoint for trigger evaluation
 * GET /api/cron/poll-triggers
 * 
 * Runs every minute via Vercel Cron, but only executes polling if:
 * 1. admin_settings.odds_polling_status = 'true'
 * 2. Enough time has passed since last poll (based on polling_interval_seconds)
 * 
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

    // Fetch settings as key-value pairs
    const { data: settingsRows, error: settingsError } = await supabase
      .from("admin_settings")
      .select("setting_key, setting_value")
      .in("setting_key", ["odds_polling_status", "polling_interval_seconds", "last_poll_at"]);

    if (settingsError) {
      console.error("[Cron] Error fetching admin settings:", settingsError);
      return res.status(500).json({ error: "Failed to fetch settings" });
    }

    // Parse key-value pairs into settings object
    const settings: Record<string, string> = {};
    settingsRows?.forEach(row => {
      settings[row.setting_key] = row.setting_value;
    });

    const pollingEnabled = settings.odds_polling_status === "true";
    const intervalSeconds = parseInt(settings.polling_interval_seconds || "60");
    const lastPollAt = settings.last_poll_at || null;

    console.log(`[Cron] Settings: polling_enabled=${pollingEnabled}, interval=${intervalSeconds}s, last_poll=${lastPollAt}`);

    // If polling is disabled, skip
    if (!pollingEnabled) {
      console.log("[Cron] Polling is disabled, skipping");
      return res.status(200).json({
        skipped: true,
        reason: "Polling disabled in admin settings",
      });
    }

    // Check if enough time has passed since last poll
    const now = new Date();
    
    if (lastPollAt) {
      const lastPoll = new Date(lastPollAt);
      const secondsSinceLastPoll = (now.getTime() - lastPoll.getTime()) / 1000;
      
      if (secondsSinceLastPoll < intervalSeconds) {
        const remainingSeconds = Math.ceil(intervalSeconds - secondsSinceLastPoll);
        console.log(`[Cron] Skipping poll - only ${Math.floor(secondsSinceLastPoll)}s since last poll (interval: ${intervalSeconds}s, ${remainingSeconds}s remaining)`);
        return res.status(200).json({
          skipped: true,
          reason: "Polling interval not reached",
          seconds_since_last_poll: Math.floor(secondsSinceLastPoll),
          required_interval: intervalSeconds,
          seconds_remaining: remainingSeconds,
        });
      }
    }

    console.log(`[Cron] Starting poll (interval: ${intervalSeconds}s, last poll: ${lastPollAt || 'never'})`);

    // Update last_poll_at BEFORE running (prevents concurrent runs)
    // Use upsert to handle case where last_poll_at setting doesn't exist yet
    const { error: updateError } = await supabase
      .from("admin_settings")
      .upsert({ 
        setting_key: "last_poll_at",
        setting_value: now.toISOString(),
        updated_at: now.toISOString()
      }, {
        onConflict: "setting_key"
      });

    if (updateError) {
      console.error("[Cron] Error updating last_poll_at:", updateError);
      // Continue anyway - non-critical
    }

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
      polling_interval_seconds: intervalSeconds,
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