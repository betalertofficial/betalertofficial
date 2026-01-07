import { createClient } from "@supabase/supabase-js";
import { NextApiRequest, NextApiResponse } from "next";

// This is a protected route, so we need to validate the session.
// We'll use the service role key to have god-mode access for settings.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    try {
      // Get both polling status and interval from admin_settings
      const { data, error } = await supabaseAdmin
        .from("admin_settings")
        .select("setting_key, setting_value")
        .in("setting_key", ["odds_polling_status", "polling_interval_seconds"]);

      if (error) throw error;

      // Parse the settings
      const settings: Record<string, string> = {};
      data?.forEach(setting => {
        settings[setting.setting_key] = setting.setting_value;
      });

      const pollingEnabled = settings.odds_polling_status === "true";
      const pollingInterval = parseInt(settings.polling_interval_seconds || "30");

      res.status(200).json({ 
        polling_enabled: pollingEnabled,
        polling_interval_seconds: pollingInterval
      });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch polling settings", details: error.message });
    }
  } else if (req.method === "POST") {
    try {
      const { polling_enabled, polling_interval_seconds } = req.body;

      if (typeof polling_enabled !== "boolean") {
        return res.status(400).json({ error: "Invalid 'polling_enabled' value. Must be a boolean." });
      }

      // Update polling status
      const { error: statusError } = await supabaseAdmin
        .from("admin_settings")
        .update({ 
          setting_value: polling_enabled.toString(),
          updated_at: new Date().toISOString()
        })
        .eq("setting_key", "odds_polling_status");

      if (statusError) throw statusError;

      // If interval is provided, update it too
      if (polling_interval_seconds !== undefined) {
        const interval = parseInt(polling_interval_seconds);
        if (isNaN(interval) || interval < 10) {
          return res.status(400).json({ error: "Invalid interval. Must be a number >= 10 seconds." });
        }

        const { error: intervalError } = await supabaseAdmin
          .from("admin_settings")
          .update({ 
            setting_value: interval.toString(),
            updated_at: new Date().toISOString()
          })
          .eq("setting_key", "polling_interval_seconds");

        if (intervalError) throw intervalError;
      }

      res.status(200).json({ 
        message: "Polling settings updated successfully",
        settings: { 
          odds_polling_status: polling_enabled,
          polling_interval_seconds: polling_interval_seconds || 30
        } 
      });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to update polling settings", details: error.message });
    }
  } else {
    res.setHeader("Allow", ["GET", "POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}