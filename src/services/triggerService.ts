
import { supabase } from "@/integrations/supabase/client";
import type { Trigger, ProfileTrigger } from "@/types/database";

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
          bet_type,
          odds_comparator,
          odds_value,
          frequency,
          status,
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

  async createTrigger(
    userId: string,
    triggerData: Omit<Trigger, "id" | "created_at" | "updated_at">
  ): Promise<ProfileTrigger> {
    const { data: trigger, error: triggerError } = await supabase
      .from("triggers")
      .insert([triggerData])
      .select()
      .single();

    if (triggerError) throw triggerError;

    const { data: profileTrigger, error: ptError } = await supabase
      .from("profile_triggers")
      .insert([
        {
          profile_id: userId,
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

    if (ptError) throw ptError;
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
    return data;
  },

  async deleteTrigger(userId: string, triggerId: string): Promise<void> {
    const { error } = await supabase
      .from("profile_triggers")
      .delete()
      .eq("profile_id", userId)
      .eq("trigger_id", triggerId);

    if (error) throw error;
  },

  async getTriggerStats(userId: string) {
    const triggers = await this.getUserTriggers(userId);
    
    const active = triggers.filter(pt => pt.trigger?.status === "active").length;
    const completed = triggers.filter(pt => pt.trigger?.status === "completed").length;
    const paused = triggers.filter(pt => pt.trigger?.status === "paused").length;

    return { active, completed, paused, total: triggers.length };
  }
};
