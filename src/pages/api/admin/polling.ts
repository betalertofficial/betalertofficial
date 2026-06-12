import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * Admin polling settings.
 *   GET  /api/admin/polling  → read polling status + interval
 *   POST /api/admin/polling  → update polling status + interval
 *
 * Requires an authenticated admin (Authorization: Bearer <access token>).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireAdmin(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }
  const supabaseAdmin = auth.admin;

  if (req.method === "GET") {
    try {
      const { data, error } = await supabaseAdmin
        .from("admin_settings")
        .select("setting_key, setting_value")
        .in("setting_key", ["odds_polling_status", "polling_interval_seconds"]);
      if (error) throw error;

      const settings: Record<string, string> = {};
      data?.forEach((s: any) => {
        settings[s.setting_key] = s.setting_value;
      });

      return res.status(200).json({
        polling_enabled: settings.odds_polling_status === "true",
        polling_interval_seconds: parseInt(settings.polling_interval_seconds || "30"),
      });
    } catch (error) {
      console.error("[admin/polling] GET error:", error);
      return res.status(500).json({ error: "Failed to fetch polling settings" });
    }
  } else if (req.method === "POST") {
    try {
      const { polling_enabled, polling_interval_seconds } = req.body;

      if (typeof polling_enabled !== "boolean") {
        return res.status(400).json({ error: "Invalid 'polling_enabled' value. Must be a boolean." });
      }

      const { error: statusError } = await supabaseAdmin
        .from("admin_settings")
        .update({ setting_value: polling_enabled.toString(), updated_at: new Date().toISOString() })
        .eq("setting_key", "odds_polling_status");
      if (statusError) throw statusError;

      if (polling_interval_seconds !== undefined) {
        const interval = parseInt(polling_interval_seconds);
        if (isNaN(interval) || interval < 10) {
          return res.status(400).json({ error: "Invalid interval. Must be a number >= 10 seconds." });
        }
        const { error: intervalError } = await supabaseAdmin
          .from("admin_settings")
          .update({ setting_value: interval.toString(), updated_at: new Date().toISOString() })
          .eq("setting_key", "polling_interval_seconds");
        if (intervalError) throw intervalError;
      }

      return res.status(200).json({ message: "Polling settings updated successfully" });
    } catch (error) {
      console.error("[admin/polling] POST error:", error);
      return res.status(500).json({ error: "Failed to update polling settings" });
    }
  } else {
    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
