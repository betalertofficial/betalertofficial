/**
 * ESPN Scoreboard Service
 * Free API - no authentication required
 * Supports: NBA, MLB
 */

const ESPN_BASE_URL = "https://site.api.espn.com/apis/site/v2/sports";

// Sport-specific endpoints
const SPORT_ENDPOINTS: Record<string, string> = {
  "basketball_nba": `${ESPN_BASE_URL}/basketball/nba/scoreboard`,
  "baseball_mlb": `${ESPN_BASE_URL}/baseball/mlb/scoreboard`,
};

export interface ESPNScore {
  found: boolean;
  homeTeam?: string;
  awayTeam?: string;
  homeScore?: number;
  awayScore?: number;
  period?: number; // Inning for baseball, Quarter for basketball
  clock?: string;
  state?: string; // STATUS_SCHEDULED, STATUS_IN_PROGRESS, STATUS_FINAL
  detail?: string; // e.g., "Top 4th" or "4th - 2:30" or "Final"
  espnGameId?: string;
}

interface ESPNCompetitor {
  homeAway: "home" | "away";
  team: {
    displayName: string;
    abbreviation: string;
    shortDisplayName: string;
  };
  score: string;
}

interface ESPNStatus {
  period: number;
  displayClock: string;
  type: {
    name: string;
    detail: string;
    shortDetail: string;
  };
}

interface ESPNCompetition {
  competitors: ESPNCompetitor[];
  status: ESPNStatus;
}

interface ESPNEvent {
  id: string;
  competitions: ESPNCompetition[];
}

interface ESPNScoreboard {
  events: ESPNEvent[];
}

/**
 * Normalize team names for matching
 * Handles variations like "Los Angeles Lakers" vs "Lakers" vs "LA Lakers"
 */
function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^(los angeles|la|new york|ny|golden state|gs)\s+/i, "") // Remove city prefixes
    .replace(/\s+/g, "") // Remove spaces
    .trim();
}

/**
 * Fuzzy string matching using similarity ratio
 */
function fuzzyMatch(str1: string, str2: string, threshold: number = 0.6): boolean {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  
  // Exact match or substring match
  if (s1.includes(s2) || s2.includes(s1)) {
    return true;
  }
  
  // Calculate similarity ratio (Levenshtein-style)
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return true;
  
  let matches = 0;
  for (let i = 0; i < Math.min(s1.length, s2.length); i++) {
    if (s1[i] === s2[i]) matches++;
  }
  
  const ratio = matches / maxLen;
  console.log(`[ESPN] Fuzzy match: "${str1}" vs "${str2}" = ${ratio.toFixed(2)} (threshold: ${threshold})`);
  return ratio >= threshold;
}

/**
 * Check if two team names match using multiple strategies
 */
function teamsMatch(name1: string, name2: string): boolean {
  console.log(`[ESPN] Matching teams: "${name1}" vs "${name2}"`);
  
  // Direct substring match (matching Python example logic)
  if (name1.toLowerCase().includes(name2.toLowerCase())) {
    console.log(`[ESPN] ✅ Match found: "${name1}" includes "${name2}"`);
    return true;
  }
  
  if (name2.toLowerCase().includes(name1.toLowerCase())) {
    console.log(`[ESPN] ✅ Match found: "${name2}" includes "${name1}"`);
    return true;
  }
  
  // Fuzzy match as fallback
  const fuzzyResult = fuzzyMatch(name1, name2, 0.6);
  if (fuzzyResult) {
    console.log(`[ESPN] ✅ Match found via fuzzy matching`);
  } else {
    console.log(`[ESPN] ❌ No match found`);
  }
  return fuzzyResult;
}

