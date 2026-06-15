/**
 * Shared league configuration used across the dashboard sections.
 * - sportKey:    The Odds API key (used by /api/odds/* and CreateTrigger)
 * - teamLeague:  the `league` value stored in the `teams` table (lowercase)
 * - espnLeague:  ESPN logo CDN slug (null where ESPN abbrev logos aren't reliable)
 */
export interface LeagueConfig {
  label: string;
  sportKey: string;
  teamLeague: string;
  espnLeague: string | null;
}

export const LEAGUES: LeagueConfig[] = [
  { label: "MLB", sportKey: "baseball_mlb", teamLeague: "mlb", espnLeague: "mlb" },
  { label: "NBA", sportKey: "basketball_nba", teamLeague: "nba", espnLeague: "nba" },
  { label: "NFL", sportKey: "americanfootball_nfl", teamLeague: "nfl", espnLeague: "nfl" },
  { label: "NHL", sportKey: "icehockey_nhl", teamLeague: "nhl", espnLeague: "nhl" },
  { label: "Soccer", sportKey: "soccer_epl", teamLeague: "epl", espnLeague: null },
];

export const SPORT_KEYS = LEAGUES.map((l) => l.sportKey);

export function leagueBySportKey(sportKey: string): LeagueConfig | undefined {
  return LEAGUES.find((l) => l.sportKey === sportKey);
}

export function leagueLabel(sportKey: string): string {
  return leagueBySportKey(sportKey)?.label ?? sportKey;
}

/**
 * Real team logo via the ESPN CDN, derived from league + team abbreviation.
 * Returns null when we can't build a reliable URL (e.g. soccer or missing abbrev).
 * Prefer the name-based lookup from useTeamLogos(); this is a fallback for the
 * teams table (which has an abbrev but no logo URL).
 */
export function getTeamLogoUrl(teamLeague: string, abbrev: string | null): string | null {
  if (!abbrev) return null;
  const cfg = LEAGUES.find((l) => l.teamLeague === teamLeague.toLowerCase());
  if (!cfg || !cfg.espnLeague) return null;
  return `https://a.espncdn.com/i/teamlogos/${cfg.espnLeague}/500/${abbrev.toLowerCase()}.png`;
}
