import { useEffect, useState } from "react";

export interface EspnSituation {
  balls?: number;
  strikes?: number;
  outs?: number;
  onFirst?: boolean;
  onSecond?: boolean;
  onThird?: boolean;
}

export interface EspnLiveEntry {
  detail: string; // e.g. "Top 7th", "Q3 5:21", "45'+2'"
  situation: EspnSituation | null; // MLB only
  homeTeam: string;
  awayTeam: string;
}

// Odds API sport key -> ESPN scoreboard path
const SCOREBOARD_PATH: Record<string, string> = {
  baseball_mlb: "baseball/mlb",
  basketball_nba: "basketball/nba",
  americanfootball_nfl: "football/nfl",
  icehockey_nhl: "hockey/nhl",
  soccer_epl: "soccer/eng.1",
  soccer_fifa_world_cup: "soccer/fifa.world",
};

function norm(s?: string) {
  return (s || "").toLowerCase().trim();
}

function teamsMatch(a: string, b: string) {
  const x = norm(a);
  const y = norm(b);
  return !!x && !!y && (x.includes(y) || y.includes(x));
}

/**
 * Fetches ESPN scoreboards (client-side, CORS-friendly) for the given sport keys
 * and exposes a matcher for in-progress games, returning the status detail and
 * (MLB) the live situation. Matched by team display-name substring.
 */
export function useEspnLive(sportKeys: string[]) {
  const [entries, setEntries] = useState<EspnLiveEntry[]>([]);
  const cacheKey = Array.from(new Set(sportKeys)).sort().join(",");

  useEffect(() => {
    let active = true;
    const keys = cacheKey ? cacheKey.split(",") : [];
    if (keys.length === 0) {
      setEntries([]);
      return;
    }
    (async () => {
      const all: EspnLiveEntry[] = [];
      await Promise.all(
        keys.map(async (sk) => {
          const path = SCOREBOARD_PATH[sk];
          if (!path) return;
          try {
            const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard`);
            if (!r.ok) return;
            const data = await r.json();
            for (const ev of data.events || []) {
              const comp = ev.competitions?.[0];
              if (!comp || comp.status?.type?.state !== "in") continue;
              const competitors = comp.competitors || [];
              const home = competitors.find((c: any) => c.homeAway === "home");
              const away = competitors.find((c: any) => c.homeAway === "away");
              const detail = comp.status?.type?.shortDetail || comp.status?.type?.detail || "Live";
              const s = comp.situation;
              all.push({
                detail,
                situation: s
                  ? {
                      balls: s.balls,
                      strikes: s.strikes,
                      outs: s.outs,
                      onFirst: s.onFirst,
                      onSecond: s.onSecond,
                      onThird: s.onThird,
                    }
                  : null,
                homeTeam: home?.team?.displayName || "",
                awayTeam: away?.team?.displayName || "",
              });
            }
          } catch {
            /* ignore league */
          }
        })
      );
      if (active) setEntries(all);
    })();
    return () => {
      active = false;
    };
  }, [cacheKey]);

  const getLive = (awayTeam: string, homeTeam: string): EspnLiveEntry | null => {
    for (const e of entries) {
      if (teamsMatch(e.homeTeam, homeTeam) && teamsMatch(e.awayTeam, awayTeam)) return e;
    }
    for (const e of entries) {
      if (teamsMatch(e.homeTeam, homeTeam) || teamsMatch(e.awayTeam, awayTeam)) return e;
    }
    return null;
  };

  return { getLive };
}
