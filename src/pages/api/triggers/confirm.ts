import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { parse } from "cookie";
import { verifyTelegramJWT } from "@/lib/jwt";
import { sendTelegramMessage, ALERT_DISCLAIMER_HTML } from "@/services/telegramService";
import { leagueLabel } from "@/lib/leagues";

/**
 * POST /api/triggers/confirm  { triggerId }
 *
 * Sends the user a Telegram confirmation of the trigger they just created.
 * Auth: the telegram_session cookie; the trigger must belong to that user.
 * Best-effort — the client fires this after creation and ignores failures.
 */

const COMP: Record<string, string> = { ">=": "or better", "<=": "or lower", ">": "or better", "<": "or lower" };

function esc(s: unknown) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function odds(n: number) {
  return n > 0 ? `+${n}` : `${n}`;
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

function periodText(type?: string | null, min?: number | null) {
  if (!type || !min) return "Any time";
  if (type.toLowerCase().startsWith("min")) return `${min} min or later`;
  return `${ordinal(min)} ${type.toLowerCase()} or later`;
}

function marketText(t: any) {
  const bt = String(t.bet_type || "").toLowerCase();
  if (bt.startsWith("total")) return `Total ${t.team_or_player}${t.line_value != null ? ` ${t.line_value}` : ""}`;
  if (bt.startsWith("spread")) return "Spread";
  return "Moneyline";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const token = parse(req.headers.cookie || "").telegram_session;
  const session = token ? verifyTelegramJWT(token) : null;
  if (!session) return res.status(401).json({ error: "Not signed in" });

  const triggerId = String(req.body?.triggerId || "");
  if (!triggerId) return res.status(400).json({ error: "triggerId required" });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(500).json({ error: "Supabase not configured" });
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  try {
    // Ownership check + data in one query.
    const { data: link } = await supabase
      .from("profile_triggers")
      .select("profile_id, trigger:triggers(*), profile:profiles(telegram_chat_id, telegram_first_name)")
      .eq("trigger_id", triggerId)
      .eq("profile_id", session.userId)
      .maybeSingle();

    const t: any = (link as any)?.trigger;
    const chatId: string | null = (link as any)?.profile?.telegram_chat_id ?? null;
    if (!t) return res.status(404).json({ error: "Trigger not found" });
    if (!chatId) return res.status(200).json({ sent: false, reason: "no_telegram" });

    const isTotals = String(t.bet_type || "").toLowerCase().startsWith("total");
    const subject = isTotals ? t.game_label || "Game total" : t.team_or_player;
    const lines = [
      "✅ <b>Trigger set!</b>",
      "",
      `<b>${esc(subject)}</b> · ${esc(leagueLabel(t.sport))}`,
      isTotals ? null : t.game_label ? `Game: ${esc(t.game_label)}` : null,
      `Market: ${esc(marketText(t))}`,
      `Alert when odds hit <b>${esc(odds(Number(t.odds_value)))}</b> ${esc(COMP[t.odds_comparator] ?? t.odds_comparator)}`,
      `When: ${esc(periodText(t.time_period_type, t.time_period_min))}`,
      `Frequency: ${t.frequency === "once" ? "Just this game" : "Every game"}`,
      "",
      "I'll message you here the moment it hits. 🔨",
      "",
      ALERT_DISCLAIMER_HTML,
    ].filter((l) => l !== null);

    const result = await sendTelegramMessage({ chatId, text: lines.join("\n"), parseMode: "HTML" });
    return res.status(200).json({ sent: result.success, error: result.error });
  } catch (e) {
    console.error("[/api/triggers/confirm] error:", e);
    return res.status(500).json({ error: "Failed to send confirmation" });
  }
}
