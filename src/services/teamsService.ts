import { supabase } from "@/integrations/supabase/client";

export interface Team {
  id: string;
  league: string;
  name: string;
  abbrev: string | null;
  slug: string;
  primary_color: string | null;
  secondary_color: string | null;
}

export const teamsService = {
  async getTeamsByLeague(league: string): Promise<Team[]> {
    const { data, error } = await supabase
      .from("teams")
      .select("*")
      .eq("league", league)
      .order("name", { ascending: true });

    if (error) {
      console.error("Error fetching teams:", error);
      throw error;
    }

    return data || [];
  },

  async getAllTeams(): Promise<Team[]> {
    const { data, error } = await supabase
      .from("teams")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      console.error("Error fetching teams:", error);
      throw error;
    }

    return data || [];
  }
};