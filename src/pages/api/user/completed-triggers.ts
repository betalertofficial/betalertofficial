import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { parse } from "cookie";
import { verifyTelegramJWT } from "@/lib/jwt";

/**
 * GET /api/user/completed-triggers
 *
 * Returns completed triggers for the authenticated user with their
 * trigger_matches and odds_snapshot data (including ESPN scores_data).
 *
 * Uses the service role client to bypass RLS on trigger_matches and
 * odds_snapshots, which are not readable by the anon client.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Verify Telegram JWT from cookie
  const cookies = parse(req.headers.cookie || "");
  const payload = verifyTelegramJWT(cookies.telegram_session || "");
  if (!payload) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: "Supabase not configured" });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Step 1: Get the trigger IDs owned by this user
    const { data: profileTriggers, error: ptError } = await supabase
      .from("profile_triggers")
      .select("id, trigger_id, created_at")
      .eq("profile_id", payload.userId);

    if (ptError) {
      return res.status(500).json({ error: ptError.message });
    }

    const triggerIds = (profileTriggers ?? []).map((pt) => pt.trigger_id);
    if (triggerIds.length === 0) {
      return res.status(200).json({ data: [] });
    }

    // Step 2: Fetch completed triggers with matches + snapshot (service role bypasses RLS)
    const { data: triggers, error: tError } = await supabase
      .from("triggers")
      .select(`
        id,
        sport,
        team_or_player,
        bet_type,
        odds_comparator,
        odds_value,
        frequency,
        status,
        bookmaker,
        vendor_id,
        time_period_type,
        time_period_min,
        created_at,
        updated_at,
        trigger_matches (
          id,
          matched_value,
          matched_at,
          odds_snapshot:odds_snapshots (
            bookmaker,
            bet_type,
            odds_value,
            scores_data,
            snapshot_at
          )
        )
      `)
      .in("id", triggerIds)
      .eq("status", "completed")
      .order("created_at", { ascending: false });

    if (tError) {
      return res.status(500).json({ error: tError.message });
    }

    // Re-shape into ProfileTrigger format so the client code stays the same
    const ptById = Object.fromEntries(
      (profileTriggers ?? []).map((pt) => [pt.trigger_id, pt])
    );

    const data = (triggers ?? []).map((trigger) => ({
      id: ptById[trigger.id]?.id ?? trigger.id,
      profile_id: payload.userId,
      trigger_id: trigger.id,
      created_at: ptById[trigger.id]?.created_at ?? trigger.created_at,
      trigger,
    }));

    return res.status(200).json({ data });
  } catch (err) {
    console.error("[completed-triggers] Error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
