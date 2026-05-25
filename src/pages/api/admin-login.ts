import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { signTelegramJWT } from "@/lib/jwt";
import { serialize } from "cookie";
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
 * DEV-ONLY ADMIN LOGIN
 * Creates/finds admin profile and sets JWT cookie
 * Only works in development mode
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

  console.log("[Admin Login] Request received");

  try {
    // Check if dev admin profile exists
    const DEV_ADMIN_TELEGRAM_ID = "999999999"; // Fake Telegram ID for dev admin
    
    const { data: existingProfile, error: lookupError } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("telegram_chat_id", DEV_ADMIN_TELEGRAM_ID)
      .maybeSingle();

    if (lookupError) {
      console.error("[Admin Login] Profile lookup error:", lookupError);
      return res.status(500).json({ error: "Database error" });
    }

    let userId: string;

    if (existingProfile) {
      // Profile exists
      userId = existingProfile.id;
      console.log("[Admin Login] Found existing admin profile:", userId);

      // Ensure role is admin
      if (existingProfile.role !== "admin" && existingProfile.role !== "super_admin") {
        const { error: updateError } = await supabase
          .from("profiles")
          .update({ role: "super_admin" } as any)
          .eq("id", userId);

        if (updateError) {
          console.error("[Admin Login] Error updating role:", updateError);
        } else {
          console.log("[Admin Login] Updated role to super_admin");
        }
      }
    } else {
      // Create dev admin profile
      userId = crypto.randomUUID();
      console.log("[Admin Login] Creating new admin profile:", userId);

      const { error: insertError } = await supabase
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
        } as any);

      if (insertError) {
        console.error("[Admin Login] Error creating profile:", insertError);
        return res.status(500).json({ error: "Failed to create admin profile" });
      }

      console.log("[Admin Login] Admin profile created");
    }

    // Generate JWT
    console.log("[Admin Login] Generating JWT token");
    const token = signTelegramJWT({
      userId,
      telegramChatId: DEV_ADMIN_TELEGRAM_ID,
      telegramUsername: "dev_admin",
      telegramFirstName: "Dev",
    });

    // Set HttpOnly cookie
    const cookie = serialize("telegram_session", token, {
      httpOnly: true,
      secure: false, // Always false since this only runs in development
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: "/",
    });

    res.setHeader("Set-Cookie", cookie);
    console.log("[Admin Login] Cookie set successfully");
    console.log("[Admin Login] Cookie value:", cookie.substring(0, 50) + "...");

    res.status(200).json({
      success: true,
      userId,
      debug: {
        cookieSet: true,
        userId,
        role: "super_admin"
      }
    });
  } catch (error: any) {
    console.error("[Admin Login] Error:", error);
    res.status(500).json({ 
      error: error.message || "Failed to authenticate admin"
    });
  }
}