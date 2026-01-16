import { createClient } from "@supabase/supabase-js";
import { NextApiRequest, NextApiResponse } from "next";
import { pollingService } from "@/services/pollingService";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Verify this is a cron request from Vercel
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.error("[CRON] Unauthorized cron request");
    return res.status(401).json({ error: "Unauthorized" });
  }

  const timestamp = new Date().toISOString();
  console.log("[CRON] ============================================");
  console.log("[CRON] Evaluate-triggers cron job triggered at", timestamp);

  try {
    // Validate environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const oddsApiKey = process.env.ODDS_API_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("[CRON] Missing Supabase environment variables");
      return res.status(500).json({ error: "Missing Supabase configuration" });
    }

    if (!oddsApiKey) {
      console.error("[CRON] Missing ODDS_API_KEY environment variable");
      return res.status(500).json({ error: "Missing Odds API configuration" });
    }

    // Create Supabase admin client with service role key
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Use the shared polling service
    const result = await pollingService.evaluateTriggers(
      supabaseAdmin,
      oddsApiKey,
      "[CRON]"
    );

    // If polling is disabled, return early
    if (result.pollingDisabled) {
      console.log("[CRON] ============================================");
      return res.status(200).json({
        success: true,
        message: result.message,
        pollingDisabled: true,
        timestamp
      });
    }

    console.log("[CRON] ============================================");
    console.log(`[CRON] Evaluation complete - Checked: ${result.checked}, Hit: ${result.hit}`);

    return res.status(200).json({
      success: result.success,
      checked: result.checked,
      hit: result.hit,
      matches: result.matches,
      alerts: result.alerts,
      timestamp,
      message: result.message
    });

  } catch (error: any) {
    console.error("[CRON] Unexpected error:", error.message, error.stack);
    return res.status(500).json({ 
      error: "Unexpected error during cron execution", 
      details: error.message 
    });
  }
}