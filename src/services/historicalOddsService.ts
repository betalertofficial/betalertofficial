/**
 * Historical Odds Service — DISABLED.
 *
 * This module previously called The Odds API /historical endpoint, which costs
 * 10x the credits of a normal /odds call and was the largest single source of
 * quota burn. It has been neutered to:
 *   1. preserve the monthly Odds API budget, and
 *   2. remove the browser-exposed NEXT_PUBLIC_ODDS_API_KEY reference entirely
 *      (the key no longer ships to the client from this module).
 *
 * The intraday odds time-series needed for charts is already captured for free
 * by the live cron in the `odds_snapshots` table, so this feature can be rebuilt
 * from our own database later without any paid historical calls.
 *
 * The original export names are kept as inert no-ops so existing imports keep
 * type-checking; every call now throws instead of hitting the paid API.
 */

const DISABLED_MESSAGE =
  "The historical odds feature is disabled to preserve the Odds API budget.";

interface HistoricalEvent {
  id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
}

interface OddsSnapshot {
  timestamp: string;
  odds: number;
  bookmaker: string;
}

export interface GameOddsStory {
  snapshots: OddsSnapshot[];
  peakOdds: OddsSnapshot;
  winningTeam: string;
  finalScore?: string;
  gameInfo: {
    homeTeam: string;
    awayTeam: string;
    commenceTime: string;
    winner: string;
  };
  teamOptions: { home: string; away: string };
}

/** Disabled — historical feature removed. */
export async function fetchGamesForDate(_date: string): Promise<HistoricalEvent[]> {
  throw new Error(DISABLED_MESSAGE);
}

/** Disabled — historical feature removed. */
export async function fetchRawOddsData(
  _eventId: string,
  _commenceTime: string
): Promise<any[]> {
  throw new Error(DISABLED_MESSAGE);
}

/** Disabled — historical feature removed. */
export async function generateGameOddsStory(
  _event: HistoricalEvent,
  _winningTeamSelection: "home" | "away"
): Promise<GameOddsStory> {
  throw new Error(DISABLED_MESSAGE);
}

/** Disabled — historical feature removed. */
export function generateSocialCaption(_story: GameOddsStory): {
  headline: string;
  caption: string;
  altText: string;
} {
  throw new Error(DISABLED_MESSAGE);
}
