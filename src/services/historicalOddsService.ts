import { supabase } from "@/integrations/supabase/client";

interface OddsSnapshot {
  timestamp: string;
  odds: number;
  bookmaker: string;
}

interface ParsedGameUrl {
  gameId: string;
  awayTeam: string;
  homeTeam: string;
}

interface HistoricalEvent {
  id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
}

interface OddsData {
  timestamp: string;
  next_timestamp?: string;
  bookmakers: Array<{
    key: string;
    title: string;
    markets: Array<{
      key: string;
      outcomes: Array<{
        name: string;
        price: number;
      }>;
    }>;
  }>;
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

const ODDS_API_KEY = process.env.NEXT_PUBLIC_ODDS_API_KEY || "1c4cf509a237efe8afb4342c676c999f";
const ODDS_API_BASE = "https://api.the-odds-api.com/v4";

/**
 * Parse NBA.com game URL to extract game ID and team codes
 * Format: https://www.nba.com/game/{away}-vs-{home}-{gameId}/box-score
 */
export function parseNBAGameUrl(url: string): ParsedGameUrl | null {
  const regex = /nba\.com\/game\/([a-z]{3})-vs-([a-z]{3})-(\d{10})/i;
  const match = url.match(regex);
  
  if (!match) return null;
  
  return {
    awayTeam: match[1].toUpperCase(),
    homeTeam: match[2].toUpperCase(),
    gameId: match[3]
  };
}

/**
 * Get team name mapping from database using vendor_team_map
 */
async function getTeamMapping(): Promise<Record<string, string>> {
  try {
    const { data, error } = await supabase
      .from("vendor_team_map")
      .select(`
        vendor_team_key,
        teams!inner(name)
      `)
      .eq("vendor_sport_key", "basketball_nba");

    if (error) throw error;

    const mapping: Record<string, string> = {};
    if (data && Array.isArray(data)) {
      data.forEach((item: any) => {
        if (item.vendor_team_key && item.teams?.name) {
          // Extract team code from vendor_team_key (e.g., "basketball_nba_SAS" -> "SAS")
          const parts = item.vendor_team_key.split("_");
          const code = parts[parts.length - 1];
          mapping[code.toUpperCase()] = item.teams.name;
        }
      });
    }

    // If we got data, return it
    if (Object.keys(mapping).length > 0) {
      return mapping;
    }

    // Otherwise fall through to hardcoded mapping
    throw new Error("No team mappings found in database");
  } catch (error) {
    console.error("Error fetching team mapping:", error);
    // Fallback mapping if database query fails
    return {
      "SAS": "San Antonio Spurs",
      "POR": "Portland Trail Blazers",
      "LAL": "Los Angeles Lakers",
      "LAC": "Los Angeles Clippers",
      "GSW": "Golden State Warriors",
      "PHX": "Phoenix Suns",
      "SAC": "Sacramento Kings",
      "DAL": "Dallas Mavericks",
      "HOU": "Houston Rockets",
      "MEM": "Memphis Grizzlies",
      "NOP": "New Orleans Pelicans",
      "DEN": "Denver Nuggets",
      "MIN": "Minnesota Timberwolves",
      "OKC": "Oklahoma City Thunder",
      "UTA": "Utah Jazz",
      "ATL": "Atlanta Hawks",
      "BOS": "Boston Celtics",
      "BKN": "Brooklyn Nets",
      "CHA": "Charlotte Hornets",
      "CHI": "Chicago Bulls",
      "CLE": "Cleveland Cavaliers",
      "DET": "Detroit Pistons",
      "IND": "Indiana Pacers",
      "MIA": "Miami Heat",
      "MIL": "Milwaukee Bucks",
      "NYK": "New York Knicks",
      "ORL": "Orlando Magic",
      "PHI": "Philadelphia 76ers",
      "TOR": "Toronto Raptors",
      "WAS": "Washington Wizards"
    };
  }
}

/**
 * Find the matching event in The Odds API historical events
 */
async function findHistoricalEvent(
  awayTeamFull: string,
  homeTeamFull: string,
  searchDate: string
): Promise<HistoricalEvent | null> {
  try {
    const response = await fetch(
      `${ODDS_API_BASE}/historical/sports/basketball_nba/events?apiKey=${ODDS_API_KEY}&date=${searchDate}`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch historical events: ${response.statusText}`);
    }

    const events: HistoricalEvent[] = await response.json();
    
    // Try to match by team names
    for (const event of events) {
      const matchesAway = event.away_team.toLowerCase().includes(awayTeamFull.toLowerCase()) ||
                         awayTeamFull.toLowerCase().includes(event.away_team.toLowerCase());
      const matchesHome = event.home_team.toLowerCase().includes(homeTeamFull.toLowerCase()) ||
                         homeTeamFull.toLowerCase().includes(event.home_team.toLowerCase());

      if (matchesAway && matchesHome) {
        return event;
      }
    }

    return null;
  } catch (error) {
    console.error("Error finding historical event:", error);
    return null;
  }
}

/**
 * Fetch a single odds snapshot from The Odds API
 */
async function fetchOddsSnapshot(
  eventId: string,
  timestamp: string
): Promise<OddsData | null> {
  try {
    const response = await fetch(
      `${ODDS_API_BASE}/historical/sports/basketball_nba/events/${eventId}/odds?` +
      `apiKey=${ODDS_API_KEY}&date=${timestamp}&regions=us&markets=h2h&oddsFormat=american`
    );

    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`Failed to fetch odds: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Error fetching snapshot at ${timestamp}:`, error);
    return null;
  }
}

/**
 * Extract moneyline odds for a specific team from a snapshot
 * Prioritize DraftKings, then FanDuel, then any available
 */
function extractMoneyline(
  snapshot: OddsData,
  teamName: string
): { odds: number; bookmaker: string } | null {
  const preferredBookmakers = ["draftkings", "fanduel"];
  
  // Try preferred bookmakers first
  for (const preferredKey of preferredBookmakers) {
    const bookmaker = snapshot.bookmakers.find(b => b.key === preferredKey);
    if (bookmaker) {
      const h2hMarket = bookmaker.markets.find(m => m.key === "h2h");
      if (h2hMarket) {
        const outcome = h2hMarket.outcomes.find(o => o.name === teamName);
        if (outcome) {
          return { odds: outcome.price, bookmaker: bookmaker.title };
        }
      }
    }
  }

  // Fallback to any available bookmaker
  for (const bookmaker of snapshot.bookmakers) {
    const h2hMarket = bookmaker.markets.find(m => m.key === "h2h");
    if (h2hMarket) {
      const outcome = h2hMarket.outcomes.find(o => o.name === teamName);
      if (outcome) {
        return { odds: outcome.price, bookmaker: bookmaker.title };
      }
    }
  }

  return null;
}

/**
 * Fetch the complete odds snapshot chain for a game
 */
async function fetchOddsChain(
  eventId: string,
  commenceTime: string,
  teamName: string
): Promise<OddsSnapshot[]> {
  const snapshots: OddsSnapshot[] = [];
  let currentTimestamp = commenceTime;
  const maxSnapshots = 100; // Safety limit
  const gameEndTime = new Date(new Date(commenceTime).getTime() + 2.5 * 60 * 60 * 1000).toISOString();

  console.log(`Fetching odds chain for ${teamName} from ${commenceTime}...`);

  for (let i = 0; i < maxSnapshots; i++) {
    const snapshot = await fetchOddsSnapshot(eventId, currentTimestamp);
    
    if (!snapshot) break;
    
    const oddsData = extractMoneyline(snapshot, teamName);
    if (oddsData) {
      snapshots.push({
        timestamp: currentTimestamp,
        odds: oddsData.odds,
        bookmaker: oddsData.bookmaker
      });
    }

    // Check if we should continue
    if (!snapshot.next_timestamp || new Date(snapshot.next_timestamp) > new Date(gameEndTime)) {
      break;
    }

    currentTimestamp = snapshot.next_timestamp;
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log(`Collected ${snapshots.length} snapshots`);
  return snapshots;
}

/**
 * Find the peak odds moment (highest/most positive odds = best value)
 */
function findPeakOdds(snapshots: OddsSnapshot[]): OddsSnapshot {
  return snapshots.reduce((peak, current) => 
    current.odds > peak.odds ? current : peak
  );
}

/**
 * Main function to generate the game odds story data
 * Now only requires the game URL and date - automatically finds teams and presents options
 */
export async function generateGameOddsStory(
  gameUrl: string,
  gameDate: string,
  winningTeamSelection?: "home" | "away"
): Promise<GameOddsStory> {
  // Parse the NBA.com URL
  const parsed = parseNBAGameUrl(gameUrl);
  if (!parsed) {
    throw new Error("Invalid NBA.com game URL");
  }

  console.log("Parsed game:", parsed);

  // Get team mapping from database
  const teamMapping = await getTeamMapping();
  
  // Map team codes to full names
  const awayTeamFull = teamMapping[parsed.awayTeam] || parsed.awayTeam;
  const homeTeamFull = teamMapping[parsed.homeTeam] || parsed.homeTeam;

  console.log("Team mapping:", { away: awayTeamFull, home: homeTeamFull });

  // Find the event in The Odds API using the provided date
  console.log("Searching for game on date:", gameDate);
  
  const event = await findHistoricalEvent(awayTeamFull, homeTeamFull, gameDate);
  
  if (!event) {
    throw new Error(
      `Could not find this game in The Odds API for date ${gameDate}. ` +
      `Looked for: ${awayTeamFull} @ ${homeTeamFull}`
    );
  }

  console.log("Found event:", event);

  // If no team selection provided yet, return early with team options
  if (!winningTeamSelection) {
    return {
      snapshots: [],
      peakOdds: { timestamp: "", odds: 0, bookmaker: "" },
      winningTeam: "",
      gameInfo: {
        homeTeam: event.home_team,
        awayTeam: event.away_team,
        commenceTime: event.commence_time,
        winner: ""
      },
      teamOptions: {
        home: event.home_team,
        away: event.away_team
      }
    };
  }

  // Determine which team name to use for odds lookup
  const winningTeamName = winningTeamSelection === "home" ? event.home_team : event.away_team;

  // Fetch the complete odds chain for the winning team
  const snapshots = await fetchOddsChain(event.id, event.commence_time, winningTeamName);

  if (snapshots.length < 10) {
    throw new Error("Not enough odds data to generate this chart");
  }

  // Find peak odds
  const peakOdds = findPeakOdds(snapshots);

  return {
    snapshots,
    peakOdds,
    winningTeam: winningTeamName,
    finalScore: undefined,
    gameInfo: {
      homeTeam: event.home_team,
      awayTeam: event.away_team,
      commenceTime: event.commence_time,
      winner: winningTeamName
    },
    teamOptions: {
      home: event.home_team,
      away: event.away_team
    }
  };
}

/**
 * Generate auto-caption for social media
 */
export function generateSocialCaption(story: GameOddsStory): {
  headline: string;
  caption: string;
  altText: string;
} {
  const peakTime = new Date(story.peakOdds.timestamp);
  const gameStart = new Date(story.gameInfo.commenceTime);
  const minutesElapsed = Math.floor((peakTime.getTime() - gameStart.getTime()) / 60000);
  
  // Rough quarter estimation
  let quarter = "Q1";
  if (minutesElapsed > 72) quarter = "Q4";
  else if (minutesElapsed > 48) quarter = "Q3";
  else if (minutesElapsed > 24) quarter = "Q2";
  else if (minutesElapsed > 12) quarter = "Q1";

  const teamShortName = story.winningTeam.split(" ").pop() || story.winningTeam;
  const oddsDisplay = story.peakOdds.odds > 0 ? `+${story.peakOdds.odds}` : story.peakOdds.odds;

  const headline = `${teamShortName} were ${oddsDisplay} in ${quarter}. They won anyway.`;
  
  const caption = `${headline} Best odds window of the game 👇 ${story.finalScore || ""}`.trim();
  
  const altText = `Chart showing ${story.winningTeam}'s moneyline odds throughout the game, ` +
    `peaking at ${oddsDisplay} during ${quarter}. Final result: ${story.winningTeam} victory.`;

  return { headline, caption, altText };
}