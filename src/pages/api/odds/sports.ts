import type { NextApiRequest, NextApiResponse } from "next";

/**
 * GET /api/odds/sports
 *
 * Server-side proxy to the-odds-api.com /sports endpoint.
 * Keeps the ODDS_API_KEY out of the browser bundle and avoids CORS.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ODDS_API_KEY not configured" });
  }

  try {
    const response = await fetch(
      `https://api.the-odds-api.com/v4/sports?apiKey=${apiKey}`
    );

    if (!response.ok) {
      const body = await response.text();
      console.error("[/api/odds/sports] Odds API error:", response.status, body);
      return res.status(response.status).json({
        error: `Odds API error: ${response.status} ${response.statusText}`,
      });
    }

    const data = await response.json();
    // Cache for 5 minutes — sports list rarely changes
    res.setHeader("Cache-Control", "public, s-maxage=300");
    return res.status(200).json(data);
  } catch (err) {
    console.error("[/api/odds/sports] Unexpected error:", err);
    return res.status(500).json({ error: "Failed to fetch sports" });
  }
}
