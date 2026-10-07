import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { LEAGUES } from "@/lib/leagues";
import { computeMatchupTrends, type GameRow } from "@/lib/trends";
import { teamNamesMatch } from "@/lib/teamMatch";
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
  /** Starting prices: opening line pre-game; pre-game close for live games. */
  homeMlStart: number | null;
  awayMlStart: number | null;
  overStart: number | null;
  underStart: number | null;
  /** Live total line from the Odds API (live games), when known. */
  liveTotal: number | null;
  insights: TrendInsight[];
  topStrength: number;
}

function price(v: unknown): number | null {
  const n = parseInt(String(v ?? "").replace(/^\+/, ""), 10);
  return Number.isFinite(n) ? n : null;
}

// Live prices for in-progress games: ESPN stops quoting once a game starts, so
// pull h2h + totals from the Odds API — only for sports that have a live game
// on the Trends list, cached 10 minutes per sport (≈2 credits per sport per
// 10 min while games are live).
const liveCache = new Map<string, { at: number; events: any[] }>();
async function liveOddsFor(sportKey: string): Promise<any[]> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return [];
  const c = liveCache.get(sportKey);
  if (c && Date.now() - c.at < 10 * 60 * 1000) return c.events;
  const events =
    (await getJson(
      `https://api.the-odds-api.com/v4/sports/${sportKey}/odds?apiKey=${apiKey}&regions=us&markets=h2h,totals&bookmakers=draftkings,fanduel&oddsFormat=american`
    )) ?? [];
  liveCache.set(sportKey, { at: Date.now(), events: Array.isArray(events) ? events : [] });
  return Array.isArray(events) ? events : [];
}

function liveMarkets(events: any[], home: string, away: string, commence: string) {
  const at = new Date(commence).getTime();
  const ev = events.find(
    (e) =>
      teamNamesMatch(e.home_team, home) &&
      teamNamesMatch(e.away_team, away) &&
      Math.abs(new Date(e.commence_time).getTime() - at) < 6 * 3600 * 1000
  );
  if (!ev) return null;
  const books = [...(ev.bookmakers || [])].sort((a: any, b: any) => (a.key === "draftkings" ? -1 : b.key === "draftkings" ? 1 : 0));
  const out: { homeMl: number | null; awayMl: number | null; over: number | null; under: number | null; total: number | null } =
    { homeMl: null, awayMl: null, over: null, under: null, total: null };
  for (const b of books) {
    const h2h = b.markets?.find((m: any) => m.key === "h2h");
    if (h2h && out.homeMl === null) {
      out.homeMl = h2h.outcomes?.find((o: any) => o.name === ev.home_team)?.price ?? null;
      out.awayMl = h2h.outcomes?.find((o: any) => o.name === ev.away_team)?.price ?? null;
    }
    const tot = b.markets?.find((m: any) => m.key === "totals");
    if (tot && out.over === null) {
      const o = tot.outcomes?.find((x: any) => x.name === "Over");
      const u = tot.outcomes?.find((x: any) => x.name === "Under");
      out.over = o?.price ?? null;
      out.under = u?.price ?? null;
      out.total = typeof o?.point === "number" ? o.point : null;
    }
  }
  return out;
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
            const live = c.status.type.state === "in";
            // Pre-game: ESPN's scoreboard odds (open + current). Live: the
            // scoreboard drops odds, so read the pre-game close from the summary.
            let o: any = c.odds?.[0] ?? null;
            if (live || line === null) {
              const s = await getJson(`${ESPN}/${path}/summary?event=${ev.id}`);
              const pc = s?.pickcenter?.[0];
              if (pc) o = pc;
              if (line === null && typeof pc?.overUnder === "number") line = pc.overUnder;
            }
            const close = (side: any) => price(side?.close?.odds);
            const open = (side: any) => price(side?.open?.odds);
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
              // Pre-game: start = open, now = current. Live: start = pre-game
              // close; "now" is filled from the Odds API below.
              homeMl: live ? null : close(o?.moneyline?.home),
              awayMl: live ? null : close(o?.moneyline?.away),
              overPrice: live ? null : close(o?.total?.over),
              underPrice: live ? null : close(o?.total?.under),
              homeMlStart: live ? close(o?.moneyline?.home) : open(o?.moneyline?.home),
              awayMlStart: live ? close(o?.moneyline?.away) : open(o?.moneyline?.away),
              overStart: live ? close(o?.total?.over) : open(o?.total?.over),
              underStart: live ? close(o?.total?.under) : open(o?.total?.under),
              liveTotal: null as number | null,
            };
          })
        );

        // Live games: current prices from the Odds API (one cached call per sport).
        if (games.some((g) => g.live)) {
          const events = await liveOddsFor(lg.sportKey);
          for (const g of games) {
            if (!g.live) continue;
            const m = liveMarkets(events, g.homeTeam, g.awayTeam, g.commenceTime);
            if (!m) continue;
            g.homeMl = m.homeMl;
            g.awayMl = m.awayMl;
            g.overPrice = m.over;
            g.underPrice = m.under;
            g.liveTotal = m.total;
          }
        }

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
            startPrice:
              i.kind === "totals"
                ? i.side === "over"
                  ? g.overStart
                  : g.underStart
                : i.team === g.homeTeam
                ? g.homeMlStart
                : i.team === g.awayTeam
                ? g.awayMlStart
                : null,
            priceLine: i.kind === "totals" && g.liveTotal != null && g.liveTotal !== g.totalLine ? g.liveTotal : null,
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
