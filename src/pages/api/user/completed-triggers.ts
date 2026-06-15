import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { parse } from "cookie";
import { verifyTelegramJWT } from "@/lib/jwt";

/**
 * GET /api/user/completed-triggers
 *
 * Returns completed triggers for the authenticated user with their
 * trigger_matches + the odds_snapshot at match time (scores_data = the SCENARIO
 * when the alert fired), AND a `final` score per match (latest snapshot for that
 * game) so the UI can show the OUTCOME + a hit/miss.
 *
 * Uses the service role client to bypass RLS on trigger_matches and
 * odds_snapshots, which are not readable by the anon client.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

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
            event_id,
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

    // Gather the event ids for all matches, then fetch the LATEST snapshot per
    // event (the final score) to compute the outcome.
    const eventIds = new Set<string>();
    for (const t of triggers ?? []) {
      for (const m of (t as any).trigger_matches ?? []) {
        const eid = m.odds_snapshot?.event_id;
        if (eid) eventIds.add(eid);
      }
    }

    const finalByEvent: Record<string, any> = {};
    if (eventIds.size > 0) {
      const { data: snaps } = await supabase
        .from("odds_snapshots")
        .select("event_id, scores_data, snapshot_at")
        .in("event_id", Array.from(eventIds))
        .not("scores_data", "is", null)
        .order("snapshot_at", { ascending: false });
      for (const s of snaps ?? []) {
        if (!finalByEvent[s.event_id]) finalByEvent[s.event_id] = s.scores_data;
      }
    }

    const ptById = Object.fromEntries(
      (profileTriggers ?? []).map((pt) => [pt.trigger_id, pt])
    );

    const data = (triggers ?? []).map((trigger: any) => {
      const matches = (trigger.trigger_matches ?? []).map((m: any) => ({
        ...m,
        final: m.odds_snapshot?.event_id ? finalByEvent[m.odds_snapshot.event_id] ?? null : null,
      }));
      return {
        id: ptById[trigger.id]?.id ?? trigger.id,
        profile_id: payload.userId,
        trigger_id: trigger.id,
        created_at: ptById[trigger.id]?.created_at ?? trigger.created_at,
        trigger: { ...trigger, trigger_matches: matches },
      };
    });

    return res.status(200).json({ data });
  } catch (err) {
    console.error("[completed-triggers] Error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
