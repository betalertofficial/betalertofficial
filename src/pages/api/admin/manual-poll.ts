import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { pollingService } from "@/services/pollingService";

// Use local API key
const ODDS_API_KEY = "8fd23ab732557e3db9238fc571eddbbe";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Get auth token from request
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const token = authHeader.replace("Bearer ", "");

    // Create Supabase client with user's token
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }
    );

    // Verify admin access
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || (profile.role !== "admin" && profile.role !== "super_admin")) {
      return res.status(403).json({ error: "Forbidden: Admin access required" });
    }

    console.log("=== Starting Manual Poll ===");

    // Use the shared polling service with the same logic as cron
    const result = await pollingService.evaluateTriggers(
      supabase,
      ODDS_API_KEY,
      "[MANUAL]"
    );

    // If polling is disabled, still allow manual poll to run
    // (manual poll can override the disabled status)
    if (result.pollingDisabled) {
      console.log("=== Manual Poll Complete (Polling Disabled) ===");
      return res.status(200).json({
        success: true,
        checked: 0,
        hit: 0,
        matches: 0,
        alerts: 0,
        message: "Polling is currently disabled in admin settings, but manual poll can still run. No triggers were evaluated.",
        pollingDisabled: true
      });
    }

    console.log("=== Manual Poll Complete ===");
    console.log(`Checked: ${result.checked}, Hit: ${result.hit}`);

    return res.status(200).json({
      success: result.success,
      checked: result.checked,
      hit: result.hit,
      matches: result.matches,
      alerts: result.alerts,
      message: result.message
    });

  } catch (error: any) {
    console.error("Manual poll error:", error);
    return res.status(500).json({ 
      error: "Internal Server Error",
      details: error.message,
    });
  }
}