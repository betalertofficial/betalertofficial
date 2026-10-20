/**
 * Polymarket as a free moneyline odds source (public Gamma API, no key).
 *
 * Each game is a Polymarket event (slug like "nhl-tor-cbj-2026-10-20") with a
 * "moneyline" market whose two outcomes are the teams. bestBid/bestAsk refer
 * to the FIRST outcome; the second outcome's ask is 1 − bestBid. We convert the
 * ask plus Polymarket's estimated taker fee into American odds and pin each
 * game to the matching Odds API event (both teams + start time).
 */
import { teamNamesMatch } from "@/lib/teamMatch";
import { probToAmerican, type OddsApiEventRef } from "./kalshiService";

const GAMMA = "https://gamma-api.polymarket.com";

/** Odds API sport key → Polymarket series id (from gamma /sports). */
export const POLY_SERIES: Record<string, string> = {
  americanfootball_nfl: "12185",
  basketball_nba: "10345",
  icehockey_nhl: "10346",
  baseball_mlb: "3",
};

export const POLY_BOOKMAKER = "Polymarket";

const MAX_SPREAD = 0.05;
const MIN_PRICE = 0.03;
const MAX_PRICE = 0.97;
const MIN_LIQUIDITY = 1000;

export interface PolyOddsRow {
  sport: string;
  event_id: string;
  team_or_player: string;
  bookmaker: string;
  bet_type: string;
  odds_value: number;
  point: null;
  event_data: any;
}

function parseList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  try {
    const a = JSON.parse(String(v ?? "[]"));
    return Array.isArray(a) ? a.map(String) : [];
  } catch {
    return [];
  }
}

/** Fee per $1 share ≈ rate × p × (1 − p); takerBaseFee is in basis points. */
function withFee(ask: number, m: any): number {
  const rate = m?.feesEnabled ? Number(m?.takerBaseFee || 0) / 10000 : 0;
  return Math.min(0.99, ask + rate * ask * (1 - ask));
}

async function fetchSeriesEvents(seriesId: string): Promise<any[]> {
  const r = await fetch(`${GAMMA}/events?series_id=${seriesId}&closed=false&limit=500`, {
    signal: AbortSignal.timeout(10000),
    headers: { Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`Polymarket series ${seriesId} HTTP ${r.status}`);
  const j = await r.json();
  return Array.isArray(j) ? j : [];
}

/** Polymarket moneyline rows for the given (live) Odds API events. Never throws. */
export async function fetchPolymarketMoneylines(events: OddsApiEventRef[]): Promise<PolyOddsRow[]> {
  const rows: PolyOddsRow[] = [];
  const bySport = new Map<string, OddsApiEventRef[]>();
  for (const e of events) {
    if (!POLY_SERIES[e.sport]) continue;
    if (!bySport.has(e.sport)) bySport.set(e.sport, []);
    bySport.get(e.sport)!.push(e);
  }

  for (const [sport, evs] of bySport) {
    let pmEvents: any[] = [];
    try {
      pmEvents = await fetchSeriesEvents(POLY_SERIES[sport]);
    } catch (e) {
      console.error(`[Polymarket] fetch failed for ${sport}:`, e);
      continue;
    }
    const games = pmEvents
      .map((pe) => ({ pe, m: (pe.markets || []).find((m: any) => m.sportsMarketType === "moneyline") }))
      .filter((g) => g.m && g.m.acceptingOrders !== false && !g.pe.ended);

    for (const ev of evs) {
      const start = new Date(ev.commence_time).getTime();
      let best: { pe: any; m: any; outcomes: string[]; diff: number } | null = null;
      for (const g of games) {
        const outcomes = parseList(g.m.outcomes);
        if (outcomes.length !== 2) continue;
        const hasHome = outcomes.some((o) => teamNamesMatch(o, ev.home_team));
        const hasAway = outcomes.some((o) => teamNamesMatch(o, ev.away_team));
        if (!hasHome || !hasAway) continue;
        const t = new Date(g.pe.startTime || String(g.m.gameStartTime || "").replace(" ", "T").replace("+00", "Z")).getTime();
        const diff = Number.isNaN(t) ? 12 * 3600e3 : Math.abs(t - start);
        if (diff > 6 * 3600e3) continue;
        if (!best || diff < best.diff) best = { pe: g.pe, m: g.m, outcomes, diff };
      }
      if (!best) continue;

      const { pe, m, outcomes } = best;
      const bid0 = Number(m.bestBid);
      const ask0 = Number(m.bestAsk);
      if (!Number.isFinite(bid0) || !Number.isFinite(ask0) || ask0 - bid0 > MAX_SPREAD) continue;
      if (Number(m.liquidityNum ?? m.liquidity ?? 0) < MIN_LIQUIDITY) continue;

      // Outcome 0 buys at ask0; outcome 1 buys at 1 − bid0.
      const sides = [
        { name: outcomes[0], ask: ask0, bid: bid0 },
        { name: outcomes[1], ask: 1 - bid0, bid: 1 - ask0 },
      ];
      for (const s of sides) {
        if (s.ask < MIN_PRICE || s.ask > MAX_PRICE) continue;
        const team = teamNamesMatch(s.name, ev.home_team) ? ev.home_team : teamNamesMatch(s.name, ev.away_team) ? ev.away_team : null;
        if (!team) continue;
        const ask = Math.round(s.ask * 1000) / 1000;
        rows.push({
          sport,
          event_id: ev.event_id,
          team_or_player: team,
          bookmaker: POLY_BOOKMAKER,
          bet_type: "h2h",
          odds_value: probToAmerican(withFee(ask, m)),
          point: null,
          event_data: {
            ...(ev.base || {}),
            id: ev.event_id,
            sport_key: sport,
            home_team: ev.home_team,
            away_team: ev.away_team,
            commence_time: ev.commence_time,
            source: "polymarket",
            poly_slug: pe.slug,
            poly_ask: ask,
            poly_bid: Math.round(s.bid * 1000) / 1000,
            bet_link: `https://polymarket.com/event/${pe.slug}`,
            event_link: `https://polymarket.com/event/${pe.slug}`,
          },
        });
      }
    }
  }
  console.log(`[Polymarket] ${rows.length} moneyline row(s) for ${events.length} live event(s)`);
  return rows;
}
