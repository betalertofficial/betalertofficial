import type { NextApiRequest, NextApiResponse } from "next";

/**
 * GET /api/odds/events?sport=basketball_nba
 * GET /api/odds/events?sport=basketball_nba&type=scores
 *
 * Server-side proxy to the-odds-api.com. Keeps ODDS_API_KEY off the browser.
 *
 * `sport` is validated against an allowlist so this proxy can't be abused to
 * fan out arbitrary requests against the (paid, rate-limited) Odds API.
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

  try {
    const url =
      type === "scores"
        ? `https://api.the-odds-api.com/v4/sports/${sport}/scores?apiKey=${apiKey}&daysFrom=2`
        : `https://api.the-odds-api.com/v4/sports/${sport}/odds?apiKey=${apiKey}&regions=us&markets=h2h,spreads,totals&bookmakers=fanduel,draftkings&oddsFormat=american`;

    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });

    if (!response.ok) {
      console.error(`[/api/odds/events] Odds API error (${sport}, ${type}):`, response.status);
      return res.status(response.status).json({ error: `Odds API error: ${response.status}` });
    }

    const data = await response.json();
    const maxAge = type === "scores" ? 30 : 60;
    res.setHeader("Cache-Control", `public, s-maxage=${maxAge}`);
    return res.status(200).json(data);
  } catch (err) {
    console.error("[/api/odds/events] Unexpected error:", err);
    return res.status(500).json({ error: "Failed to fetch odds data" });
  }
}
