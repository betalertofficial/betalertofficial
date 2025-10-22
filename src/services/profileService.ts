
import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "@/types/database";

export const profileService = {
  async getProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (error) throw error;
    return data;
  },

  async createProfile(profile: Omit<Profile, "created_at" | "updated_at">): Promise<Profile> {
    const { data, error } = await supabase
      .from("profiles")
      .insert([profile])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateProfile(userId: string, updates: Partial<Profile>): Promise<Profile> {
    const { data, error } = await supabase
      .from("profiles")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", userId)
      .select()
      .single();

    if (error) throw error;
    return data;
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
