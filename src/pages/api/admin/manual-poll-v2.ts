import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { runCronPoll } from "@/services/cronPollingService";

/**
 * Manual poll endpoint for admin testing
 * POST /api/admin/manual-poll-v2
 * Body: { dryRun?: boolean }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Verify user session
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const token = authHeader.substring(7);
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return res.status(500).json({ error: "Supabase not configured" });
    }

    // Create client with user token to verify session
    const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: { user }, error: userError } = await userSupabase.auth.getUser();

    if (userError || !user) {
      return res.status(401).json({ error: "Invalid session" });
    }

    // Check if user is admin
    const { data: profile } = await userSupabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || (profile.role !== "admin" && profile.role !== "super_admin")) {
      return res.status(403).json({ error: "Forbidden: Admin access required" });
    }

    // Get request options
    const { dryRun = false } = req.body;

    // Get environment variables
    const oddsApiKey = process.env.ODDS_API_KEY;
    const webhookUrl = process.env.ZAPIER_WEBHOOK_URL || "https://example.com/webhook";

    if (!oddsApiKey) {
      return res.status(500).json({ error: "Odds API key not configured" });
    }

    console.log(`[ManualPoll] Starting manual poll (dryRun: ${dryRun}) by user ${user.id}`);

    // Create admin Supabase client for actual operations
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // Run cron poll
    const result = await runCronPoll(adminSupabase, oddsApiKey, webhookUrl);

    console.log(`[ManualPoll] Completed: ${JSON.stringify(result)}`);

    return res.status(200).json({
      success: result.success,
      evaluation_run_id: result.evaluationRunId,
      triggers_checked: result.triggersChecked,
      matches_found: result.matchesFound,
      alerts_created: result.alertsCreated,
      webhooks_sent: result.webhooksSent,
      duration_ms: result.durationMs,
      dry_run: dryRun,
      error: result.error,
    });
  } catch (error) {
    console.error("[ManualPoll] Error:", error);
    return res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}