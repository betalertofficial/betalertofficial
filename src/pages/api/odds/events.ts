import type { NextApiRequest, NextApiResponse } from "next";

/**
 * GET /api/odds/events?sport=basketball_nba
 * GET /api/odds/events?sport=basketball_nba&type=scores
 * GET /api/odds/events?sport=basketball_nba&markets=h2h   ← lean dashboard call
 *
 * Server-side proxy to the-odds-api.com. Keeps ODDS_API_KEY off the browser.
 *
 * `sport` is validated against an allowlist so this proxy can't be abused to
 * fan out arbitrary requests against the (paid, rate-limited) Odds API.
 *
 * `markets` (odds only) is an optional comma-separated subset of
 * h2h,spreads,totals. Cost on the Odds API is (markets × regions) credits per
 * call, so the dashboard passes `markets=h2h` to spend 1 credit/league instead
 * of 3. Omitting it preserves the full h2h,spreads,totals set the create-trigger
 * modal relies on.
 */
const ALLOWED_SPORTS = new Set<string>([
  "basketball_nba",
  "basketball_ncaab",
  "americanfootball_nfl",
  "americanfootball_ncaaf",
  "baseball_mlb",
  "icehockey_nhl",
  "soccer_epl",
  "soccer_usa_mls",
  "soccer_fifa_world_cup",
]);

const ALLOWED_MARKETS = new Set<string>(["h2h", "spreads", "totals"]);
const DEFAULT_MARKETS = "h2h,spreads,totals";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ODDS_API_KEY not configured" });
  }

  const { sport, type = "odds" } = req.query;

  if (!sport || typeof sport !== "string" || !ALLOWED_SPORTS.has(sport)) {
    return res.status(400).json({ error: "Invalid or unsupported 'sport' parameter" });
  }
  if (type !== "odds" && type !== "scores") {
    return res.status(400).json({ error: "Invalid 'type' parameter" });
  }

  // Sanitize the optional markets subset (odds only). Anything unrecognized is
  // dropped; an empty/absent value falls back to the full default set.
  const marketsRaw = typeof req.query.markets === "string" ? req.query.markets : "";
  const requestedMarkets = marketsRaw
    .split(",")
    .map((m) => m.trim().toLowerCase())
    .filter((m) => ALLOWED_MARKETS.has(m));
  const markets = requestedMarkets.length ? Array.from(new Set(requestedMarkets)).join(",") : DEFAULT_MARKETS;

  try {
    const url =
      type === "scores"
        ? `https://api.the-odds-api.com/v4/sports/${sport}/scores?apiKey=${apiKey}&daysFrom=2`
        : `https://api.the-odds-api.com/v4/sports/${sport}/odds?apiKey=${apiKey}&regions=us&markets=${markets}&bookmakers=fanduel,draftkings&oddsFormat=american`;

    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });

    if (!response.ok) {
      console.error(`[/api/odds/events] Odds API error (${sport}, ${type}):`, response.status);
      return res.status(response.status).json({ error: `Odds API error: ${response.status}` });
    }

    const data = await response.json();
    // Cache hard at the edge to amortize paid calls across users. The lean
    // dashboard moneyline call (markets=h2h) tolerates more staleness, so it
    // gets a longer window than the full multi-market modal fetch.
    const maxAge = type === "scores" ? 30 : markets === "h2h" ? 300 : 60;
    res.setHeader("Cache-Control", `public, s-maxage=${maxAge}, stale-while-revalidate=60`);
    return res.status(200).json(data);
  } catch (err) {
    console.error("[/api/odds/events] Unexpected error:", err);
    return res.status(500).json({ error: "Failed to fetch odds data" });
  }
}
