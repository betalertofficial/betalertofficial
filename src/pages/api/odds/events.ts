import type { NextApiRequest, NextApiResponse } from "next";

/**
 * GET /api/odds/events?sport=basketball_nba
 * GET /api/odds/events?sport=basketball_nba&type=scores
 *
 * Server-side proxy to the-odds-api.com odds and scores endpoints.
 * Keeps the ODDS_API_KEY out of the browser bundle and avoids CORS.
 *
 * Query params:
 *   sport  — required, e.g. "basketball_nba"
 *   type   — optional: "odds" (default) | "scores"
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ODDS_API_KEY not configured" });
  }

  const { sport, type = "odds" } = req.query;

  if (!sport || typeof sport !== "string") {
    return res.status(400).json({ error: "sport query param is required" });
  }

  try {
    let url: string;

    if (type === "scores") {
      url = `https://api.the-odds-api.com/v4/sports/${sport}/scores?apiKey=${apiKey}&daysFrom=2`;
    } else {
      url = `https://api.the-odds-api.com/v4/sports/${sport}/odds?apiKey=${apiKey}&regions=us&markets=h2h,spreads,totals&bookmakers=fanduel,draftkings&oddsFormat=american`;
    }

    const response = await fetch(url);

    if (!response.ok) {
      const body = await response.text();
      console.error(`[/api/odds/events] Odds API error (${sport}, ${type}):`, response.status, body);
      return res.status(response.status).json({
        error: `Odds API error: ${response.status} ${response.statusText}`,
        detail: body,
      });
    }

    const data = await response.json();
    // Cache odds for 60s (they change frequently), scores for 30s
    const maxAge = type === "scores" ? 30 : 60;
    res.setHeader("Cache-Control", `public, s-maxage=${maxAge}`);
    return res.status(200).json(data);
  } catch (err) {
    console.error("[/api/odds/events] Unexpected error:", err);
    return res.status(500).json({ error: "Failed to fetch odds data" });
  }
}
