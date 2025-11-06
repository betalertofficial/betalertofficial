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
    // Check if polling is enabled
    const { data: settings, error: settingsError } = await supabaseAdmin
      .from("system_settings")
      .select("is_polling_enabled")
      .single();

    if (settingsError) {
      console.error("[CRON] Error fetching system settings:", settingsError.message);
      return res.status(500).json({ error: "Failed to fetch system settings" });
    }

    if (!settings?.is_polling_enabled) {
      console.log("[CRON] Polling is disabled. Skipping evaluation.");
      return res.status(200).json({ message: "Polling is disabled" });
    }

    console.log("[CRON] Polling is enabled. Invoking evaluate-triggers function...");

    // Invoke the Supabase Edge Function
    const { data, error } = await supabaseAdmin.functions.invoke("evaluate-triggers", {
      body: { source: "cron" }
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