import { useCallback, useEffect, useState } from "react";

// Module-level cache so all dashboard sections share one fetch.
let cache: Record<string, string> | null = null;
let inflight: Promise<Record<string, string>> | null = null;

async function loadLogos(): Promise<Record<string, string>> {
  if (cache) return cache;
  if (!inflight) {
    inflight = fetch("/api/teams/logos")
      .then((r) => r.json())
      .then((j) => {
        cache = (j && j.map) || {};
        return cache as Record<string, string>;
      })
      .catch(() => {
        cache = {};
        return cache as Record<string, string>;
      });
  }
  return inflight;
}

/**
 * Resolve a team's logo URL by (fuzzy) name. Returns null when unknown, so the
 * caller can fall back to initials.
 */
export function useTeamLogos() {
  const [map, setMap] = useState<Record<string, string>>(cache || {});

  useEffect(() => {
    let active = true;
    loadLogos().then((m) => {
      if (active) setMap(m);
    });
    return () => {
      active = false;
    };
  }, []);

  const logoFor = useCallback(
    (name?: string | null): string | null => {
      if (!name) return null;
      const n = name.toLowerCase().trim();
      if (map[n]) return map[n];
      // Loose match: a stored key contained in the name or vice versa.
      for (const key in map) {
        if (key.length > 3 && (n.includes(key) || key.includes(n))) return map[key];
      }
      return null;
    },
    [map]
  );

  return { logoFor };
}
