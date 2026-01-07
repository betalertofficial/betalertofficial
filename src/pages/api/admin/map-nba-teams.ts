import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

// Create admin client with service role to bypass RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // 1. Get the_odds_api vendor ID
    const { data: vendor, error: vendorError } = await supabaseAdmin
      .from("vendors")
      .select("id, api_key")
      .eq("name", "the_odds_api")
      .single();

    if (vendorError || !vendor) {
      return res.status(404).json({ error: "the_odds_api vendor not found" });
    }

    if (!vendor.api_key) {
      return res.status(400).json({ error: "the_odds_api has no API key configured" });
    }

    // 2. Fetch all NBA teams from our canonical teams table
    const { data: canonicalTeams, error: teamsError } = await supabaseAdmin
      .from("teams")
      .select("id, name, abbrev, slug")
      .eq("league", "NBA");

    if (teamsError || !canonicalTeams) {
      return res.status(500).json({ 
        error: "Failed to fetch canonical teams",
        details: teamsError 
      });
    }

    // 3. Fetch current NBA games from the Odds API to get their team names
    const oddsApiUrl = `https://api.the-odds-api.com/v4/sports/basketball_nba/odds/?apiKey=${vendor.api_key}&regions=us&markets=h2h`;
    const oddsResponse = await fetch(oddsApiUrl);
    
    if (!oddsResponse.ok) {
      return res.status(500).json({ 
        error: "Failed to fetch from Odds API",
        details: await oddsResponse.text()
      });
    }

    const oddsData = await oddsResponse.json();

    // 4. Extract unique team names from the API response
    const oddsTeamNames = new Set<string>();
    for (const game of oddsData) {
      if (game.home_team) oddsTeamNames.add(game.home_team);
      if (game.away_team) oddsTeamNames.add(game.away_team);
    }

    // 5. Get existing mappings to avoid duplicates
    const { data: existingMappings } = await supabaseAdmin
      .from("vendor_team_map")
      .select("team_id, vendor_team_key")
      .eq("vendor_id", vendor.id);

    const existingKeys = new Set(
      existingMappings?.map(m => `${m.team_id}:${m.vendor_team_key}`) || []
    );

    // 6. Match our canonical teams to Odds API team names
    const mappingsToInsert = [];
    const matched = [];
    const unmatched = [];

    for (const team of canonicalTeams) {
      let matchedOddsName: string | null = null;
      const canonicalName = team.name.toLowerCase();
      const canonicalAbbrev = team.abbrev?.toLowerCase();

      // Iterate through available Odds API team names to find a match
      for (const oddsTeam of Array.from(oddsTeamNames)) {
        const oddsName = oddsTeam.toLowerCase();

        // Direct match
        if (oddsName === canonicalName) {
          matchedOddsName = oddsTeam;
          break;
        }

        // Partial match (e.g., "Lakers" in "Los Angeles Lakers")
        const nameParts = canonicalName.split(" ");
        if (nameParts.some(part => oddsName.includes(part) && part.length > 3)) {
          matchedOddsName = oddsTeam;
          break;
        }

        // Abbreviation match
        if (canonicalAbbrev && oddsName.includes(canonicalAbbrev)) {
          matchedOddsName = oddsTeam;
          break;
        }
      }

      if (matchedOddsName) {
        // Check if this mapping already exists
        const mappingKey = `${team.id}:${matchedOddsName}`;
        if (!existingKeys.has(mappingKey)) {
          mappingsToInsert.push({
            vendor_id: vendor.id,
            team_id: team.id,
            vendor_team_key: matchedOddsName
          });
        }
        matched.push({
          canonicalName: team.name,
          oddsApiName: matchedOddsName,
          isNew: !existingKeys.has(mappingKey)
        });
      } else {
        unmatched.push(team.name);
      }
    }

    // 7. Insert new mappings in bulk
    if (mappingsToInsert.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from("vendor_team_map")
        .insert(mappingsToInsert);

      if (insertError) {
        return res.status(500).json({ 
          error: "Failed to create mappings",
          details: insertError
        });
      }
    }

    // 8. Return results
    return res.status(200).json({
      success: true,
      totalCanonicalTeams: canonicalTeams.length,
      totalOddsTeams: oddsTeamNames.size,
      newlyMapped: mappingsToInsert.length,
      alreadyMapped: matched.filter(m => !m.isNew).length,
      matchedTeams: matched,
      unmatchedTeams: unmatched,
      oddsTeamNames: Array.from(oddsTeamNames)
    });

  } catch (error) {
    console.error("Error mapping NBA teams:", error);
    return res.status(500).json({ 
      error: "Failed to map NBA teams",
      details: error instanceof Error ? error.message : String(error)
    });
  }
}