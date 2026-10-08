import type { NextApiRequest } from "next";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { parse } from "cookie";
import { verifyTelegramJWT } from "@/lib/jwt";

/** Signed-in user's profile id from the telegram_session cookie, or null. */
export function sessionUserId(req: NextApiRequest): string | null {
  const token = parse(req.headers.cookie || "").telegram_session;
  const payload = token ? verifyTelegramJWT(token) : null;
  return payload?.userId ?? null;
}

/** Service-role client for server routes (bypasses RLS — always scope by user). */
export function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase not configured");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
