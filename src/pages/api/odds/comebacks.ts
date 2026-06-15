import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/odds/comebacks
 *
 * Public read endpoint powering the "Comeback's On" dashboard section:
 * live games where the team that OPENED as the favorite (negative opening
 * moneyline) is CURRENTLY TRAILING on the scoreboard.
 *
 * Data sources (all server-side via the service-role client):
 *  - event_schedules (status = 'live')        → which games are live now
 *  - game_opening_odds (home_ml / away_ml)     → who opened as favorite
 *  - odds_snapshots.scores_data (latest)       → current score + status detail
 *  - odds_snapshots (bet_type='h2h', latest)   → current live moneyline
 *
 * Note: game_opening_odds is populated by the daily schedule sync, so this
 * returns results only for games whose opening line was captured pre-game.
 */
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
    // 1. Live games right now.
    const { data: liveEvents, error: liveErr } = await supabase
      .from("event_schedules")
      .select("event_id, league_key, sport_key, home_team, away_team, commence_time")
      .eq("status", "live");
    if (liveErr) throw liveErr;
    if (!liveEvents || liveEvents.length === 0) {
      res.setHeader("Cache-Control", "public, s-maxage=30");
      return res.status(200).json({ comebacks: [] });
    }

    const eventIds = liveEvents.map((e: any) => e.event_id);

    // 2. Opening odds (immutable opening lines).
    const { data: opening } = await (supabase as any)
      .from("game_opening_odds")
      .select("event_id, home_team, away_team, home_ml, away_ml")
      .in("event_id", eventIds);
    const openingById: Record<string, any> = {};
    (opening || []).forEach((o: any) => { openingById[o.event_id] = o; });

    // 3. Latest score snapshot per event.
    const { data: scoreSnaps } = await supabase
      .from("odds_snapshots")
      .select("event_id, scores_data, snapshot_at")
      .in("event_id", eventIds)
      .not("scores_data", "is", null)
      .order("snapshot_at", { ascending: false });
    const latestScore: Record<string, any> = {};
    (scoreSnaps || []).forEach((s: any) => {
      if (!latestScore[s.event_id]) latestScore[s.event_id] = s.scores_data;
    });

    // 4. Latest current moneyline per event+team.
    const { data: mlRows } = await supabase
      .from("odds_snapshots")
      .select("event_id, team_or_player, odds_value, snapshot_at")
      .in("event_id", eventIds)
      .eq("bet_type", "h2h")
      .order("snapshot_at", { ascending: false });
    const currentMl: Record<string, Record<string, number>> = {};
    (mlRows || []).forEach((r: any) => {
      currentMl[r.event_id] = currentMl[r.event_id] || {};
      if (currentMl[r.event_id][r.team_or_player] === undefined) {
        currentMl[r.event_id][r.team_or_player] = Number(r.odds_value);
      }
    });

    const comebacks: any[] = [];
    for (const ev of liveEvents as any[]) {
      const open = openingById[ev.event_id];
      const score = latestScore[ev.event_id];
      if (!open || !score) continue;

      const homeScore = Number(score.homeScore ?? score.home_score);
      const awayScore = Number(score.awayScore ?? score.away_score);
      if (Number.isNaN(homeScore) || Number.isNaN(awayScore)) continue;

      const homeMl = Number(open.home_ml);
      const awayMl = Number(open.away_ml);

      // Determine the opening favorite (the more-negative / negative moneyline).
      let favTeam: string | null = null;
      let oppTeam: string | null = null;
      let favOpenMl: number | null = null;
      let favScore = 0;
      let oppScore = 0;

      const homeIsFav = homeMl < 0 && (awayMl >= 0 || homeMl < awayMl);
      const awayIsFav = awayMl < 0 && (homeMl >= 0 || awayMl < homeMl);

      if (homeIsFav) {
        favTeam = ev.home_team; oppTeam = ev.away_team; favOpenMl = homeMl; favScore = homeScore; oppScore = awayScore;
      } else if (awayIsFav) {
        favTeam = ev.away_team; oppTeam = ev.home_team; favOpenMl = awayMl; favScore = awayScore; oppScore = homeScore;
      }

      if (!favTeam || favScore >= oppScore) continue; // only favorites that are currently trailing

      comebacks.push({
        event_id: ev.event_id,
        sport_key: ev.sport_key,
        league_key: ev.league_key,
        favorite_team: favTeam,
        opponent_team: oppTeam,
        opening_ml: favOpenMl,
        current_ml: currentMl[ev.event_id]?.[favTeam] ?? null,
        favorite_score: favScore,
        opponent_score: oppScore,
        home_team: ev.home_team,
        away_team: ev.away_team,
        home_score: homeScore,
        away_score: awayScore,
        status_detail: score.detail || score.status || "LIVE",
        commence_time: ev.commence_time,
      });
    }

    res.setHeader("Cache-Control", "public, s-maxage=30");
    return res.status(200).json({ comebacks });
  } catch (error) {
    console.error("[/api/odds/comebacks] error:", error);
    return res.status(500).json({ error: "Failed to load comebacks" });
  }
}
