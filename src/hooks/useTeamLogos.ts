import { useCallback, useEffect, useState } from "react";

interface LogoData {
  logos: Record<string, string>;
  leagues: Record<string, string>;
}

// Module-level cache so all dashboard sections share one fetch.
let cache: LogoData | null = null;
let inflight: Promise<LogoData> | null = null;

async function loadLogos(): Promise<LogoData> {
  if (cache) return cache;
  if (!inflight) {
    inflight = fetch("/api/teams/logos")
      .then((r) => r.json())
      .then((j) => {
        cache = { logos: (j && j.map) || {}, leagues: (j && j.leagueByName) || {} };
        return cache;
      })
      .catch(() => {
        cache = { logos: {}, leagues: {} };
        return cache;
      });
  }
  return inflight;
}

function lookup(table: Record<string, string>, name?: string | null): string | null {
  if (!name) return null;
  const n = name.toLowerCase().trim();
  if (table[n]) return table[n];
  for (const key in table) {
    if (key.length > 3 && (n.includes(key) || key.includes(n))) return table[key];
  }
  return null;
}

/**
 * Resolve a team's logo URL and league (Odds API sport key) by fuzzy name.
 * Returns null when unknown so callers can fall back.
 */
export function useTeamLogos() {
  const [data, setData] = useState<LogoData>(cache || { logos: {}, leagues: {} });

  useEffect(() => {
    let active = true;
    loadLogos().then((d) => {
      if (active) setData(d);
    });
    return () => {
      active = false;
    };
  }, []);

  const logoFor = useCallback((name?: string | null) => lookup(data.logos, name), [data]);
  const leagueFor = useCallback((name?: string | null) => lookup(data.leagues, name), [data]);

  return { logoFor, leagueFor };
}
