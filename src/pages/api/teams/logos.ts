import type { NextApiRequest, NextApiResponse } from "next";

/**
 * GET /api/teams/logos
 *
 * Returns a flat lookup map of (lowercased team-name variants) -> logo URL,
 * sourced from ESPN's public team data across the leagues we support. Used to
 * show real team logos on the dashboard, including the game cards where teams
 * come from the odds feed as full names (no abbreviations).
 *
 * Cached hard (logos basically never change).
 */
const ESPN_LEAGUES = [
  { path: "baseball/mlb" },
  { path: "basketball/nba" },
  { path: "football/nfl" },
  { path: "hockey/nhl" },
  { path: "soccer/eng.1" },
];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const map: Record<string, string> = {};

  await Promise.all(
    ESPN_LEAGUES.map(async (lg) => {
      try {
        const r = await fetch(
          `https://site.api.espn.com/apis/site/v2/sports/${lg.path}/teams?limit=1000`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (!r.ok) return;
        const data = await r.json();
        const teams = data?.sports?.[0]?.leagues?.[0]?.teams || [];
        for (const entry of teams) {
          const team = entry?.team || entry;
          const logo = team?.logos?.[0]?.href;
          if (!logo) continue;
          const variants = [
            team.displayName,
            team.shortDisplayName,
            team.name,
            team.nickname,
            team.abbreviation,
            team.location && team.name ? `${team.location} ${team.name}` : null,
          ];
          for (const v of variants) {
            if (v) map[String(v).toLowerCase().trim()] = logo;
          }
        }
      } catch {
        /* skip league on error */
      }
    })
  );

  res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
  return res.status(200).json({ map });
}
