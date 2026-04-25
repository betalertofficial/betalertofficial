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
  frequency?: string; // 'once' or 'recurring'
}

interface OddsSnapshot {
  sport: string;
  event_id: string;
  team_or_player: string;
  bookmaker: string;
  bet_type: string;
  odds_value: number;
  event_data?: any; // Event data from Odds API (includes commence_time)
}

export interface Match {
  triggerId: string;
  oddsValue: number;
  bookmaker: string;
  eventDetails: string;
  sport: string;
  teamOrPlayer: string;
  betType: string;
  eventId: string; // Add event_id to track per-game matches
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
 * @param triggers - Active triggers to evaluate
 * @param oddsData - Live odds snapshots
 * @param existingMatches - Map of trigger_id -> Set of event_ids that have already matched
 */
export function findMatches(
  triggers: Trigger[], 
  oddsData: OddsSnapshot[],
  existingMatches: Map<string, Set<string>> = new Map()
): Match[] {
  const matches: Match[] = [];

  console.log(`[MatchingEngine] Starting match process: ${triggers.length} triggers, ${oddsData.length} odds snapshots`);
  console.log(`[MatchingEngine] Existing matches for ${existingMatches.size} recurring triggers`);
  
  // Filter out pregame odds - only include games that have started
  const currentTime = new Date();
  const liveOdds = oddsData.filter(odds => {
    if (!odds.event_data?.commence_time) {
      // If no commence_time, assume it's live (shouldn't happen but be safe)
      return true;
    }
    const commenceTime = new Date(odds.event_data.commence_time);
    return commenceTime <= currentTime;
  });

  const filteredCount = oddsData.length - liveOdds.length;
  if (filteredCount > 0) {
    console.log(`[MatchingEngine] Filtered out ${filteredCount} pregame odds (games not started yet)`);
  }
  console.log(`[MatchingEngine] Processing ${liveOdds.length} live game odds`);
  
  // DEBUG: Show sample odds data
  if (liveOdds.length > 0) {
    console.log("[MatchingEngine] DEBUG - Sample live odds data (first 3):");
    liveOdds.slice(0, 3).forEach(odds => {
      console.log(`  - ${odds.sport} | ${odds.team_or_player} | ${odds.bet_type} | ${odds.bookmaker} | ${odds.odds_value}`);
    });
  }

  for (const trigger of triggers) {
    console.log(`\n[MatchingEngine] === Evaluating trigger ${trigger.id} ===`);
    console.log(`[MatchingEngine] Trigger: ${trigger.sport} - ${trigger.team_or_player} ${trigger.bet_type} ${trigger.odds_comparator} ${trigger.odds_value}`);
    console.log(`[MatchingEngine] Frequency: ${trigger.frequency || 'once'}`);
    if (trigger.bookmaker) {
      console.log(`[MatchingEngine] Bookmaker filter: ${trigger.bookmaker}`);
    }

    // Map sport to Odds API format
    const oddsApiSport = SPORT_MAPPING[trigger.sport] || trigger.sport.toLowerCase();
    console.log(`[MatchingEngine] Mapped sport: ${trigger.sport} → ${oddsApiSport}`);
    
    // Map bet type to Odds API format
    const oddsApiBetType = BET_TYPE_MAPPING[trigger.bet_type.toLowerCase()] || trigger.bet_type.toLowerCase();
    console.log(`[MatchingEngine] Mapped bet type: ${trigger.bet_type} → ${oddsApiBetType}`);

    // Get set of event_ids this trigger has already matched (for recurring triggers)
    const alreadyMatchedEvents = existingMatches.get(trigger.id) || new Set<string>();
    if (trigger.frequency === 'recurring' && alreadyMatchedEvents.size > 0) {
      console.log(`[MatchingEngine] Recurring trigger has already matched ${alreadyMatchedEvents.size} events`);
    }

    // Find matching odds (using filtered live odds only)
    let triggerMatches = 0;
    let sportMismatches = 0;
    let teamMismatches = 0;
    let betTypeMismatches = 0;
    let bookmakerMismatches = 0;
    let oddsMismatches = 0;
    let alreadyMatchedSkips = 0;
    
    for (const odds of liveOdds) {
      // Skip if this is a recurring trigger that already matched this event
      if (trigger.frequency === 'recurring' && alreadyMatchedEvents.has(odds.event_id)) {
        alreadyMatchedSkips++;
        continue;
      }

      // 1. Match sport
      if (odds.sport !== oddsApiSport) {
        sportMismatches++;
        continue;
      }

      // 2. Match team/player (case-insensitive, partial match)
      const teamMatch = 
        odds.team_or_player.toLowerCase().includes(trigger.team_or_player.toLowerCase()) ||
        trigger.team_or_player.toLowerCase().includes(odds.team_or_player.toLowerCase());
      if (!teamMatch) {
        teamMismatches++;
        continue;
      }

      // 3. Match bet type (using aliases)
      const oddsBetType = BET_TYPE_MAPPING[odds.bet_type.toLowerCase()] || odds.bet_type.toLowerCase();
      if (oddsBetType !== oddsApiBetType) {
        betTypeMismatches++;
        if (teamMismatches < 5) { // Only log first few for debugging
          console.log(`[MatchingEngine] Bet type mismatch: "${odds.bet_type}" (${oddsBetType}) != "${trigger.bet_type}" (${oddsApiBetType})`);
        }
        continue;
      }

      // 4. Match bookmaker if specified (case-insensitive)
      if (trigger.bookmaker && trigger.bookmaker.toLowerCase() !== odds.bookmaker.toLowerCase()) {
        bookmakerMismatches++;
        continue;
      }

      // 5. Check odds value meets condition
      const meetsCondition = checkOddsCondition(
        odds.odds_value,
        trigger.odds_comparator,
        trigger.odds_value
      );

      if (!meetsCondition) {
        oddsMismatches++;
        console.log(`[MatchingEngine] Odds condition not met: ${odds.odds_value} ${trigger.odds_comparator} ${trigger.odds_value} = false`);
        continue;
      }

      // Found a match!
      triggerMatches++;
      matches.push({
        triggerId: trigger.id,
        oddsValue: odds.odds_value,
        bookmaker: odds.bookmaker,
        eventDetails: `${odds.team_or_player} ${odds.bet_type}`,
        sport: trigger.sport,
        teamOrPlayer: odds.team_or_player,  // Use actual odds team name
        betType: odds.bet_type,              // Use actual odds bet type
        eventId: odds.event_id,              // Track event_id for recurring triggers
      });

      console.log(`[MatchingEngine] ✅ MATCH FOUND for trigger ${trigger.id}: ${odds.bookmaker} @ ${odds.odds_value} (event: ${odds.event_id})`);
    }

    console.log(`[MatchingEngine] Trigger ${trigger.id} results:`);
    console.log(`  - Sport mismatches: ${sportMismatches}`);
    console.log(`  - Team mismatches: ${teamMismatches}`);
    console.log(`  - Bet type mismatches: ${betTypeMismatches}`);
    console.log(`  - Bookmaker mismatches: ${bookmakerMismatches}`);
    console.log(`  - Odds condition mismatches: ${oddsMismatches}`);
    if (trigger.frequency === 'recurring') {
      console.log(`  - Already matched events skipped: ${alreadyMatchedSkips}`);
    }
    console.log(`  - Total matches: ${triggerMatches}`);
  }

  console.log(`[MatchingEngine] Found ${matches.length} total matches`);
  return matches;
}

/**
 * Match a trigger against odds snapshots
 * Returns matching events that meet the trigger criteria
 */
export function matchTriggerToOdds(
  trigger: Trigger,
  oddsSnapshots: OddsSnapshot[]
): TriggerMatch[] {
  const matches: TriggerMatch[] = [];

  // Filter odds to matching sport/league
  const relevantOdds = oddsSnapshots.filter(odd => {
    // trigger.sport now uses league_key format (e.g., "basketball_nba")
    // odd.sport_key also uses league_key format
    return odd.sport_key === trigger.sport;
  });

  console.log(`[MatchingEngine] Filtering ${oddsSnapshots.length} odds for trigger ${trigger.id}`);
  console.log(`[MatchingEngine] Trigger league: ${trigger.sport}, Found ${relevantOdds.length} matching odds`);

  // TODO: Implement the rest of the match logic here

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