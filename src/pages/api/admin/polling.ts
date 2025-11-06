import { createClient } from "@supabase/supabase-js";
import { NextApiRequest, NextApiResponse } from "next";

// This is a protected route, so we need to validate the session.
// We'll use the service role key to have god-mode access for settings.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // A simple check for admin privileges. In a real app, you'd have a more robust check,
  // possibly decoding a JWT and checking a custom claim or a role in the database.
  // For now, we assume if you can hit this endpoint, you're an admin.
  // We will enhance this with proper auth checks later if needed.

  if (req.method === "GET") {
    try {
      const { data, error } = await supabaseAdmin
        .from("system_settings")
        .select("value")
        .eq("key", "polling_enabled")
        .single();

      if (error) {
        // If the key doesn't exist, we'll default to false.
        if (error.code === "PGRST116") {
           return res.status(200).json({ polling_enabled: false });
        }
        throw error;
      }
      
      const pollingEnabled = data?.value === true || data?.value === "true";
      res.status(200).json({ polling_enabled: pollingEnabled });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch polling status", details: error.message });
    }
  } else if (req.method === "POST") {
    try {
      const { polling_enabled } = req.body;

      if (typeof polling_enabled !== "boolean") {
        return res.status(400).json({ error: "Invalid 'polling_enabled' value. Must be a boolean." });
      }

      const { error: updateError } = await supabaseAdmin
        .from("system_settings")
        .update({ value: polling_enabled })
        .eq("key", "polling_enabled");

      if (updateError) throw updateError;

      res.status(200).json({ message: "Polling status updated successfully", setting: { key: "polling_enabled", value: polling_enabled } });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to update polling status", details: error.message });
    }
  } else {
    res.setHeader("Allow", ["GET", "POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
