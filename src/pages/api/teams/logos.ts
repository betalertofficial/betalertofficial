import type { NextApiRequest, NextApiResponse } from "next";

/**
 * GET /api/teams/logos
 *
 * Returns, sourced from ESPN's public team data across the leagues we support:
 *  - map:          lowercased team-name variant -> logo URL
 *  - leagueByName: lowercased team-name variant -> our Odds API sport key
 *
 * Used to show real logos AND to classify a team's league by NAME (robust when
 * the teams table's `league` column is missing or oddly formatted). Cached hard.
 */
const ESPN_LEAGUES = [
  { path: "baseball/mlb", sportKey: "baseball_mlb" },
  { path: "basketball/nba", sportKey: "basketball_nba" },
  { path: "football/nfl", sportKey: "americanfootball_nfl" },
  { path: "hockey/nhl", sportKey: "icehockey_nhl" },
  { path: "soccer/eng.1", sportKey: "soccer_epl" },
];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const map: Record<string, string> = {};
  const leagueByName: Record<string, string> = {};

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
          // Variants that include the bare abbreviation (fine for logo lookup).
          const logoVariants = [
            team.displayName,
            team.shortDisplayName,
            team.name,
            team.nickname,
            team.abbreviation,
            team.location && team.name ? `${team.location} ${team.name}` : null,
          ];
          // For league classification, avoid the bare abbreviation (e.g. "ATL"
          // is both Braves and Hawks) — use full/name variants only.
          const nameVariants = [
            team.displayName,
            team.shortDisplayName,
            team.name,
            team.location && team.name ? `${team.location} ${team.name}` : null,
          ];
          for (const v of logoVariants) {
            if (v && logo) map[String(v).toLowerCase().trim()] = logo;
          }
          for (const v of nameVariants) {
            if (v) leagueByName[String(v).toLowerCase().trim()] = lg.sportKey;
          }
        }
      } catch {
        /* skip league on error */
      }
    })
  );

  res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
  return res.status(200).json({ map, leagueByName });
}
