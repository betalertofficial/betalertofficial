
import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "@/types/database";

export const profileService = {
  async getProfile(userId: string): Promise<Profile | null> {
    console.log("[profileService] Fetching profile for userId:", userId);
    
    // First check if we have a valid session
    const { data: { session } } = await supabase.auth.getSession();
    console.log("[profileService] Current session:", session?.user?.id || "no session");
    
    if (!session) {
      console.warn("[profileService] No active session found");
      return null;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .limit(1);

    console.log("[profileService] Query result:", { data, error });

    if (error) {
      console.error("[profileService] Unexpected error:", error);
      throw error;
    }

    const profile = data?.[0] || null;

    // Handle case where profile doesn't exist yet (normal for new/anonymous users)
    if (!profile) {
      console.log("[profileService] Profile not found (empty list) - this is normal for new users");
      return null;
    }
    
    console.log("[profileService] Profile loaded successfully:", profile.id);
    return profile as Profile | null;
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
          phone_e164: profile.phone_e164 || null,
          country_code: profile.country_code || null,
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
