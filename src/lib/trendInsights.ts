/**
 * Turn a matchup's trends into short, ranked "insight" lines for the dashboard
 * Trends section — e.g. "Under hit in 8 of the Dodgers' last 10".
 *
 * Only strong signals make the cut (≥70% or ≤30% over a meaningful sample), and
 * each insight carries the bet it points at, so tapping it can open the alert
 * modal pre-set to that bet (moneyline on a team, or Over/Under).
 */
import type { MatchupTrends, TeamTrend } from "@/lib/trends";

export interface TrendInsight {
  text: string;
  hit: number;
  of: number;
  /** 0–100, how often the statement held. */
  pct: number;
  kind: "moneyline" | "totals";
  /** Moneyline insights: the team the trend favors. */
  team?: string;
  /** Totals insights: the side the trend favors. */
  side?: "over" | "under";
  /** Team the trend is ABOUT (totals trends from one team's games); unset = both teams (head-to-head). */
  subject?: string;
  /** Current price for the bet this trend points at (American odds), when known. */
  price?: number | null;
  /** Ranking strength (higher = more lopsided, bigger sample). */
  strength: number;
}

const TWO_WORD = ["Sox", "Jays", "Knights", "Wings", "Leafs", "Jackets", "Blazers"];

export function shortTeam(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length >= 2 && TWO_WORD.includes(parts[parts.length - 1])) return parts.slice(-2).join(" ");
  return parts[parts.length - 1] || full;
}

/** "Dodgers" → "Dodgers'", "Wild" → "Wild's". */
function poss(name: string) {
  return /(s|sox)$/i.test(name) ? `${name}'` : `${name}'s`;
}

function strength(hit: number, of: number) {
  // Lopsidedness, nudged up for bigger samples (10/10 beats 5/5).
  return Math.abs(hit / of - 0.5) * 2 + Math.min(of, 10) / 100;
}

function strong(hit: number, of: number, minN: number) {
  if (of < minN) return false;
  const p = hit / of;
  return p >= 0.7 || p <= 0.3;
}

function push(out: TrendInsight[], i: Omit<TrendInsight, "pct" | "strength">) {
  out.push({ ...i, pct: Math.round((i.hit / i.of) * 100), strength: strength(i.hit, i.of) });
}

function teamInsights(t: TeamTrend, opp: string, line: number | null, out: TrendInsight[]) {
  const me = shortTeam(t.team);
  const them = shortTeam(opp);
  const decided = t.wins + t.losses;

  // Recent form
  if (strong(t.wins, decided, 5)) {
    if (t.wins / decided >= 0.7) {
      push(out, { text: `${me} won ${t.wins} of their last ${decided}`, hit: t.wins, of: decided, kind: "moneyline", team: t.team });
    } else {
      push(out, { text: `${me} lost ${t.losses} of their last ${decided}`, hit: t.losses, of: decided, kind: "moneyline", team: opp });
    }
  }

  // Venue split
  const vDecided = t.venueWins + t.venueLosses;
  const where = t.venue === "Home" ? "at home" : "on the road";
  if (strong(t.venueWins, vDecided, 5)) {
    if (t.venueWins / vDecided >= 0.7) {
      push(out, { text: `${me} are ${t.venueWins}-${t.venueLosses} ${where} lately`, hit: t.venueWins, of: vDecided, kind: "moneyline", team: t.team });
    } else {
      push(out, { text: `${me} are ${t.venueWins}-${t.venueLosses} ${where} lately`, hit: t.venueLosses, of: vDecided, kind: "moneyline", team: opp });
    }
  }

  // O/U vs each game's own closing total
  const ouN = t.ou.over + t.ou.under;
  if (strong(t.ou.over, ouN, 5)) {
    if (t.ou.over / ouN >= 0.7) {
      push(out, { text: `Over hit in ${t.ou.over} of the ${poss(me)} last ${ouN}`, hit: t.ou.over, of: ouN, kind: "totals", side: "over", subject: t.team });
    } else {
      push(out, { text: `Under hit in ${t.ou.under} of the ${poss(me)} last ${ouN}`, hit: t.ou.under, of: ouN, kind: "totals", side: "under", subject: t.team });
    }
  }

  // Against TODAY's number
  if (line != null && t.overToday != null && strong(t.overToday, t.games, 5)) {
    if (t.overToday / t.games >= 0.7) {
      push(out, { text: `The ${poss(me)} last ${t.games} went over ${line} in ${t.overToday}`, hit: t.overToday, of: t.games, kind: "totals", side: "over", subject: t.team });
    } else {
      const under = t.games - t.overToday;
      push(out, { text: `The ${poss(me)} last ${t.games} stayed under ${line} in ${under}`, hit: under, of: t.games, kind: "totals", side: "under", subject: t.team });
    }
  }
  void them;
}

export function buildInsights(tr: MatchupTrends, homeTeam: string, awayTeam: string, max = 3): TrendInsight[] {
  const out: TrendInsight[] = [];
  if (tr.away) teamInsights(tr.away, homeTeam, tr.line, out);
  if (tr.home) teamInsights(tr.home, awayTeam, tr.line, out);

  const h = tr.h2h;
  if (h) {
    const decided = h.homeWins + h.awayWins;
    if (strong(h.homeWins, decided, 4)) {
      const homeLeads = h.homeWins >= h.awayWins;
      const winner = homeLeads ? homeTeam : awayTeam;
      const loser = homeLeads ? awayTeam : homeTeam;
      const w = Math.max(h.homeWins, h.awayWins);
      push(out, { text: `${shortTeam(winner)} won ${w} of the last ${decided} vs ${shortTeam(loser)}`, hit: w, of: decided, kind: "moneyline", team: winner });
    }
    const ouN = h.ou.over + h.ou.under;
    if (strong(h.ou.over, ouN, 4)) {
      const over = h.ou.over / ouN >= 0.7;
      push(out, {
        text: `${over ? "Over" : "Under"} hit in ${over ? h.ou.over : h.ou.under} of their last ${ouN} meetings`,
        hit: over ? h.ou.over : h.ou.under,
        of: ouN,
        kind: "totals",
        side: over ? "over" : "under",
      });
    }
  }

  // Strongest first; keep at most one "team won/lost" line per team so a card
  // isn't three versions of the same fact.
  out.sort((a, b) => b.strength - a.strength);
  const picked: TrendInsight[] = [];
  const seen = new Set<string>();
  for (const i of out) {
    const key = i.kind === "moneyline" ? `ml:${i.team}` : `tot:${i.side}:${i.text.split(" ")[0]}`;
    if (i.kind === "moneyline" && seen.has(key)) continue;
    seen.add(key);
    picked.push(i);
    if (picked.length >= max) break;
  }
  return picked;
}
