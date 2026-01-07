import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "@/integrations/supabase/client";
import { oddsApiService } from "@/services/oddsApiService";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // 1. Get theOddsAPI vendor ID
    const { data: vendor, error: vendorError } = await supabase
      .from("vendors")
      .select("id")
      .eq("name", "theOddsAPI")
      .single();

    if (vendorError || !vendor) {
      return res.status(404).json({ error: "theOddsAPI vendor not found" });
    }

    // 2. Fetch NBA odds from the Odds API
    const apiKey = process.env.ODDS_API_KEY || "8fd23ab732557e3db9238fc571eddbbe";
    const events = await oddsApiService.getOddsForSport("basketball_nba", apiKey);

    // 3. Extract unique team names from events
    const oddsApiTeams = new Set<string>();
    events.forEach(event => {
      oddsApiTeams.add(event.home_team);
      oddsApiTeams.add(event.away_team);
    });

    console.log(`Found ${oddsApiTeams.size} unique teams in Odds API`);

    // 4. Get all NBA teams from our database
    const { data: canonicalTeams, error: teamsError } = await supabase
      .from("teams")
      .select("id, name, abbrev")
      .eq("league", "nba");

    if (teamsError || !canonicalTeams) {
      return res.status(500).json({ error: "Failed to fetch canonical teams" });
    }

    // 5. Create mappings
    const mappings = [];
    const unmapped: string[] = [];

    for (const oddsTeamName of Array.from(oddsApiTeams)) {
      // Try to match by name (case-insensitive, flexible matching)
      const canonical = canonicalTeams.find(team => {
        const oddsLower = oddsTeamName.toLowerCase();
        const teamLower = team.name.toLowerCase();
        
        // Direct match
        if (oddsLower === teamLower) return true;
        
        // Check if odds name contains team name or vice versa
        if (oddsLower.includes(teamLower) || teamLower.includes(oddsLower)) return true;
        
        // Check abbreviation
        if (oddsLower.includes(team.abbrev.toLowerCase())) return true;
        
        return false;
      });

      if (canonical) {
        mappings.push({
          vendor_id: vendor.id,
          team_id: canonical.id,
          vendor_team_key: oddsTeamName,
          vendor_sport_key: "basketball_nba",
          is_active: true,
          last_verified_at: new Date().toISOString()
        });
      } else {
        unmapped.push(oddsTeamName);
      }
    }

    // 6. Insert mappings (ignore conflicts for existing mappings)
    if (mappings.length > 0) {
      const { error: insertError } = await supabase
        .from("vendor_team_map")
        .upsert(mappings, {
          onConflict: "vendor_id,vendor_team_key",
          ignoreDuplicates: false
        });

      if (insertError) {
        console.error("Error inserting mappings:", insertError);
        return res.status(500).json({ error: "Failed to create mappings", details: insertError });
      }
    }

    return res.status(200).json({
      success: true,
      mapped: mappings.length,
      unmapped: unmapped.length,
      unmappedTeams: unmapped,
      mappings: mappings.map(m => ({
        vendor_team_key: m.vendor_team_key,
        canonical_team: canonicalTeams.find(t => t.id === m.team_id)?.name
      }))
    });

  } catch (error) {
    console.error("Error mapping NBA teams:", error);
    return res.status(500).json({ 
      error: "Failed to map NBA teams",
      details: error instanceof Error ? error.message : String(error)
    });
  }
}