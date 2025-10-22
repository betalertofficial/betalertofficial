
const ODDS_API_KEY = "8fd23ab732557e3db9238fc571eddbbe";
const BASE_URL = "https://api.the-odds-api.com/v4";
const BOOKMAKERS = ["fanduel", "draftkings"];

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

export const oddsApiService = {
  async getSports() {
    const url = `${BASE_URL}/sports?apiKey=${ODDS_API_KEY}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Odds API error: ${response.statusText}`);
    }
    
    return response.json();
  },

  async getOddsForSport(sportKey: string): Promise<OddsApiEvent[]> {
    const bookmakerParams = BOOKMAKERS.join(",");
    const url = `${BASE_URL}/sports/${sportKey}/odds?apiKey=${ODDS_API_KEY}&regions=us&markets=h2h,spreads&bookmakers=${bookmakerParams}&oddsFormat=american`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Odds API error: ${response.statusText}`);
    }
    
    return response.json();
  },

  async getEventOdds(sportKey: string, eventId: string): Promise<OddsApiEvent> {
    const bookmakerParams = BOOKMAKERS.join(",");
    const url = `${BASE_URL}/sports/${sportKey}/events/${eventId}/odds?apiKey=${ODDS_API_KEY}&regions=us&markets=h2h,spreads&bookmakers=${bookmakerParams}&oddsFormat=american`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Odds API error: ${response.statusText}`);
    }
    
    return response.json();
  },

  parseTeamFromEvent(event: OddsApiEvent, teamName: string): {
    team: string;
    isHome: boolean;
  } | null {
    if (event.home_team.toLowerCase().includes(teamName.toLowerCase())) {
      return { team: event.home_team, isHome: true };
    }
    if (event.away_team.toLowerCase().includes(teamName.toLowerCase())) {
      return { team: event.away_team, isHome: false };
    }
    return null;
  },

  extractMoneylineOdds(event: OddsApiEvent, teamName: string) {
    const results: Array<{
      bookmaker: string;
      odds: number;
      deepLink?: string;
    }> = [];

    for (const bookmaker of event.bookmakers) {
      const h2hMarket = bookmaker.markets.find(m => m.key === "h2h");
      if (!h2hMarket) continue;

      const outcome = h2hMarket.outcomes.find(
        o => o.name.toLowerCase().includes(teamName.toLowerCase())
      );

      if (outcome) {
        results.push({
          bookmaker: bookmaker.title,
          odds: outcome.price,
          deepLink: undefined
        });
      }
    }

    return results;
  },

  extractSpreadOdds(event: OddsApiEvent, teamName: string) {
    const results: Array<{
      bookmaker: string;
      point: number;
      odds: number;
      deepLink?: string;
    }> = [];

    for (const bookmaker of event.bookmakers) {
      const spreadMarket = bookmaker.markets.find(m => m.key === "spreads");
      if (!spreadMarket) continue;

      const outcome = spreadMarket.outcomes.find(
        o => o.name.toLowerCase().includes(teamName.toLowerCase())
      );

      if (outcome && outcome.point !== undefined) {
        results.push({
          bookmaker: bookmaker.title,
          point: outcome.point,
          odds: outcome.price,
          deepLink: undefined
        });
      }
    }

    return results;
  }
};
