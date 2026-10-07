import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { LEAGUES } from "@/lib/leagues";
import { computeMatchupTrends, type GameRow } from "@/lib/trends";
import { buildInsights, type TrendInsight } from "@/lib/trendInsights";

/**
 * GET /api/trends/today
 *
 * Today's live + upcoming games across the dashboard leagues, each with its
 * strongest team/total trends (from public.game_results). Ranked so the most
 * lopsided trends come first. Free: ESPN + our own DB, zero Odds API credits.
 */
export const config = { maxDuration: 60 };

const ESPN = "https://site.api.espn.com/apis/site/v2/sports";
const PATH: Record<string, string> = {
  baseball_mlb: "baseball/mlb",
  basketball_nba: "basketball/nba",
  americanfootball_nfl: "football/nfl",
  icehockey_nhl: "hockey/nhl",
};
const COLS = "event_id, game_date, home_team, away_team, home_score, away_score, total_line";

export interface TrendGame {
  id: string;
  sportKey: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  live: boolean;
  liveDetail: string | null;
  homeScore: number | null;
  awayScore: number | null;
  totalLine: number | null;
  /** Current prices from ESPN (DraftKings), pre-game only. */
  homeMl: number | null;
  awayMl: number | null;
  overPrice: number | null;
  underPrice: number | null;
  insights: TrendInsight[];
  topStrength: number;
}

function price(v: unknown): number | null {
  const n = parseInt(String(v ?? "").replace(/^\+/, ""), 10);
  return Number.isFinite(n) ? n : null;
}

async function getJson(url: string): Promise<any | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

function quote(v: string) {
  return `"${v.replace(/"/g, '\\"')}"`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return res.status(500).json({ error: "Supabase not configured" });
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  try {
    const now = Date.now();
    const perLeague = await Promise.all(
      LEAGUES.map(async (lg) => {
        const path = PATH[lg.sportKey];
        if (!path) return [] as TrendGame[];
        const board = await getJson(`${ESPN}/${path}/scoreboard`);

        // Live games, plus games starting in the next 18h. Skip preseason
        // (season type 1) — last season's trends would be misleading.
        const evs = (board?.events ?? []).filter((ev: any) => {
          const c = ev?.competitions?.[0];
          const state = c?.status?.type?.state;
          if ((ev?.season?.type ?? 2) === 1) return false;
          if (state === "in") return true;
          if (state !== "pre") return false;
          const t = new Date(ev.date).getTime();
          return t - now < 18 * 3600 * 1000;
        });
        if (evs.length === 0) return [];

        const games = await Promise.all(
          evs.map(async (ev: any) => {
            const c = ev.competitions[0];
            const home = c.competitors.find((x: any) => x.homeAway === "home");
            const away = c.competitors.find((x: any) => x.homeAway === "away");
            let line: number | null = typeof c.odds?.[0]?.overUnder === "number" ? c.odds[0].overUnder : null;
            if (line === null) {
              // Live games drop the scoreboard line; the summary keeps the pre-game one.
              const s = await getJson(`${ESPN}/${path}/summary?event=${ev.id}`);
              const ou = s?.pickcenter?.[0]?.overUnder;
              line = typeof ou === "number" ? ou : null;
            }
            const live = c.status.type.state === "in";
            return {
              id: ev.id,
              sportKey: lg.sportKey,
              homeTeam: home?.team?.displayName ?? "",
              awayTeam: away?.team?.displayName ?? "",
              commenceTime: ev.date,
              live,
              liveDetail: live ? c.status.type.shortDetail ?? "Live" : null,
              homeScore: live ? parseInt(home?.score, 10) : null,
              awayScore: live ? parseInt(away?.score, 10) : null,
              totalLine: line,
              homeMl: price(c.odds?.[0]?.moneyline?.home?.close?.odds),
              awayMl: price(c.odds?.[0]?.moneyline?.away?.close?.odds),
              overPrice: price(c.odds?.[0]?.total?.over?.close?.odds),
              underPrice: price(c.odds?.[0]?.total?.under?.close?.odds),
            };
          })
        );

        // One DB query per league for every team playing today.
        const names = Array.from(new Set(games.flatMap((g) => [g.homeTeam, g.awayTeam]).filter(Boolean)));
        const list = `(${names.map(quote).join(",")})`;
        const { data } = await supabase
          .from("game_results")
          .select(COLS)
          .eq("sport_key", lg.sportKey)
          .or(`home_team.in.${list},away_team.in.${list}`)
          .order("game_date", { ascending: false })
          .limit(5000);
        const rows = (data as GameRow[]) || [];

        return games.map((g) => {
          const tr = computeMatchupTrends(lg.sportKey, g.homeTeam, g.awayTeam, rows, g.totalLine);
          const insights = buildInsights(tr, g.homeTeam, g.awayTeam).map((i) => ({
            ...i,
            price:
              i.kind === "totals"
                ? i.side === "over"
                  ? g.overPrice
                  : g.underPrice
                : i.team === g.homeTeam
                ? g.homeMl
                : i.team === g.awayTeam
                ? g.awayMl
                : null,
          }));
          return { ...g, insights, topStrength: insights[0]?.strength ?? 0 } as TrendGame;
        });
      })
    );

    const games = perLeague
      .flat()
      .filter((g) => g.insights.length > 0)
      .sort((a, b) => b.topStrength - a.topStrength);

    res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=1800");
    return res.status(200).json({ games });
  } catch (e) {
    console.error("[/api/trends/today] error:", e);
    return res.status(500).json({ error: "Failed to load trends" });
  }
}
