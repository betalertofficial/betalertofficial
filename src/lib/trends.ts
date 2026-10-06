/**
 * Team + matchup trends computed from public.game_results (completed games with
 * final scores and the closing total from ESPN/DraftKings).
 *
 * Pure functions — the API route loads rows and calls computeMatchupTrends().
 */
import { teamNamesMatch } from "@/lib/teamMatch";

export interface GameRow {
  event_id: string;
  game_date: string;
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  total_line: number | null;
}

export interface OURecord {
  over: number;
  under: number;
  push: number;
}

export interface TeamTrend {
  team: string;
  games: number;
  wins: number;
  losses: number;
  ties: number;
  /** Today's venue for this team ("Home" for the home team, "Away" for the away team). */
  venue: "Home" | "Away";
  venueGames: number;
  venueWins: number;
  venueLosses: number;
  /** O/U vs each game's own closing total. */
  ou: OURecord;
  /** Average combined score (both teams). */
  avgTotal: number | null;
  /** How many of the window's games went over TODAY's total (only when a line is given). */
  overToday: number | null;
}

export interface H2HTrend {
  games: number;
  homeWins: number; // wins by today's home team
  awayWins: number; // wins by today's away team
  ties: number;
  ou: OURecord;
  avgTotal: number | null;
  overToday: number | null;
}

export interface MatchupTrends {
  window: number;
  line: number | null;
  home: TeamTrend | null;
  away: TeamTrend | null;
  h2h: H2HTrend | null;
}

/** NFL plays once a week, so a 5-game window; everything else uses 10. */
export function windowFor(sportKey: string): number {
  return sportKey === "americanfootball_nfl" ? 5 : 10;
}

const byNewest = (a: GameRow, b: GameRow) => new Date(b.game_date).getTime() - new Date(a.game_date).getTime();
const total = (g: GameRow) => g.home_score + g.away_score;

function ouOf(games: GameRow[]): OURecord {
  const r: OURecord = { over: 0, under: 0, push: 0 };
  for (const g of games) {
    if (g.total_line == null) continue;
    const t = total(g);
    if (t > g.total_line) r.over++;
    else if (t < g.total_line) r.under++;
    else r.push++;
  }
  return r;
}

function avgTotal(games: GameRow[]): number | null {
  if (games.length === 0) return null;
  return Math.round((games.reduce((s, g) => s + total(g), 0) / games.length) * 10) / 10;
}

function overToday(games: GameRow[], line: number | null): number | null {
  if (line == null) return null;
  return games.filter((g) => total(g) > line).length;
}

/** Result for `team` in game g: 1 win, -1 loss, 0 tie. */
function resultFor(team: string, g: GameRow): 1 | -1 | 0 {
  const isHome = teamNamesMatch(g.home_team, team);
  const mine = isHome ? g.home_score : g.away_score;
  const theirs = isHome ? g.away_score : g.home_score;
  return mine > theirs ? 1 : mine < theirs ? -1 : 0;
}

function involves(team: string, g: GameRow) {
  return teamNamesMatch(g.home_team, team) || teamNamesMatch(g.away_team, team);
}

function teamTrend(team: string, venue: "Home" | "Away", rows: GameRow[], n: number, line: number | null): TeamTrend | null {
  const mine = rows.filter((g) => involves(team, g)).sort(byNewest);
  if (mine.length === 0) return null;
  const last = mine.slice(0, n);
  const atVenue = mine
    .filter((g) => (venue === "Home" ? teamNamesMatch(g.home_team, team) : teamNamesMatch(g.away_team, team)))
    .slice(0, n);
  const res = last.map((g) => resultFor(team, g));
  const vres = atVenue.map((g) => resultFor(team, g));
  return {
    team,
    games: last.length,
    wins: res.filter((r) => r === 1).length,
    losses: res.filter((r) => r === -1).length,
    ties: res.filter((r) => r === 0).length,
    venue,
    venueGames: atVenue.length,
    venueWins: vres.filter((r) => r === 1).length,
    venueLosses: vres.filter((r) => r === -1).length,
    ou: ouOf(last),
    avgTotal: avgTotal(last),
    overToday: overToday(last, line),
  };
}

export function computeMatchupTrends(
  sportKey: string,
  homeTeam: string,
  awayTeam: string,
  rows: GameRow[],
  line: number | null
): MatchupTrends {
  const n = windowFor(sportKey);
  const meetings = rows
    .filter((g) => involves(homeTeam, g) && involves(awayTeam, g))
    .sort(byNewest)
    .slice(0, 10);

  let h2h: H2HTrend | null = null;
  if (meetings.length > 0) {
    const res = meetings.map((g) => resultFor(homeTeam, g));
    h2h = {
      games: meetings.length,
      homeWins: res.filter((r) => r === 1).length,
      awayWins: res.filter((r) => r === -1).length,
      ties: res.filter((r) => r === 0).length,
      ou: ouOf(meetings),
      avgTotal: avgTotal(meetings),
      overToday: overToday(meetings, line),
    };
  }

  return {
    window: n,
    line,
    home: teamTrend(homeTeam, "Home", rows, n, line),
    away: teamTrend(awayTeam, "Away", rows, n, line),
    h2h,
  };
}
