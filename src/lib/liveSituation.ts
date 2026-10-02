/**
 * Sport-specific live game situation, parsed from an ESPN scoreboard
 * `competition`. Each sport gets the details ESPN's own scoreboard shows:
 *  - baseball:   bases + balls/strikes/outs
 *  - football:   possession, down & distance, red zone, last play
 *  - hockey:     shots on goal per team, last play
 *  - basketball: last play
 *
 * ESPN sends a `situation` object for several sports (hockey's only holds a
 * last play), so the card must never assume a situation means baseball.
 */

export interface BaseballSituation {
  kind: "baseball";
  balls: number;
  strikes: number;
  outs: number;
  onFirst: boolean;
  onSecond: boolean;
  onThird: boolean;
}

export interface FootballSituation {
  kind: "football";
  /** e.g. "2nd & 7 at CLE 35" (null between plays / on kickoffs) */
  downDistance: string | null;
  isRedZone: boolean;
  /** Which side has the ball, if known. */
  possession: "home" | "away" | null;
  lastPlay: string | null;
}

export interface HockeySituation {
  kind: "hockey";
  awayAbbr: string;
  homeAbbr: string;
  awayShots: number | null;
  homeShots: number | null;
  lastPlay: string | null;
}

export interface BasketballSituation {
  kind: "basketball";
  lastPlay: string | null;
}

export type LiveSituation =
  | BaseballSituation
  | FootballSituation
  | HockeySituation
  | BasketballSituation;

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : null;
}

function statOf(competitor: any, name: string): number | null {
  const s = (competitor?.statistics ?? []).find((x: any) => x?.name === name);
  return s ? num(s.displayValue ?? s.value) : null;
}

function cleanText(t: unknown): string | null {
  const s = typeof t === "string" ? t.trim() : "";
  return s ? s : null;
}

/**
 * Build the live situation for a game. Returns null when the game isn't live
 * or ESPN has nothing worth showing for that sport, so the card renders no
 * strip at all rather than an empty one.
 */
export function parseLiveSituation(sportKey: string, comp: any): LiveSituation | null {
  if (!comp || comp?.status?.type?.state !== "in") return null;
  const s = comp.situation ?? null;
  const home = (comp.competitors ?? []).find((c: any) => c.homeAway === "home");
  const away = (comp.competitors ?? []).find((c: any) => c.homeAway === "away");
  const lastPlay = cleanText(s?.lastPlay?.text);

  if (sportKey === "baseball_mlb") {
    // Only a real baseball situation carries the count.
    if (!s || typeof s.balls !== "number") return null;
    return {
      kind: "baseball",
      balls: s.balls ?? 0,
      strikes: s.strikes ?? 0,
      outs: s.outs ?? 0,
      onFirst: !!s.onFirst,
      onSecond: !!s.onSecond,
      onThird: !!s.onThird,
    };
  }

  if (sportKey === "americanfootball_nfl" || sportKey === "americanfootball_ncaaf") {
    if (!s) return null;
    const possId = s.possession != null ? String(s.possession) : null;
    const possession: "home" | "away" | null =
      possId && String(home?.team?.id ?? home?.id) === possId
        ? "home"
        : possId && String(away?.team?.id ?? away?.id) === possId
        ? "away"
        : null;
    const downDistance = cleanText(s.downDistanceText) ?? cleanText(s.shortDownDistanceText);
    if (!downDistance && !lastPlay && !possession) return null;
    return { kind: "football", downDistance, isRedZone: !!s.isRedZone, possession, lastPlay };
  }

  if (sportKey === "icehockey_nhl") {
    // ESPN's NHL scoreboard has no shots stat directly; shots on goal for a
    // team = its goals + the opposing goalie's saves.
    const shots = (me: any, opp: any) => {
      const g = statOf(me, "goals") ?? num(me?.score);
      const sv = statOf(opp, "saves");
      return g !== null && sv !== null ? g + sv : null;
    };
    const awayShots = shots(away, home);
    const homeShots = shots(home, away);
    if (awayShots === null && homeShots === null && !lastPlay) return null;
    return {
      kind: "hockey",
      awayAbbr: away?.team?.abbreviation ?? "",
      homeAbbr: home?.team?.abbreviation ?? "",
      awayShots,
      homeShots,
      lastPlay,
    };
  }

  if (sportKey === "basketball_nba" || sportKey === "basketball_ncaab") {
    return lastPlay ? { kind: "basketball", lastPlay } : null;
  }

  return null;
}
