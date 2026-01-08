import { supabase } from "@/integrations/supabase/client";
import type { Trigger, ProfileTrigger, BetType, TriggerFrequency } from "@/types/database";

interface CreateTriggerParams {
  sport: string;
  team_or_player: string;
  team_id?: string;
  bet_type: BetType;
  odds_comparator: string;
  odds_value: number;
  bookmaker?: string;
  vendor_id?: string;
  frequency: TriggerFrequency;
  status: string;
}

export const triggerService = {
  async getUserTriggers(userId: string): Promise<ProfileTrigger[]> {
    const { data, error } = await supabase
      .from("profile_triggers")
      .select(`
        id,
        profile_id,
        trigger_id,
        created_at,
        trigger:triggers (
          id,
          sport,
          team_or_player,
          team_id,
          bet_type,
          odds_comparator,
          odds_value,
          frequency,
          status,
          bookmaker,
          vendor_id,
          created_at,
          updated_at
        )
      `)
      .eq("profile_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data as ProfileTrigger[];
  },

  async createTrigger(params: CreateTriggerParams): Promise<ProfileTrigger> {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error("User not authenticated");
    }

    // Check if profile exists, create if not (for anonymous users)
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .single();

    if (!existingProfile) {
      // Create profile for anonymous user with trigger_limit of 3
      const { error: profileError } = await supabase
        .from("profiles")
        .insert([{
          id: user.id,
          trigger_limit: 3,
          name: "Anonymous User",
          // phone_e164 and country_code are now nullable, so we can omit them
          role: "user"
        }]);

      if (profileError) {
        console.error("Error creating profile for anonymous user:", profileError);
        throw new Error("Failed to create user profile");
      }
    }

    // Insert trigger
    const { data: trigger, error: triggerError } = await supabase
      .from("triggers")
      .insert([{
        sport: params.sport,
        team_or_player: params.team_or_player,
        team_id: params.team_id,
        bet_type: params.bet_type,
        odds_comparator: params.odds_comparator,
        odds_value: params.odds_value,
        frequency: params.frequency,
        status: params.status,
        vendor_id: params.vendor_id,
        bookmaker: params.bookmaker
      }])
      .select()
      .single();

    if (triggerError) {
      console.error("Error creating trigger:", triggerError);
      throw triggerError;
    }

    // Link trigger to user profile
    const { data: profileTrigger, error: ptError } = await supabase
      .from("profile_triggers")
      .insert([
        {
          profile_id: user.id,
          trigger_id: trigger.id
        }
      ])
      .select(`
        id,
        profile_id,
        trigger_id,
        created_at,
        trigger:triggers (*)
      `)
      .single();

    if (ptError) {
      console.error("Error creating profile_trigger:", ptError);
      throw ptError;
    }
    
    return profileTrigger as ProfileTrigger;
  },

  async updateTrigger(triggerId: string, updates: Partial<Trigger>): Promise<Trigger> {
    const { data, error } = await supabase
      .from("triggers")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", triggerId)
      .select()
      .single();

    if (error) throw error;
    return data as Trigger;
  },

  async deleteTrigger(userId: string, triggerId: string): Promise<void> {
    const { error } = await supabase
      .from("profile_triggers")
      .delete()
      .eq("profile_id", userId)
      .eq("trigger_id", triggerId);

    if (error) throw error;
  }
};