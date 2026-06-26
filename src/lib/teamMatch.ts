/**
 * Robust team-name matching across data sources.
 *
 * ESPN and The Odds API often name the same team differently — especially
 * national teams (ESPN "United States"/"Türkiye" vs Odds API "USA"/"Turkey") and
 * US leagues ("Lakers" vs "Los Angeles Lakers"). A naive substring compare misses
 * these, which previously caused live games to show no odds and team triggers to
 * never fire. This normalizes (diacritics, punctuation, "&"→"and") and applies an
 * alias map for the known hard cases.
 */

/** lowercase, strip diacritics + punctuation, "&"→"and". */
export function normalizeTeamName(name: string): string {
  return (name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritics (ü→u, ç→c)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

// Normalized name → canonical group. Entries on the same canonical are treated
// as the same team even when no substring overlap exists.
const ALIASES: Record<string, string> = {
  // United States
  usa: "unitedstates",
  unitedstates: "unitedstates",
  unitedstatesofamerica: "unitedstates",
  // Türkiye / Turkey
  turkey: "turkiye",
  turkiye: "turkiye",
  // South Korea
  southkorea: "southkorea",
  korearepublic: "southkorea",
  republicofkorea: "southkorea",
  // North Korea
  northkorea: "northkorea",
  koreadpr: "northkorea",
  dprkorea: "northkorea",
  // Côte d'Ivoire / Ivory Coast
  ivorycoast: "cotedivoire",
  cotedivoire: "cotedivoire",
  // Czechia
  czechia: "czechrepublic",
  czechrepublic: "czechrepublic",
  // Cape Verde
  capeverde: "caboverde",
  caboverde: "caboverde",
  // DR Congo
  drcongo: "drcongo",
  congodr: "drcongo",
  democraticrepublicofthecongo: "drcongo",
  // Iran
  iran: "iran",
  iriran: "iran",
  // China
  china: "china",
  chinapr: "china",
};

function canonical(n: string): string {
  return ALIASES[n] || n;
}

/**
 * True if two team names refer to the same team. Strategy:
 *   1. normalized equality
 *   2. same alias canonical (USA ↔ United States, Türkiye ↔ Turkey, …)
 *   3. normalized substring (Lakers ↔ Los Angeles Lakers), min length 3
 */
export function teamNamesMatch(a?: string | null, b?: string | null): boolean {
  const na = normalizeTeamName(a || "");
  const nb = normalizeTeamName(b || "");
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (canonical(na) === canonical(nb)) return true;
  const short = na.length <= nb.length ? na : nb;
  const long = na.length <= nb.length ? nb : na;
  return short.length >= 3 && long.includes(short);
}
