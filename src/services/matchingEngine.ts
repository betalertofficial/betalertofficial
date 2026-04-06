/**
 * Matching Engine - Pure logic for matching triggers against odds data
 * No database dependencies - can be tested independently
 */

interface Trigger {
  id: string;
  sport: string;
  team_or_player: string;
  bet_type: string;
  odds_comparator: string;
  odds_value: number;
  bookmaker?: string | null;
}

interface OddsSnapshot {
  sport: string;
  event_id: string;
  team_or_player: string;
  bookmaker: string;
  bet_type: string;
  odds_value: number;
}

export interface Match {
  triggerId: string;
  oddsValue: number;
  bookmaker: string;
  eventDetails: string;
  sport: string;
  teamOrPlayer: string;
  betType: string;
}

// Sport mapping: user-facing name → odds API sport key
const SPORT_MAPPING: Record<string, string> = {
  NBA: "basketball_nba",
  NFL: "americanfootball_nfl",
  MLB: "baseball_mlb",
  NHL: "icehockey_nhl",
  EPL: "soccer_epl",
  MLS: "soccer_usa_mls",
  "Premier League": "soccer_epl",
  "Champions League": "soccer_uefa_champs_league",
};

// Bet type aliases: user-facing → odds API format
const BET_TYPE_MAPPING: Record<string, string> = {
  moneyline: "h2h",
  h2h: "h2h",
  spread: "spreads",
  spreads: "spreads",
  totals: "totals",
  "over/under": "totals",
};

/**
 * Find matches between triggers and live odds data
 */
export function findMatches(triggers: Trigger[], oddsData: OddsSnapshot[]): Match[] {
  const matches: Match[] = [];

  console.log(`[MatchingEngine] Starting match process: ${triggers.length} triggers, ${oddsData.length} odds snapshots`);

  for (const trigger of triggers) {
    console.log(`[MatchingEngine] Evaluating trigger ${trigger.id}: ${trigger.sport} - ${trigger.team_or_player} ${trigger.bet_type}`);

    // Map sport to Odds API format
    const oddsApiSport = SPORT_MAPPING[trigger.sport] || trigger.sport.toLowerCase();
    
    // Map bet type to Odds API format
    const oddsApiBetType = BET_TYPE_MAPPING[trigger.bet_type.toLowerCase()] || trigger.bet_type.toLowerCase();

    // Find matching odds
    let triggerMatches = 0;
    
    for (const odds of oddsData) {
      // 1. Match sport
      if (odds.sport !== oddsApiSport) continue;

      // 2. Match team/player (case-insensitive, partial match)
      const teamMatch = 
        odds.team_or_player.toLowerCase().includes(trigger.team_or_player.toLowerCase()) ||
        trigger.team_or_player.toLowerCase().includes(odds.team_or_player.toLowerCase());
      if (!teamMatch) continue;

      // 3. Match bet type (using aliases)
      const oddsBetType = BET_TYPE_MAPPING[odds.bet_type.toLowerCase()] || odds.bet_type.toLowerCase();
      if (oddsBetType !== oddsApiBetType) continue;

      // 4. Match bookmaker if specified
      if (trigger.bookmaker && trigger.bookmaker !== odds.bookmaker) continue;

      // 5. Check odds value meets condition
      const meetsCondition = checkOddsCondition(
        odds.odds_value,
        trigger.odds_comparator,
        trigger.odds_value
      );

      if (!meetsCondition) continue;

      // Found a match!
      triggerMatches++;
      matches.push({
        triggerId: trigger.id,
        oddsValue: odds.odds_value,
        bookmaker: odds.bookmaker,
        eventDetails: `${odds.team_or_player} ${odds.bet_type}`,
        sport: trigger.sport,
        teamOrPlayer: trigger.team_or_player,
        betType: trigger.bet_type,
      });

      console.log(`[MatchingEngine] ✅ MATCH FOUND for trigger ${trigger.id}: ${odds.bookmaker} @ ${odds.odds_value}`);
    }

    if (triggerMatches === 0) {
      console.log(`[MatchingEngine] No matches found for trigger ${trigger.id}`);
    }
  }

  console.log(`[MatchingEngine] Found ${matches.length} total matches`);
  return matches;
}

/**
 * Check if odds value meets the trigger condition
 */
function checkOddsCondition(oddsValue: number, comparator: string, targetValue: number): boolean {
  switch (comparator) {
    case ">=":
    case "gte":
      return oddsValue >= targetValue;
    case "<=":
    case "lte":
      return oddsValue <= targetValue;
    case ">":
    case "gt":
      return oddsValue > targetValue;
    case "<":
    case "lt":
      return oddsValue < targetValue;
    case "==":
    case "eq":
      return oddsValue === targetValue;
    default:
      console.warn(`[MatchingEngine] Unknown comparator: ${comparator}`);
      return false;
  }
}

/**
 * Deduplicate matches - keep best odds per trigger
 */
export function deduplicateMatches(matches: Match[]): Match[] {
  const bestMatches = new Map<string, Match>();

  for (const match of matches) {
    const existing = bestMatches.get(match.triggerId);
    
    if (!existing || match.oddsValue > existing.oddsValue) {
      bestMatches.set(match.triggerId, match);
    }
  }

  const deduplicated = Array.from(bestMatches.values());
  console.log(`[MatchingEngine] Deduplicated ${matches.length} matches to ${deduplicated.length} best matches`);
  
  return deduplicated;
}

/**
 * Format alert message for a match
 */
export function formatAlertMessage(match: Match): string {
  return `🎯 ${match.teamOrPlayer} ${match.betType} hit! ${match.bookmaker}: ${formatOdds(match.oddsValue)}`;
}

/**
 * Format odds value (American format)
 */
function formatOdds(odds: number): string {
  if (odds >= 0) {
    return `+${odds}`;
  }
  return `${odds}`;
}