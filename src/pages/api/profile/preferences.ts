import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { parse } from "cookie";
import { verifyTelegramJWT } from "@/lib/jwt";

/**
 * POST /api/profile/preferences  { preferred_sportsbook }
 *
 * Updates the signed-in user's own preferences. Auth comes from the
 * telegram_session cookie; the write uses the service role, because the
 * profiles table no longer accepts writes from the browser's public key.
 * Only whitelisted fields can be changed here.
 */
const SPORTSBOOKS = new Set(["draftkings", "fanduel", "best"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const token = parse(req.headers.cookie || "").telegram_session;
  const session = token ? verifyTelegramJWT(token) : null;
  if (!session) return res.status(401).json({ error: "Not signed in" });

  const book = req.body?.preferred_sportsbook;
  if (typeof book !== "string" || !SPORTSBOOKS.has(book)) {
    return res.status(400).json({ error: "Invalid preferred_sportsbook" });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(500).json({ error: "Supabase not configured" });
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data, error } = await supabase
    .from("profiles")
    .update({ preferred_sportsbook: book, updated_at: new Date().toISOString() } as any)
    .eq("id", session.userId)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[/api/profile/preferences] update error:", error.message);
    return res.status(500).json({ error: "Failed to update preferences" });
  }
  if (!data) return res.status(404).json({ error: "Profile not found" });
  return res.status(200).json({ profile: data });
}
