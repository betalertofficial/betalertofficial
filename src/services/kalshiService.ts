/**
 * Kalshi (CFTC-regulated prediction exchange) as a free odds source.
 *
 * Kalshi's public market data needs no API key. Each game has one "<Team> wins"
 * market per side; a YES contract trades between $0.01 and $0.99, i.e. roughly
 * the implied win probability. We convert the YES ask (what you'd actually pay)
 * plus Kalshi's estimated taker fee into American odds, so Kalshi rows plug
 * straight into the existing matching engine next to DraftKings / FanDuel.
 *
 * Each Kalshi game is pinned to the Odds API event it corresponds to (same two
 * teams, start time within a few hours), so event-bound "just this game"
 * triggers keep working and alerts share the same game/score context.
 */
import { teamNamesMatch } from "@/lib/teamMatch";

const BASE = "https://api.elections.kalshi.com/trade-api/v2";

/** Odds API sport key → Kalshi moneyline series. */
export const KALSHI_SERIES: Record<string, string> = {
  americanfootball_nfl: "KXNFLGAME",
  basketball_nba: "KXNBAGAME",
  icehockey_nhl: "KXNHLGAME",
  baseball_mlb: "KXMLBGAME",
};

export const KALSHI_BOOKMAKER = "Kalshi";

/** Skip thin books: wide bid/ask spreads make the "price" meaningless. */
const MAX_SPREAD = 0.05;
const MIN_PRICE = 0.03;
const MAX_PRICE = 0.97;
/** Kalshi taker fee ≈ 7% × P × (1 − P) per $1 contract. */
const FEE_RATE = 0.07;

interface KalshiMarket {
  ticker: string;
  event_ticker: string;
  yes_sub_title: string;
  status: string;
  yes_ask_dollars?: string;
  yes_bid_dollars?: string;
  yes_ask_size_fp?: string;
  occurrence_datetime?: string;
  expected_expiration_time?: string;
}

export interface OddsApiEventRef {
  event_id: string;
  sport: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  /** Extra event fields (scores etc.) copied onto each Kalshi row. */
  base?: Record<string, unknown>;
}

export interface KalshiOddsRow {
  sport: string;
  event_id: string;
  team_or_player: string;
  bookmaker: string;
  bet_type: string;
  odds_value: number;
  point: null;
  event_data: any;
}

/** Probability (0–1) → American odds. */
export function probToAmerican(p: number): number {
  if (p >= 0.5) return -Math.round((100 * p) / (1 - p));
  return Math.round((100 * (1 - p)) / p);
}

/** YES ask + estimated fee → effective price per $1 contract. */
export function effectivePrice(ask: number): number {
  return Math.min(0.99, ask + FEE_RATE * ask * (1 - ask));
}

async function fetchSeries(series: string): Promise<KalshiMarket[]> {
  const out: KalshiMarket[] = [];
  let cursor = "";
  for (let page = 0; page < 5; page++) {
    const url = `${BASE}/markets?series_ticker=${series}&status=open&limit=1000${cursor ? `&cursor=${cursor}` : ""}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`Kalshi ${series} HTTP ${r.status}`);
    const j = await r.json();
    out.push(...(j.markets || []));
    cursor = j.cursor || "";
    if (!cursor) break;
  }
  return out;
}

/**
 * Kalshi moneyline rows for the given Odds API events (already-live games).
 * Never throws — a Kalshi outage just means no Kalshi rows this tick.
 */
export async function fetchKalshiMoneylines(events: OddsApiEventRef[]): Promise<KalshiOddsRow[]> {
  const rows: KalshiOddsRow[] = [];
  const bySport = new Map<string, OddsApiEventRef[]>();
  for (const e of events) {
    if (!KALSHI_SERIES[e.sport]) continue;
    if (!bySport.has(e.sport)) bySport.set(e.sport, []);
    bySport.get(e.sport)!.push(e);
  }

  for (const [sport, evs] of bySport) {
    const series = KALSHI_SERIES[sport];
    let markets: KalshiMarket[] = [];
    try {
      markets = await fetchSeries(series);
    } catch (e) {
      console.error(`[Kalshi] fetch failed for ${series}:`, e);
      continue;
    }

    // Group the two sides of each game.
    const games = new Map<string, KalshiMarket[]>();
    for (const m of markets) {
      if (m.status !== "active") continue;
      if (!games.has(m.event_ticker)) games.set(m.event_ticker, []);
      games.get(m.event_ticker)!.push(m);
    }

    for (const ev of evs) {
      const start = new Date(ev.commence_time).getTime();
      let best: { sides: KalshiMarket[]; diff: number } | null = null;
      for (const sides of games.values()) {
        const home = sides.find((s) => teamNamesMatch(s.yes_sub_title, ev.home_team));
        const away = sides.find((s) => teamNamesMatch(s.yes_sub_title, ev.away_team));
        if (!home || !away || home === away) continue;
        // Kalshi's occurrence time is ~3h after first pitch / tip / kickoff.
        const occ = new Date(home.occurrence_datetime || home.expected_expiration_time || "").getTime();
        const diff = Number.isNaN(occ) ? 12 * 3600e3 : Math.abs(occ - 3 * 3600e3 - start);
        if (diff > 10 * 3600e3) continue;
        if (!best || diff < best.diff) best = { sides: [home, away], diff };
      }
      if (!best) continue;

      for (const side of best.sides) {
        const ask = parseFloat(side.yes_ask_dollars || "");
        const bid = parseFloat(side.yes_bid_dollars || "");
        if (!Number.isFinite(ask) || ask < MIN_PRICE || ask > MAX_PRICE) continue;
        if (!Number.isFinite(bid) || ask - bid > MAX_SPREAD) continue;
        if (!(parseFloat(side.yes_ask_size_fp || "0") > 0)) continue;

        const team = teamNamesMatch(side.yes_sub_title, ev.home_team) ? ev.home_team : ev.away_team;
        const eff = effectivePrice(ask);
        rows.push({
          sport,
          event_id: ev.event_id,
          team_or_player: team,
          bookmaker: KALSHI_BOOKMAKER,
          bet_type: "h2h",
          odds_value: probToAmerican(eff),
          point: null,
          event_data: {
            ...(ev.base || {}),
            id: ev.event_id,
            sport_key: sport,
            home_team: ev.home_team,
            away_team: ev.away_team,
            commence_time: ev.commence_time,
            source: "kalshi",
            kalshi_ticker: side.ticker,
            kalshi_event: side.event_ticker,
            kalshi_ask: ask,
            kalshi_bid: bid,
            event_link: `https://kalshi.com/markets/${series.toLowerCase()}`,
          },
        });
      }
    }
  }
  console.log(`[Kalshi] ${rows.length} moneyline row(s) for ${events.length} live event(s)`);
  return rows;
}
