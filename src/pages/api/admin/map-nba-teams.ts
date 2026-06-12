import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * Admin: map canonical NBA teams to The Odds API team names.
 * POST /api/admin/map-nba-teams  (admin only)
 *
 * Uses the server-side ODDS_API_KEY env var (no longer reads the key from the
 * vendors table, and never returns it).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = await requireAdmin(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }
  const supabaseAdmin = auth.admin;

  const oddsApiKey = process.env.ODDS_API_KEY;
  if (!oddsApiKey) {
    return res.status(500).json({ error: "Odds API key not configured" });
  }

  try {
    // Confirm the vendor exists (do NOT select its api_key).
    const { data: vendor, error: vendorError } = await supabaseAdmin
      .from("vendors")
      .select("id")
      .eq("name", "the_odds_api")
      .single();
    if (vendorError || !vendor) {
      return res.status(404).json({ error: "the_odds_api vendor not found" });
    }

    const { data: canonicalTeams, error: teamsError } = await supabaseAdmin
      .from("teams")
      .select("id, name, abbrev, slug")
      .eq("league", "NBA");
    if (teamsError || !canonicalTeams) {
      return res.status(500).json({ error: "Failed to fetch canonical teams" });
    }

    const oddsApiUrl = `https://api.the-odds-api.com/v4/sports/basketball_nba/odds/?apiKey=${oddsApiKey}&regions=us&markets=h2h`;
    const oddsResponse = await fetch(oddsApiUrl, { signal: AbortSignal.timeout(15000) });
    if (!oddsResponse.ok) {
      return res.status(502).json({ error: "Failed to fetch from Odds API" });
    }
    const oddsData = await oddsResponse.json();
    if (!Array.isArray(oddsData)) {
      return res.status(502).json({ error: "Unexpected Odds API response" });
    }

    const oddsTeamNames = new Set<string>();
    for (const game of oddsData) {
      if (game.home_team) oddsTeamNames.add(game.home_team);
      if (game.away_team) oddsTeamNames.add(game.away_team);
    }

    const { data: existingMappings } = await supabaseAdmin
      .from("vendor_team_map")
      .select("team_id, vendor_team_key")
      .eq("vendor_id", vendor.id);
    const existingKeys = new Set(
      existingMappings?.map((m: any) => `${m.team_id}:${m.vendor_team_key}`) || []
    );

    const mappingsToInsert: any[] = [];
    const matched: any[] = [];
    const unmatched: string[] = [];

    for (const team of canonicalTeams as any[]) {
      let matchedOddsName: string | null = null;
      const canonicalName = team.name.toLowerCase();
      const canonicalAbbrev = team.abbrev?.toLowerCase();

      for (const oddsTeam of Array.from(oddsTeamNames)) {
        const oddsName = oddsTeam.toLowerCase();
        if (oddsName === canonicalName) { matchedOddsName = oddsTeam; break; }
        const nameParts = canonicalName.split(" ");
        if (nameParts.some((part: string) => oddsName.includes(part) && part.length > 3)) { matchedOddsName = oddsTeam; break; }
        if (canonicalAbbrev && oddsName.includes(canonicalAbbrev)) { matchedOddsName = oddsTeam; break; }
      }

      if (matchedOddsName) {
        const mappingKey = `${team.id}:${matchedOddsName}`;
        if (!existingKeys.has(mappingKey)) {
          mappingsToInsert.push({ vendor_id: vendor.id, team_id: team.id, vendor_team_key: matchedOddsName });
        }
        matched.push({ canonicalName: team.name, oddsApiName: matchedOddsName, isNew: !existingKeys.has(mappingKey) });
      } else {
        unmatched.push(team.name);
      }
    }

    if (mappingsToInsert.length > 0) {
      const { error: insertError } = await supabaseAdmin.from("vendor_team_map").insert(mappingsToInsert);
      if (insertError) {
        return res.status(500).json({ error: "Failed to create mappings" });
      }
    }

    return res.status(200).json({
      success: true,
      totalCanonicalTeams: canonicalTeams.length,
      totalOddsTeams: oddsTeamNames.size,
      newlyMapped: mappingsToInsert.length,
      alreadyMapped: matched.filter((m) => !m.isNew).length,
      matchedTeams: matched,
      unmatchedTeams: unmatched,
    });
  } catch (error) {
    console.error("Error mapping NBA teams:", error);
    return res.status(500).json({ error: "Failed to map NBA teams" });
  }
}
