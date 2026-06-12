import type { NextApiRequest } from "next";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared admin authentication guard for API routes.
 *
 * Verifies the caller's Supabase session (Bearer access token), then RE-CHECKS
 * their admin role using the service-role client. The re-check is deliberate:
 * it does not rely on RLS being correctly configured, closing the
 * privilege-escalation gap where a user could otherwise self-grant a role.
 *
 * Usage:
 *   const auth = await requireAdmin(req);
 *   if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
 *   const supabase = auth.admin; // service-role client, safe to use
 */
export type AdminAuthResult =
  | { ok: true; userId: string; admin: SupabaseClient }
  | { ok: false; status: number; error: string };

export async function requireAdmin(req: NextApiRequest): Promise<AdminAuthResult> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  const token = authHeader.substring(7);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    return { ok: false, status: 500, error: "Supabase not configured" };
  }

  // 1. Verify the caller's identity using their own token (anon client).
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) {
    return { ok: false, status: 401, error: "Invalid session" };
  }

  // 2. Re-check the role with the service-role client (independent of RLS).
  const admin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || (profile.role !== "admin" && profile.role !== "super_admin")) {
    return { ok: false, status: 403, error: "Forbidden: Admin access required" };
  }

  return { ok: true, userId: user.id, admin };
}
