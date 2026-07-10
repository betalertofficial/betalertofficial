import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { runCronPoll } from "@/services/cronPollingService";

/**
 * Smart cron endpoint for trigger evaluation
 * GET /api/cron/poll-triggers
 *
 * Runs every minute via Vercel Cron, but only executes a poll if:
 * 1. admin_settings.odds_polling_status = 'true'
 * 2. Enough time has passed since the last poll, using a TIERED interval:
 *      - poll_interval_live_seconds  (default 60)  when the previous tick found
 *        a live game featuring a triggered team (last_poll_live = 'true')
 *      - poll_interval_idle_seconds  (default 300) otherwise
 *    Idle ticks cost ZERO Odds API credits (the liveness check is free ESPN),
 *    so the idle interval mainly trades wake-up latency for fewer invocations /
 *    less DB churn and can be lowered without spending credits.
 *
 * Requires: Authorization: Bearer CRON_SECRET
 */

// Extend Vercel's function timeout to 5 minutes.
// A full poll run chains: Odds API fetch → ESPN calls → DB batch insert → match
// evaluation → Telegram delivery, which can exceed the default 10-15s limit.
// Without this, Vercel silently kills the function mid-run while last_poll_at
// is already stamped, causing the next invocation to skip its interval check.
export const config = { maxDuration: 300 };

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
      console.warn("[Cron] ZAPIER_WEBHOOK_URL not configured - Telegram-only alerts will still work");
    }

    // Create admin Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch settings as key-value pairs
    const { data: settingsRows, error: settingsError } = await supabase
      .from("admin_settings")
      .select("setting_key, setting_value")
      .in("setting_key", [
        "odds_polling_status",
        "polling_interval_seconds", // legacy fallback for the live interval
        "poll_interval_live_seconds",
        "poll_interval_idle_seconds",
        "last_poll_at",
        "last_poll_live",
      ]);

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
    const legacyInterval = parseInt(settings.polling_interval_seconds || "60");
    const liveInterval = parseInt(settings.poll_interval_live_seconds || String(legacyInterval));
    const idleInterval = parseInt(settings.poll_interval_idle_seconds || "300");
    const lastPollAt = settings.last_poll_at || null;
    // Whether the previous poll found a live triggered game. Drives which
    // interval applies this tick (a 1-tick-lagging heuristic, which is fine:
    // when a game ends we do one extra live-cadence tick before backing off; a
    // game going live is picked up within one idle interval).
    const lastPollLive = settings.last_poll_live === "true";
    const intervalSeconds = lastPollLive ? liveInterval : idleInterval;

    console.log(
      `[Cron] Settings: polling_enabled=${pollingEnabled}, mode=${lastPollLive ? "live" : "idle"}, ` +
      `interval=${intervalSeconds}s (live=${liveInterval}s, idle=${idleInterval}s), last_poll=${lastPollAt}`
    );

    // If polling is disabled, skip
    if (!pollingEnabled) {
      console.log("[Cron] Polling is disabled, skipping");
      return res.status(200).json({
        skipped: true,
        reason: "Polling disabled in admin settings",
      });
    }

    // Check if enough time has passed since last poll (tiered interval)
    const now = new Date();

    if (lastPollAt) {
      const lastPoll = new Date(lastPollAt);
      const secondsSinceLastPoll = (now.getTime() - lastPoll.getTime()) / 1000;

      if (secondsSinceLastPoll < intervalSeconds) {
        const remainingSeconds = Math.ceil(intervalSeconds - secondsSinceLastPoll);
        console.log(`[Cron] Skipping poll - only ${Math.floor(secondsSinceLastPoll)}s since last poll (${lastPollLive ? "live" : "idle"} interval: ${intervalSeconds}s, ${remainingSeconds}s remaining)`);
        return res.status(200).json({
          skipped: true,
          reason: "Polling interval not reached",
          mode: lastPollLive ? "live" : "idle",
          seconds_since_last_poll: Math.floor(secondsSinceLastPoll),
          required_interval: intervalSeconds,
          seconds_remaining: remainingSeconds,
        });
      }
    }

    console.log(`[Cron] Starting poll (${lastPollLive ? "live" : "idle"} interval: ${intervalSeconds}s, last poll: ${lastPollAt || 'never'})`);

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

    // Run cron poll (webhookUrl is read from process.env inside alertService directly)
    const result = await runCronPoll(supabase, oddsApiKey, webhookUrl ?? "");

    // Persist whether a triggered game was live this run so the NEXT tick picks
    // the correct tier (live vs idle). Best-effort; non-critical.
    const { error: modeError } = await supabase
      .from("admin_settings")
      .upsert({
        setting_key: "last_poll_live",
        setting_value: result.wasLive ? "true" : "false",
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "setting_key",
      });
    if (modeError) {
      console.error("[Cron] Error updating last_poll_live:", modeError);
    }

    return res.status(200).json({
      success: result.success,
      polling_mode: result.wasLive ? "live" : "idle",
      evaluation_run_id: result.evaluationRunId,
      triggers_checked: result.triggersChecked,
      matches_found: result.matchesFound,
      alerts_created: result.alertsCreated,
      webhooks_sent: result.webhooksSent,
      duration_ms: result.durationMs,
      live_interval_seconds: liveInterval,
      idle_interval_seconds: idleInterval,
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
