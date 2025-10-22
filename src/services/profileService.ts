
import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "@/types/database";

export const profileService = {
  async getProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (error && error.code !== "PGRST116") { // PGRST116 is the code for "Not Found"
      throw error;
    }
    
    return data as Profile | null;
  },

  async createProfile(profile: Omit<Profile, "created_at" | "updated_at" | "name" | "subscription_tier" | "trigger_limit"> & Partial<Pick<Profile, "name" | "subscription_tier" | "trigger_limit">>): Promise<Profile> {
    const { data, error } = await supabase
      .from("profiles")
      .insert([
        {
          ...profile,
          name: profile.name || "",
          subscription_tier: profile.subscription_tier || "free",
          trigger_limit: profile.trigger_limit || 3,
        }
      ])
      .select()
      .single();

    if (error) throw error;
    return data as Profile;
  },

  async updateProfile(userId: string, updates: Partial<Profile>): Promise<Profile> {
    const { data, error } = await supabase
      .from("profiles")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", userId)
      .select()
      .single();

    if (error) throw error;
    return data as Profile;
  },

  async checkPhoneExists(phone: string): Promise<boolean> {
    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .eq("phone_e164", phone)
      .single();

    return !!data;
  }
};
