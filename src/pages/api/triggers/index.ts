import type { NextApiRequest, NextApiResponse } from "next";
import { serviceClient, sessionUserId } from "@/lib/serverAuth";

/**
 * GET  /api/triggers  → the signed-in user's triggers
 * POST /api/triggers  → create a trigger for the signed-in user
 *
 * Triggers and their owner links are closed to the browser's public key; all
 * access goes through here, scoped to the telegram_session user.
 */

const LIST_SELECT = `
  id, profile_id, trigger_id, created_at,
  trigger:triggers (
    id, sport, team_or_player, team_id, bet_type, odds_comparator, odds_value,
    frequency, status, bookmaker, vendor_id, time_period_type, time_period_min,
    line_value, game_label, event_id, created_at, updated_at,
    trigger_matches (
      id, matched_value, matched_at,
      odds_snapshot:odds_snapshots ( bookmaker, bet_type, odds_value, scores_data, snapshot_at )
    )
  )
`;

const BET_TYPES = new Set(["moneyline", "spread", "totals"]);
const COMPARATORS = new Set([">=", "<=", ">", "<"]);
const FREQUENCIES = new Set(["once", "recurring"]);

const str = (v: unknown, max = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = sessionUserId(req);
  if (!userId) return res.status(401).json({ error: "Not signed in" });

  let supabase;
  try {
    supabase = serviceClient();
  } catch {
    return res.status(500).json({ error: "Server not configured" });
  }

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("profile_triggers")
      .select(LIST_SELECT)
      .eq("profile_id", userId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[/api/triggers] list error:", error.message);
      return res.status(500).json({ error: "Failed to load triggers" });
    }
    return res.status(200).json({ data: data ?? [] });
  }

  if (req.method === "POST") {
    const b = req.body ?? {};
    const sport = str(b.sport, 80);
    const team = str(b.team_or_player);
    const betType = str(b.bet_type, 20);
    const comparator = str(b.odds_comparator, 4);
    const oddsValue = num(b.odds_value);
    const frequency = str(b.frequency, 20);
    if (!sport || !team || !betType || !BET_TYPES.has(betType) || !comparator || !COMPARATORS.has(comparator) ||
        oddsValue === null || !frequency || !FREQUENCIES.has(frequency)) {
      return res.status(400).json({ error: "Invalid trigger" });
    }

    const { data: trigger, error: tErr } = await supabase
      .from("triggers")
      .insert({
        sport,
        team_or_player: team,
        team_id: str(b.team_id, 64),
        bet_type: betType,
        odds_comparator: comparator,
        odds_value: oddsValue,
        frequency,
        status: "active",
        vendor_id: str(b.vendor_id, 64),
        bookmaker: str(b.bookmaker, 40),
        time_period_type: str(b.time_period_type, 20),
        time_period_min: num(b.time_period_min),
        event_id: str(b.event_id, 120),
        event_commence: str(b.event_commence, 40),
        line_value: num(b.line_value),
        game_label: str(b.game_label, 80),
      } as any)
      .select("id")
      .single();
    if (tErr || !trigger) {
      console.error("[/api/triggers] create error:", tErr?.message);
      return res.status(500).json({ error: "Failed to create trigger" });
    }

    const { data: link, error: lErr } = await supabase
      .from("profile_triggers")
      .insert({ profile_id: userId, trigger_id: trigger.id })
      .select("id, profile_id, trigger_id, created_at, trigger:triggers (*)")
      .single();
    if (lErr || !link) {
      await supabase.from("triggers").delete().eq("id", trigger.id);
      console.error("[/api/triggers] link error:", lErr?.message);
      return res.status(500).json({ error: "Failed to create trigger" });
    }
    return res.status(200).json({ data: link });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
