/**
 * API-Sports.io NBA API Service
 * Documentation: https://api-sports.io/documentation/nba/
 */

const API_SPORTS_BASE_URL = "https://v2.nba.api-sports.io";
const DEFAULT_API_KEY = process.env.API_SPORTS_KEY || "5bc3beb3f01fa8af8e2b3b949d39ba13";

export interface ApiSportsScore {
  points: number;
}

export interface ApiSportsTeam {
  id: number;
  name: string;
  nickname: string;
  code: string;
  logo: string;
}

export interface ApiSportsGameStatus {
  clock: string | null;
  halftime: boolean;
  short: number; // 1, 2, 3, 4 for quarters, 5 for OT
  long: string; // "Q1", "Q2", "Halftime", "Q3", "Q4", "OT", "Finished"
}

export interface ApiSportsGame {
  id: number;
  league: string;
  season: number;
  date: {
    start: string;
    end: string | null;
    duration: string | null;
  };
  stage: number;
  status: ApiSportsGameStatus;
  periods: {
    current: number;
    total: number;
    endOfPeriod: boolean;
  };
  arena: {
    name: string;
    city: string;
    state: string;
    country: string;
  };
  teams: {
    visitors: ApiSportsTeam;
    home: ApiSportsTeam;
  };
  scores: {
    visitors: {
      win: number;
      loss: number;
      series: {
        win: number;
        loss: number;
      };
      linescore: string[];
      points: number;
    };
    home: {
      win: number;
      loss: number;
      series: {
        win: number;
        loss: number;
      };
      linescore: string[];
      points: number;
    };
  };
}

export interface ApiSportsResponse {
  get: string;
  parameters: Record<string, string>;
  errors: any[];
  results: number;
  response: ApiSportsGame[];
}

export interface DetailedGameScore {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  status: string; // "Q1", "Q2", "Halftime", "Q3", "Q4", "OT", "Final"
  clock: string | null;
  quarter: number;
  linescore?: {
    home: string[];
    away: string[];
  };
}

export const apiSportsService = {
  /**
   * Fetch games for a specific date
   * @param date - Date in YYYY-MM-DD format
   * @param apiKey - API-Sports API key
   */
  async getGamesByDate(date: string, apiKey: string = DEFAULT_API_KEY): Promise<ApiSportsGame[]> {
    const url = `${API_SPORTS_BASE_URL}/games?date=${date}`;
    
    const response = await fetch(url, {
      headers: {
        "x-rapidapi-key": apiKey,
        "x-rapidapi-host": "v2.nba.api-sports.io"
      }
    });

    if (!response.ok) {
      throw new Error(`API-Sports request failed: ${response.status} ${response.statusText}`);
    }

    const data: ApiSportsResponse = await response.json();
    return data.response || [];
  },

  /**
   * Find a game by team names and date
   * @param homeTeam - Home team name
   * @param awayTeam - Away team name
   * @param date - Date in YYYY-MM-DD format
   * @param apiKey - API-Sports API key
   */
  async findGame(
    homeTeam: string,
    awayTeam: string,
    date: string,
    apiKey: string = DEFAULT_API_KEY
  ): Promise<DetailedGameScore | null> {
    try {
      const games = await this.getGamesByDate(date, apiKey);

      // Normalize team names for comparison
      const normalizeTeam = (name: string) => name.toLowerCase().trim();
      const homeNormalized = normalizeTeam(homeTeam);
      const awayNormalized = normalizeTeam(awayTeam);

      // Find matching game
      const game = games.find(g => {
        const gameHome = normalizeTeam(g.teams.home.name);
        const gameAway = normalizeTeam(g.teams.visitors.name);
        const gameHomeNickname = normalizeTeam(g.teams.home.nickname);
        const gameAwayNickname = normalizeTeam(g.teams.visitors.nickname);

        // Match by full name or nickname
        return (
          (gameHome.includes(homeNormalized) || gameHomeNickname.includes(homeNormalized) || homeNormalized.includes(gameHome) || homeNormalized.includes(gameHomeNickname)) &&
          (gameAway.includes(awayNormalized) || gameAwayNickname.includes(awayNormalized) || awayNormalized.includes(gameAway) || awayNormalized.includes(gameAwayNickname))
        );
      });

      if (!game) {
        console.log(`No game found for ${homeTeam} vs ${awayTeam} on ${date}`);
        return null;
      }

      // Parse game status
      let status = game.status.long;
      if (status === "Finished") {
        status = "Final";
      } else if (game.status.halftime) {
        status = "Halftime";
      } else if (game.status.short === 5) {
        status = "OT";
      }

      return {
        homeTeam: game.teams.home.name,
        awayTeam: game.teams.visitors.name,
        homeScore: game.scores.home.points,
        awayScore: game.scores.visitors.points,
        status,
        clock: game.status.clock,
        quarter: game.periods.current,
        linescore: {
          home: game.scores.home.linescore,
          away: game.scores.visitors.linescore
        }
      };
    } catch (error) {
      console.error("Error fetching game from API-Sports:", error);
      return null;
    }
  },

  /**
   * Format game score for display in alerts
   */
  formatGameScore(score: DetailedGameScore): string {
    const clockInfo = score.clock ? ` ${score.clock}` : "";
    const statusInfo = score.status === "Final" ? "(Final)" : `(${score.status}${clockInfo})`;
    return `${score.awayTeam} ${score.awayScore} - ${score.homeTeam} ${score.homeScore} ${statusInfo}`;
  }
};