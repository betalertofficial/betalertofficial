import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

// Create server-side Supabase client with service role (bypasses RLS)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

/**
 * DEV-ONLY ADMIN LOGIN (No JWT cookies)
 * Creates/finds admin profile and returns profile data directly
 * Client stores in localStorage for iframe compatibility
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Only allow in development
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ error: "Admin login is only available in development" });
  }

  console.log("[Dev Admin Login] Request received");

  try {
    // Check if dev admin profile exists
    const DEV_ADMIN_TELEGRAM_ID = "999999999";
    
    const { data: existingProfile, error: lookupError } = await supabase
      .from("profiles")
      .select("*")
      .eq("telegram_chat_id", DEV_ADMIN_TELEGRAM_ID)
      .maybeSingle();

    if (lookupError) {
      console.error("[Dev Admin Login] Profile lookup error:", lookupError);
      return res.status(500).json({ error: "Database error" });
    }

    let profile: any;

    if (existingProfile) {
      profile = existingProfile;
      console.log("[Dev Admin Login] Found existing admin profile:", profile.id);

      // Ensure role is admin
      if (profile.role !== "admin" && profile.role !== "super_admin") {
        const { data: updatedProfile, error: updateError } = await supabase
          .from("profiles")
          .update({ role: "super_admin" } as any)
          .eq("id", profile.id)
          .select()
          .single();

        if (updateError) {
          console.error("[Dev Admin Login] Error updating role:", updateError);
        } else {
          profile = updatedProfile;
          console.log("[Dev Admin Login] Updated role to super_admin");
        }
      }
    } else {
      // Create dev admin profile
      const userId = crypto.randomUUID();
      console.log("[Dev Admin Login] Creating new admin profile:", userId);

      const { data: newProfile, error: insertError } = await supabase
        .from("profiles")
        .insert({
          id: userId,
          telegram_chat_id: DEV_ADMIN_TELEGRAM_ID,
          telegram_username: "dev_admin",
          telegram_first_name: "Dev",
          name: "Dev Admin",
          role: "super_admin",
          subscription_tier: "pro",
          trigger_limit: 999,
        } as any)
        .select()
        .single();

      if (insertError) {
        console.error("[Dev Admin Login] Error creating profile:", insertError);
        return res.status(500).json({ error: "Failed to create admin profile" });
      }

      profile = newProfile;
      console.log("[Dev Admin Login] Admin profile created");
    }

    console.log("[Dev Admin Login] Returning profile data");
    res.status(200).json({
      success: true,
      profile,
    });
  } catch (error: any) {
    console.error("[Dev Admin Login] Error:", error);
    res.status(500).json({ 
      error: error.message || "Failed to authenticate admin"
    });
  }
}