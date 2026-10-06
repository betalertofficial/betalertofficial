import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { LEAGUES } from "@/lib/leagues";

/**
 * Daily cron: add recently completed games to public.game_results (powers team
 * W/L + Over/Under trends). Free — ESPN only, zero Odds API credits.
 *
 * For each active dashboard league, scans the last `days` days (default 3, so a
 * missed run self-heals), takes completed games, and reads the closing total +
 * spread from the game summary's pickcenter (falling back to ESPN's core odds
 * API, which keeps lines for older games). Upserts by ESPN event id.
 *
 * Auth: Authorization: Bearer CRON_SECRET (Vercel Cron sends this). Optional
 * ?days=N for a manual backfill (max 30).
 */
export const config = { maxDuration: 300 };

const ESPN = "https://site.api.espn.com/apis/site/v2/sports";
const PATH: Record<string, string> = {
  baseball_mlb: "baseball/mlb",
  basketball_nba: "basketball/nba",
  americanfootball_nfl: "football/nfl",
  icehockey_nhl: "hockey/nhl",
};

async function getJson(url: string): Promise<any | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

function ymd(d: Date) {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

async function closingLine(path: string, eventId: string) {
  const s = await getJson(`${ESPN}/${path}/summary?event=${eventId}`);
  const p = (s?.pickcenter ?? [])[0];
  if (p && typeof p.overUnder === "number") {
    return { total_line: p.overUnder, spread_details: p.details ?? null, line_provider: p.provider?.name ?? null };
  }
  const [sport, league] = path.split("/");
  const core = await getJson(
    `https://sports.core.api.espn.com/v2/sports/${sport}/leagues/${league}/events/${eventId}/competitions/${eventId}/odds`
  );
  for (const it of core?.items ?? []) {
    const name: string = it?.provider?.name ?? "";
    if (/live/i.test(name) || typeof it?.overUnder !== "number") continue;
    return { total_line: it.overUnder, spread_details: it.details ?? null, line_provider: name };
  }
  return { total_line: null, spread_details: null, line_provider: null };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(500).json({ error: "Cron secret not configured" });
  if (req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: "Unauthorized" });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(500).json({ error: "Supabase not configured" });
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const days = Math.min(30, Math.max(1, parseInt(String(req.query.days || "3"), 10) || 3));
  const dates: string[] = [];
  for (let i = 0; i < days; i++) dates.push(ymd(new Date(Date.now() - i * 86400000)));

  const summary: Record<string, number> = {};
  try {
    for (const lg of LEAGUES) {
      const path = PATH[lg.sportKey];
      if (!path) continue;
      const boards = await Promise.all(dates.map((d) => getJson(`${ESPN}/${path}/scoreboard?dates=${d}&limit=200`)));

      const games: any[] = [];
      const seen = new Set<string>();
      for (const b of boards) {
        for (const ev of b?.events ?? []) {
          const c = ev?.competitions?.[0];
          if (!c || c.status?.type?.state !== "post" || seen.has(ev.id)) continue;
          const home = c.competitors?.find((x: any) => x.homeAway === "home");
          const away = c.competitors?.find((x: any) => x.homeAway === "away");
          const hs = parseInt(home?.score, 10);
          const as = parseInt(away?.score, 10);
          if (!home || !away || Number.isNaN(hs) || Number.isNaN(as)) continue;
          seen.add(ev.id);
          games.push({
            event_id: ev.id,
            sport_key: lg.sportKey,
            game_date: ev.date,
            season_type: ev.season?.type ?? null,
            home_team: home.team?.displayName,
            away_team: away.team?.displayName,
            home_score: hs,
            away_score: as,
          });
        }
      }

      // Only fetch lines for games we don't already have a line for.
      const ids = games.map((g) => g.event_id);
      const { data: existing } = ids.length
        ? await supabase.from("game_results").select("event_id, total_line").in("event_id", ids)
        : { data: [] as any[] };
      const haveLine = new Set((existing ?? []).filter((r: any) => r.total_line != null).map((r: any) => r.event_id));

      // Completed games never change, so skip ones already stored with a line.
      // Every upserted row carries the same keys (incl. the line fields), so a
      // mixed batch can't null out columns.
      const todo = games.filter((g) => !haveLine.has(g.event_id));
      const rows: any[] = [];
      for (let i = 0; i < todo.length; i += 8) {
        const batch = todo.slice(i, i + 8);
        const lines = await Promise.all(batch.map((g) => closingLine(path, g.event_id)));
        batch.forEach((g, j) => rows.push({ ...g, ...lines[j] }));
      }

      if (rows.length) {
        const { error } = await supabase.from("game_results").upsert(rows as any, { onConflict: "event_id" });
        if (error) throw error;
      }
      summary[lg.sportKey] = rows.length;
    }
    return res.status(200).json({ success: true, days, upserted: summary });
  } catch (e) {
    console.error("[Cron/sync-results] error:", e);
    return res.status(500).json({ error: "Failed to sync results", upserted: summary });
  }
}
