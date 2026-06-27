import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { espnService } from "@/services/espnService";
import { SPORT_KEYS } from "@/lib/leagues";
import { teamNamesMatch } from "@/lib/teamMatch";

/**
 * GET /api/odds/comebacks
 *
 * "Comeback's On" — live games where the team that OPENED as the favorite
 * (negative opening moneyline) is CURRENTLY TRAILING on the scoreboard.
 *
 * Decoupled from the poller: live games + scores come from ESPN (free), the
 * opening favorite comes from game_opening_odds (captured pre-game by the daily
 * sync), and the current live moneyline is fetched from the Odds API only for
 * the few sports that actually have a comeback candidate. Teams are matched
 * across sources by name (teamNamesMatch), so it no longer depends on the
 * stale event_schedules table or cron-written odds_snapshots.
 */

interface OpeningRow {
  event_id: string;
  sport: string;
  home_team: string;
  away_team: string;
  home_ml: number | null;
  away_ml: number | null;
  commence_time: string;
}

/** Fetch current h2h moneylines for a sport from the Odds API → name → price. */
async function fetchCurrentMl(sport: string, apiKey: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  try {
    const r = await fetch(
      `https://api.the-odds-api.com/v4/sports/${sport}/odds?apiKey=${apiKey}&regions=us&markets=h2h&bookmakers=fanduel,draftkings&oddsFormat=american`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!r.ok) return out;
    const events = await r.json();
    for (const ev of events || []) {
      for (const bm of ev.bookmakers || []) {
        const mkt = (bm.markets || []).find((m: any) => m.key === "h2h");
        if (!mkt) continue;
        for (const o of mkt.outcomes || []) {
          if (out[o.name] === undefined) out[o.name] = Number(o.price);
        }
      }
    }
  } catch {
    /* best-effort */
  }
  return out;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return res.status(500).json({ error: "Supabase not configured" });
  }
  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // 1. Live games + scores from ESPN (free) for each tracked league.
    const perLeague = await Promise.all(
      SPORT_KEYS.map(async (sk) => ({ sk, games: await espnService.getLiveGames(sk).catch(() => []) }))
    );
    const liveGames = perLeague.flatMap(({ sk, games }) => games.map((g) => ({ ...g, sportKey: sk })));

    if (liveGames.length === 0) {
      res.setHeader("Cache-Control", "public, s-maxage=30");
      return res.status(200).json({ comebacks: [] });
    }

    // 2. Opening lines captured for TODAY's games (scope to last 12h so we don't
    //    match a team's stale opener from a previous game).
    const since = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    const { data: openingRows } = await (supabase as any)
      .from("game_opening_odds")
      .select("event_id, sport, home_team, away_team, home_ml, away_ml, commence_time")
      .gte("commence_time", since);
    const opening: OpeningRow[] = openingRows || [];

    // 3. Match each live game to its opening line and keep favorites that trail.
    const candidates: any[] = [];
    for (const g of liveGames) {
      const open = opening.find(
        (o) =>
          (teamNamesMatch(o.home_team, g.homeTeam) && teamNamesMatch(o.away_team, g.awayTeam)) ||
          (teamNamesMatch(o.home_team, g.awayTeam) && teamNamesMatch(o.away_team, g.homeTeam))
      );
      if (!open) continue;

      const homeMl = Number(open.home_ml);
      const awayMl = Number(open.away_ml);
      if (Number.isNaN(homeMl) || Number.isNaN(awayMl)) continue;

      // Opening favorite (more-negative moneyline) by opening-row team name.
      let favName: string | null = null;
      let oppName: string | null = null;
      let favOpenMl: number | null = null;
      if (homeMl < 0 && (awayMl >= 0 || homeMl < awayMl)) {
        favName = open.home_team; oppName = open.away_team; favOpenMl = homeMl;
      } else if (awayMl < 0 && (homeMl >= 0 || awayMl < homeMl)) {
        favName = open.away_team; oppName = open.home_team; favOpenMl = awayMl;
      }
      if (!favName) continue;

      // Map the favorite onto the ESPN home/away to read the live score.
      const favIsEspnHome = teamNamesMatch(favName, g.homeTeam);
      const favScore = favIsEspnHome ? g.homeScore : g.awayScore;
      const oppScore = favIsEspnHome ? g.awayScore : g.homeScore;
      if (favScore === undefined || oppScore === undefined) continue;
      if (favScore >= oppScore) continue; // favorite must currently be TRAILING

      candidates.push({
        event_id: open.event_id,
        sport_key: g.sportKey,
        league_key: g.sportKey,
        favorite_team: favName,
        opponent_team: oppName,
        opening_ml: favOpenMl,
        current_ml: null as number | null,
        favorite_score: favScore,
        opponent_score: oppScore,
        home_team: g.homeTeam,
        away_team: g.awayTeam,
        home_score: g.homeScore,
        away_score: g.awayScore,
        status_detail: g.detail || "LIVE",
        commence_time: open.commence_time,
      });
    }

    // 4. Fill the current live moneyline — one Odds API call per sport that has
    //    a comeback (cheap; usually zero). Best-effort; null if unavailable.
    const apiKey = process.env.ODDS_API_KEY;
    if (candidates.length > 0 && apiKey) {
      const sports = Array.from(new Set(candidates.map((c) => c.sport_key)));
      const mlBySport: Record<string, Record<string, number>> = {};
      await Promise.all(
        sports.map(async (s) => {
          mlBySport[s] = await fetchCurrentMl(s, apiKey);
        })
      );
      for (const c of candidates) {
        const byName = mlBySport[c.sport_key] || {};
        for (const tn of Object.keys(byName)) {
          if (teamNamesMatch(tn, c.favorite_team)) {
            c.current_ml = byName[tn];
            break;
          }
        }
      }
    }

    res.setHeader("Cache-Control", "public, s-maxage=30");
    return res.status(200).json({ comebacks: candidates });
  } catch (error) {
    console.error("[/api/odds/comebacks] error:", error);
    return res.status(500).json({ error: "Failed to load comebacks" });
  }
}
