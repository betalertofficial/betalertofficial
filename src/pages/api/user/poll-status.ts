import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/user/poll-status
 *
 * Returns the last time the polling cron ran (last_poll_at from admin_settings).
 * No auth required — the timestamp itself is non-sensitive.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ last_poll_at: null });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data } = await supabase
    .from("admin_settings")
    .select("setting_value")
    .eq("setting_key", "last_poll_at")
    .single();

  // Cache for 30s — the cron runs at most every 60s
  res.setHeader("Cache-Control", "public, s-maxage=30");
  return res.status(200).json({ last_poll_at: data?.setting_value ?? null });
}
