import { createClient } from "@supabase/supabase-js";
import { NextApiRequest, NextApiResponse } from "next";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Verify this is a cron request from Vercel
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.error("Unauthorized cron request");
    return res.status(401).json({ error: "Unauthorized" });
  }

  console.log("[CRON] Evaluate-triggers cron job triggered");

  try {
    // Fetch polling settings from admin_settings table
    const { data: settings, error: settingsError } = await supabaseAdmin
      .from("admin_settings")
      .select("setting_key, setting_value")
      .in("setting_key", ["odds_polling_status", "polling_interval_seconds"]);

    if (settingsError) {
      console.error("[CRON] Error fetching admin settings:", settingsError.message);
      return res.status(500).json({ error: "Failed to fetch admin settings" });
    }

    // Parse settings into a map for easy access
    const settingsMap = new Map(
      settings?.map(s => [s.setting_key, s.setting_value]) || []
    );

    const pollingStatus = settingsMap.get("odds_polling_status");
    const pollingInterval = settingsMap.get("polling_interval_seconds");

    console.log("[CRON] Polling status:", pollingStatus);
    console.log("[CRON] Polling interval:", pollingInterval, "seconds");

    // Check if polling is enabled
    if (pollingStatus !== "true") {
      console.log("[CRON] Polling is disabled in admin_settings. Skipping evaluation.");
      return res.status(200).json({ message: "Polling disabled in admin_settings" });
    }

    console.log("[CRON] Polling is enabled. Invoking evaluate-triggers function...");

    // Invoke the Supabase Edge Function with interval information
    const { data, error } = await supabaseAdmin.functions.invoke("evaluate-triggers", {
      body: { 
        source: "cron",
        pollingInterval: pollingInterval ? parseInt(pollingInterval) : 60
      }
    });

    if (error) {
      console.error("[CRON] Error invoking evaluate-triggers:", error.message);
      return res.status(500).json({ 
        error: "Failed to invoke evaluate-triggers", 
        details: error.message 
      });
    }

    console.log("[CRON] Successfully invoked evaluate-triggers:", data);
    return res.status(200).json({ 
      message: "Evaluation triggered successfully", 
      result: data 
    });

  } catch (error: any) {
    console.error("[CRON] Unexpected error:", error.message);
    return res.status(500).json({ 
      error: "Unexpected error during cron execution", 
      details: error.message 
    });
  }
}