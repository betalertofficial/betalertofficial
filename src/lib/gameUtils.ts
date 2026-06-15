import type { OddsApiEvent, OddsApiScore } from "@/services/oddsApiService";

/** A game is "live" if it started within the last ~3.5 hours and isn't completed. */
export function isGameLive(commenceTime: string): boolean {
  const diff = Date.now() - new Date(commenceTime).getTime();
  return diff > 0 && diff < 3.5 * 60 * 60 * 1000;
}

export function isGameToday(commenceTime: string): boolean {
  const d = new Date(commenceTime);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

/** "7:15 PM" */
export function formatGameTime(commenceTime: string): string {
  return new Date(commenceTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** American odds: +150 / -110 */
export function formatOdds(price: number | null | undefined): string {
  if (price === null || price === undefined || Number.isNaN(price)) return "—";
  return price > 0 ? `+${price}` : `${price}`;
}

const PREFERRED_BOOKMAKERS = ["draftkings", "fanduel"];

function sortedBookmakers(event: OddsApiEvent) {
  return [...(event.bookmakers || [])].sort((a, b) => {
    const ai = PREFERRED_BOOKMAKERS.indexOf(a.key);
    const bi = PREFERRED_BOOKMAKERS.indexOf(b.key);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

/** Moneyline (h2h) price for a team in an event, from the preferred bookmaker available. */
export function getTeamMoneyline(event: OddsApiEvent, teamName: string): number | null {
  for (const bm of sortedBookmakers(event)) {
    const market = bm.markets.find((m) => m.key === "h2h");
    const outcome = market?.outcomes.find((o) => o.name === teamName);
    if (outcome) return outcome.price;
  }
  return null;
}

/** Spread (point + price) for a team in an event. */
export function getTeamSpread(event: OddsApiEvent, teamName: string): { point: number; price: number } | null {
  for (const bm of sortedBookmakers(event)) {
    const market = bm.markets.find((m) => m.key === "spreads");
    const outcome = market?.outcomes.find((o) => o.name === teamName);
    if (outcome && outcome.point !== undefined) return { point: outcome.point, price: outcome.price };
  }
  return null;
}

/** Map a scores array (Odds API /scores) into a {teamName: score} lookup. */
export function scoreLookup(score: OddsApiScore | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  score?.scores?.forEach((s) => {
    const n = parseInt(s.score, 10);
    if (!Number.isNaN(n)) out[s.name] = n;
  });
  return out;
}
