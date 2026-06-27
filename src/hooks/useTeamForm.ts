import { useEffect, useState } from "react";
import { normalizeTeamName, teamNamesMatch } from "@/lib/teamMatch";

/**
 * Recent-form ("hot/not") lookup per team, sourced from ESPN (free):
 *  - Soccer  → the scoreboard competitor `form` string (last 5, e.g. "WWDLW")
 *  - MLB/NBA/NHL/NFL → the standings `lasttengames` stat (e.g. "7-3") + streak
 *
 * Results are cached per league (module-level, short TTL) so the dashboard's
 * sections share one fetch. Teams are matched by name via the shared matcher.
 */

export interface TeamForm {
  label: string; // "7-3" (US) or "WWDLW" (soccer)
  suffix: string; // "L10" or "L5"
  tone: "hot" | "cold" | "neutral";
  title: string; // tooltip, e.g. "Last 10: 7-3 · streak W3"
}

const ESPN_BASE = "https://site.api.espn.com/apis";
const LEAGUE_PATH: Record<string, string> = {
  baseball_mlb: "baseball/mlb",
  basketball_nba: "basketball/nba",
  americanfootball_nfl: "football/nfl",
  icehockey_nhl: "hockey/nhl",
  soccer_fifa_world_cup: "soccer/fifa.world",
  soccer_epl: "soccer/eng.1",
  soccer_usa_mls: "soccer/usa.1",
  soccer_uefa_champs_league: "soccer/uefa.champions",
};

const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; map: Record<string, TeamForm> }>();
const inflight = new Map<string, Promise<Record<string, TeamForm>>>();

function toneFromWL(wins: number, losses: number): "hot" | "cold" | "neutral" {
  if (wins > losses) return "hot";
  if (losses > wins) return "cold";
  return "neutral";
}

/** Parse a "7-3" / "7-3-1" record into wins/losses (draws ignored for tone). */
function parseRecord(s: string | undefined | null): { w: number; l: number } | null {
  if (!s) return null;
  const m = s.match(/(\d+)\D+(\d+)/);
  if (!m) return null;
  return { w: parseInt(m[1], 10), l: parseInt(m[2], 10) };
}

/** Soccer: build form from the scoreboard `form` string (last 5). */
async function loadSoccerForm(path: string): Promise<Record<string, TeamForm>> {
  const res = await fetch(`${ESPN_BASE}/site/v2/sports/${path}/scoreboard`);
  if (!res.ok) return {};
  const data = await res.json();
  const out: Record<string, TeamForm> = {};
  for (const ev of data?.events ?? []) {
    const comp = ev.competitions?.[0];
    if (!comp) continue;
    for (const c of comp.competitors ?? []) {
      const name: string | undefined = c.team?.displayName;
      const form: string | undefined = c.form; // e.g. "WWDLW"
      if (!name || !form) continue;
      const w = (form.match(/W/g) || []).length;
      const l = (form.match(/L/g) || []).length;
      out[normalizeTeamName(name)] = {
        label: form,
        suffix: "L5",
        tone: toneFromWL(w, l),
        title: `Last 5: ${form}`,
      };
    }
  }
  return out;
}

/** US leagues: build form from the standings `lasttengames` stat (last 10). */
async function loadStandingsForm(path: string): Promise<Record<string, TeamForm>> {
  const res = await fetch(`${ESPN_BASE}/v2/sports/${path}/standings`);
  if (!res.ok) return {};
  const data = await res.json();
  const out: Record<string, TeamForm> = {};

  const visit = (node: any) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (node && typeof node === "object") {
      const entries = node?.standings?.entries;
      if (Array.isArray(entries)) {
        for (const e of entries) {
          const name: string | undefined = e?.team?.displayName;
          if (!name) continue;
          const stats: any[] = e?.stats ?? [];
          const find = (pred: (s: any) => boolean) => stats.find(pred);
          const l10 =
            find((s) => s.type === "lasttengames")?.displayValue ||
            find((s) => String(s.name).toLowerCase().includes("last ten"))?.displayValue ||
            null;
          const streak = find((s) => s.type === "streak")?.displayValue || null;
          const overall =
            find((s) => s.type === "total" || s.name === "overall" || s.type === "vsdivision")?.displayValue || null;
          if (!l10) continue;
          const wl = parseRecord(l10);
          out[normalizeTeamName(name)] = {
            label: l10,
            suffix: "L10",
            tone: wl ? toneFromWL(wl.w, wl.l) : "neutral",
            title: `Last 10: ${l10}${streak ? ` · streak ${streak}` : ""}${overall ? ` · ${overall}` : ""}`,
          };
        }
      }
      for (const v of Object.values(node)) visit(v);
    }
  };
  visit(data);
  return out;
}

async function loadLeagueForm(sportKey: string): Promise<Record<string, TeamForm>> {
  const path = LEAGUE_PATH[sportKey];
  if (!path) return {};
  try {
    return sportKey.startsWith("soccer") ? await loadSoccerForm(path) : await loadStandingsForm(path);
  } catch {
    return {};
  }
}

export function useTeamForm(sportKeys: string[]) {
  const [, setVersion] = useState(0);
  const key = sportKeys.filter(Boolean).sort().join(",");

  useEffect(() => {
    let active = true;
    (async () => {
      const leagues = key ? key.split(",") : [];
      await Promise.all(
        leagues.map(async (sk) => {
          const c = cache.get(sk);
          if (c && Date.now() - c.at < TTL_MS) return;
          let p = inflight.get(sk);
          if (!p) {
            p = loadLeagueForm(sk);
            inflight.set(sk, p);
          }
          const map = await p.catch(() => ({} as Record<string, TeamForm>));
          inflight.delete(sk);
          cache.set(sk, { at: Date.now(), map });
        })
      );
      if (active) setVersion((v) => v + 1);
    })();
    return () => {
      active = false;
    };
  }, [key]);

  const formFor = (sportKey: string, teamName: string): TeamForm | null => {
    const c = cache.get(sportKey);
    if (!c || !teamName) return null;
    const norm = normalizeTeamName(teamName);
    if (c.map[norm]) return c.map[norm];
    for (const k of Object.keys(c.map)) {
      if (teamNamesMatch(k, teamName)) return c.map[k];
    }
    return null;
  };

  return { formFor };
}
