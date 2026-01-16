
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
      .single();

    console.log("[profileService] Query result:", { data, error });

    // Handle "not found" error - this is expected for new users
    if (error && error.code === "PGRST116") {
      console.log("[profileService] Profile not found (PGRST116) - this is normal for new users");
      return null;
    }
    
    // Handle 406 error - usually means RLS policy blocked the query
    if (error && error.message.includes("Cannot coerce")) {
      console.error("[profileService] 406 error detected - possible session/RLS issue:", error);
      // Try to refresh the session
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        console.error("[profileService] Session refresh failed:", refreshError);
      } else {
        console.log("[profileService] Session refreshed, retrying query...");
        // Retry the query after session refresh
        const { data: retryData, error: retryError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", userId)
          .single();
        
        if (!retryError) {
          console.log("[profileService] Retry successful:", retryData);
          return retryData as Profile | null;
        }
        console.error("[profileService] Retry failed:", retryError);
      }
      return null;
    }
    
    // Handle any other errors
    if (error) {
      console.error("[profileService] Unexpected error:", error);
      throw error;
    }
    
    console.log("[profileService] Profile loaded successfully:", data?.id);
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