export const espnService = {
  /**
   * Fetch scoreboard from ESPN for a specific sport
   * @param sport - Sport key (e.g., "basketball_nba", "baseball_mlb")
   * @param date - Optional date in YYYYMMDD format (defaults to today)
   */
  async getScoreboard(sport: string, date?: string): Promise<ESPNScoreboard> {
    const endpoint = SPORT_ENDPOINTS[sport];
    
    if (!endpoint) {
      throw new Error(`Unsupported sport: ${sport}. Supported: ${Object.keys(SPORT_ENDPOINTS).join(", ")}`);
    }
    
    const url = date ? `${endpoint}?dates=${date}` : endpoint;
    
    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`ESPN API request failed: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`Error fetching ESPN ${sport} scoreboard:`, error);
      throw error;
    }
  },

  /**
   * Find a specific game's score by team names
   * @param sport - Sport key (e.g., "basketball_nba", "baseball_mlb")
   * @param homeTeam - Home team name (can be full or partial)
   * @param awayTeam - Away team name (can be full or partial)
   * @param date - Optional date in YYYYMMDD format
   */
  async findGameScore(sport: string, homeTeam: string, awayTeam: string, date?: string): Promise<ESPNScore> {
    try {
      // If no date provided, use current date in Pacific timezone
      if (!date) {
        const now = new Date();
        // Convert to Pacific timezone (UTC-8 or UTC-7 depending on DST)
        const pacificOffset = -8 * 60; // PST offset in minutes
        const pacificDate = new Date(now.getTime() + (pacificOffset + now.getTimezoneOffset()) * 60000);
        date = pacificDate.toISOString().split('T')[0].replace(/-/g, ''); // Format: YYYYMMDD
        console.log(`[ESPN] Using Pacific date: ${date}`);
      }
      
      console.log(`[ESPN] Searching ${sport} for game: ${awayTeam} @ ${homeTeam} on date ${date}`);
      
      const scoreboard = await this.getScoreboard(sport, date);
      console.log(`[ESPN] Found ${scoreboard.events?.length || 0} total events`);
      
      for (const event of scoreboard.events || []) {
        const competition = event.competitions[0];
        if (!competition) continue;
        
        const espnHome = competition.competitors.find(c => c.homeAway === "home");
        const espnAway = competition.competitors.find(c => c.homeAway === "away");
        
        if (!espnHome || !espnAway) continue;
        
        const espnHomeName = espnHome.team.displayName;
        const espnAwayName = espnAway.team.displayName;
        
        console.log(`[ESPN] Checking event: ${espnAwayName} @ ${espnHomeName}`);
        
        // Check if both teams match (using same logic as Python example)
        const homeMatch = teamsMatch(homeTeam, espnHomeName);
        const awayMatch = teamsMatch(awayTeam, espnAwayName);
        
        if (homeMatch && awayMatch) {
          const status = competition.status;
          
          console.log(`[ESPN] ✅✅✅ MATCH FOUND! ${espnAwayName} @ ${espnHomeName}`);
          console.log(`[ESPN] Score: ${espnAway.score} - ${espnHome.score}`);
          console.log(`[ESPN] Status: ${status.type.detail}`);
          
          return {
            found: true,
            homeTeam: espnHomeName,
            awayTeam: espnAwayName,
            homeScore: parseInt(espnHome.score || "0"),
            awayScore: parseInt(espnAway.score || "0"),
            period: status.period,
            clock: status.displayClock,
            state: status.type.name,
            detail: status.type.detail,
            espnGameId: event.id,
          };
        }
      }
      
      console.log(`[ESPN] ❌ No ESPN game found for ${homeTeam} vs ${awayTeam} on ${date}`);
      return { found: false };
    } catch (error) {
      console.error(`[ESPN] Error finding ${sport} game score:`, error);
      return { found: false };
    }
  },

  /**
   * Format score for display in alerts
   */
  formatScore(score: ESPNScore): string {
    if (!score.found) {
      return "Score unavailable";
    }
    
    const statusInfo = score.state === "STATUS_FINAL" 
      ? "(Final)" 
      : score.state === "STATUS_IN_PROGRESS"
      ? `(${score.detail})`
      : "(Scheduled)";
    
    return `${score.awayTeam} ${score.awayScore} - ${score.homeTeam} ${score.homeScore} ${statusInfo}`;
  },
};