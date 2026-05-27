// Odds API Service for fetching sports betting data
//
// All browser requests go through /api/odds/* proxy routes so the Odds API key
// stays server-side (never exposed in the browser bundle) and CORS is not an issue.
// Direct calls to the-odds-api.com must only happen server-side (cronPollingService).

export interface OddsApiEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsApiBookmaker[];
}

export interface OddsApiBookmaker {
  key: string;
  title: string;
  last_update: string;
  markets: OddsApiMarket[];
}

export interface OddsApiMarket {
  key: string;
  last_update: string;
  outcomes: OddsApiOutcome[];
}

export interface OddsApiOutcome {
  name: string;
  price: number;
  point?: number;
  description?: string;
}

export interface OddsApiScore {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  completed: boolean;
  home_team: string;
  away_team: string;
  scores: Array<{
    name: string;
    score: string;
  }> | null;
  last_update: string | null;
}

export interface OddsApiEventWithScore extends OddsApiEvent {
  score_data?: OddsApiScore;
}

export const oddsApiService = {
  /** Fetch the list of available sports via the server-side proxy. */
  async getSports(): Promise<any[]> {
    const response = await fetch("/api/odds/sports");
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Sports API error: ${response.status}`);
    }
    return response.json();
  },

  /** Fetch live odds for a sport via the server-side proxy. */
  async getOddsForSport(sportKey: string): Promise<OddsApiEvent[]> {
    const response = await fetch(`/api/odds/events?sport=${encodeURIComponent(sportKey)}&type=odds`);
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Odds API error: ${response.status}`);
    }
    return response.json();
  },

  /** Fetch recent scores for a sport via the server-side proxy. */
  async getScores(sportKey: string): Promise<OddsApiScore[]> {
    const response = await fetch(`/api/odds/events?sport=${encodeURIComponent(sportKey)}&type=scores`);
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Scores API error: ${response.status}`);
    }
    return response.json();
  },

  /** Fetch odds across multiple sports (used by legacy fetchOdds callers). */
  async fetchOdds(): Promise<OddsApiEvent[]> {
    const sports = ["basketball_nba", "americanfootball_nfl", "baseball_mlb", "icehockey_nhl", "soccer_epl"];
    const results = await Promise.all(
      sports.map((sport) =>
        this.getOddsForSport(sport).catch((err) => {
          console.error(`Error fetching odds for ${sport}:`, err);
          return [] as OddsApiEvent[];
        })
      )
    );
    return results.flat();
  },

  // ── Pure helpers (no API calls) ──────────────────────────────────────────

  parseTeamFromEvent(event: OddsApiEvent, teamName: string): { team: string; isHome: boolean } | null {
    if (event.home_team.toLowerCase().includes(teamName.toLowerCase())) {
      return { team: event.home_team, isHome: true };
    }
    if (event.away_team.toLowerCase().includes(teamName.toLowerCase())) {
      return { team: event.away_team, isHome: false };
    }
    return null;
  },

  extractMoneylineOdds(event: OddsApiEvent, teamName: string) {
    const results: Array<{ bookmaker: string; odds: number; deepLink?: string }> = [];
    for (const bookmaker of event.bookmakers) {
      const market = bookmaker.markets.find((m) => m.key === "h2h");
      if (!market) continue;
      const outcome = market.outcomes.find((o) =>
        o.name.toLowerCase().includes(teamName.toLowerCase())
      );
      if (outcome) results.push({ bookmaker: bookmaker.title, odds: outcome.price });
    }
    return results;
  },

  extractSpreadOdds(event: OddsApiEvent, teamName: string) {
    const results: Array<{ bookmaker: string; point: number; odds: number; deepLink?: string }> = [];
    for (const bookmaker of event.bookmakers) {
      const market = bookmaker.markets.find((m) => m.key === "spreads");
      if (!market) continue;
      const outcome = market.outcomes.find((o) =>
        o.name.toLowerCase().includes(teamName.toLowerCase())
      );
      if (outcome && outcome.point !== undefined) {
        results.push({ bookmaker: bookmaker.title, point: outcome.point, odds: outcome.price });
      }
    }
    return results;
  },

  extractTotalsOdds(event: OddsApiEvent, overUnder: "over" | "under") {
    const results: Array<{ bookmaker: string; point: number; odds: number; deepLink?: string }> = [];
    for (const bookmaker of event.bookmakers) {
      const market = bookmaker.markets.find((m) => m.key === "totals");
      if (!market) continue;
      const outcome = market.outcomes.find(
        (o) => o.name.toLowerCase() === overUnder.toLowerCase()
      );
      if (outcome && outcome.point !== undefined) {
        results.push({ bookmaker: bookmaker.title, point: outcome.point, odds: outcome.price });
      }
    }
    return results;
  },
};
