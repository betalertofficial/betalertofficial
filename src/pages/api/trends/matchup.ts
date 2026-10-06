import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { computeMatchupTrends, type GameRow } from "@/lib/trends";
import { teamNamesMatch } from "@/lib/teamMatch";

/**
 * GET /api/trends/matchup?sport=baseball_mlb&home=Atlanta%20Braves&away=Los%20Angeles%20Dodgers&line=8.5
 *
 * Team W/L, venue split, Over/Under vs closing total, average combined score,
 * and head-to-head — from public.game_results (ESPN, free). `line` (today's
 * total) is optional; when given, each window also reports how many games
 * would have gone over it.
 */
const COLS = "event_id, game_date, home_team, away_team, home_score, away_score, total_line";

function quote(v: string) {
  return `"${v.replace(/"/g, '\\"')}"`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const sport = String(req.query.sport || "");
  const home = String(req.query.home || "");
  const away = String(req.query.away || "");
  const lineNum = req.query.line !== undefined ? parseFloat(String(req.query.line)) : NaN;
  const line = Number.isFinite(lineNum) ? lineNum : null;
  if (!sport || !home || !away) return res.status(400).json({ error: "sport, home and away are required" });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return res.status(500).json({ error: "Supabase not configured" });
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  try {
    // 1) Exact-name match (ESPN and the Odds API use the same full names for
    //    almost every team).
    const names = `(${quote(home)},${quote(away)})`;
    const { data: exact, error } = await supabase
      .from("game_results")
      .select(COLS)
      .eq("sport_key", sport)
      .or(`home_team.in.${names},away_team.in.${names}`)
      .order("game_date", { ascending: false })
      .limit(1000);
    if (error) throw error;
    let rows: GameRow[] = (exact as GameRow[]) || [];

    // 2) Fallback for name variants (e.g. aliases): fuzzy-load by nickname and
    //    keep rows that the shared matcher accepts.
    for (const team of [home, away]) {
      if (rows.some((g) => teamNamesMatch(g.home_team, team) || teamNamesMatch(g.away_team, team))) continue;
      const nick = team.trim().split(/\s+/).pop() || team;
      const { data: fuzzy } = await supabase
        .from("game_results")
        .select(COLS)
        .eq("sport_key", sport)
        .or(`home_team.ilike.%${nick}%,away_team.ilike.%${nick}%`)
        .order("game_date", { ascending: false })
        .limit(400);
      const extra = ((fuzzy as GameRow[]) || []).filter(
        (g) => teamNamesMatch(g.home_team, team) || teamNamesMatch(g.away_team, team)
      );
      const seen = new Set(rows.map((r) => r.event_id));
      rows = rows.concat(extra.filter((g) => !seen.has(g.event_id)));
    }

    const trends = computeMatchupTrends(sport, home, away, rows, line);
    res.setHeader("Cache-Control", "public, s-maxage=900, stale-while-revalidate=3600");
    return res.status(200).json(trends);
  } catch (e) {
    console.error("[/api/trends/matchup] error:", e);
    return res.status(500).json({ error: "Failed to load trends" });
  }
}
