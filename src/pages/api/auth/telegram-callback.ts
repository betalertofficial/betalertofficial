import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "@/integrations/supabase/client";
import crypto from "crypto";

interface TelegramAuthData {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

// Verify Telegram auth data integrity
function verifyTelegramAuth(authData: TelegramAuthData): boolean {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error("TELEGRAM_BOT_TOKEN not set");
    return false;
  }

  // Create data check string
  const checkData = Object.keys(authData)
    .filter((key) => key !== "hash")
    .sort()
    .map((key) => `${key}=${authData[key as keyof TelegramAuthData]}`)
    .join("\n");

  // Create secret key
  const secretKey = crypto.createHash("sha256").update(botToken).digest();

  // Calculate hash
  const hmac = crypto.createHmac("sha256", secretKey).update(checkData).digest("hex");

  // Compare hashes
  return hmac === authData.hash;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const authData: TelegramAuthData = req.body;

    // Verify auth data
    if (!verifyTelegramAuth(authData)) {
      console.error("Invalid Telegram auth hash");
      res.status(401).json({ error: "Invalid authentication" });
      return;
    }

    // Check if auth is recent (within 1 hour)
    const authAge = Date.now() / 1000 - authData.auth_date;
    if (authAge > 3600) {
      console.error("Auth data too old");
      res.status(401).json({ error: "Authentication expired" });
      return;
    }

    const chatId = authData.id.toString();

    // Check if profile exists with this telegram_chat_id
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("telegram_chat_id", chatId)
      .maybeSingle();

    let userId: string;

    if (existingProfile) {
      // Profile exists - user already has an account
      userId = existingProfile.id;
      
      // Update Telegram info
      await supabase
        .from("profiles")
        .update({
          telegram_username: authData.username || null,
          telegram_first_name: authData.first_name,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", userId);
        
      console.log("[Telegram Auth] Updated existing profile:", userId);
    } else {
      // No existing profile - create new anonymous user
      const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();
      
      if (anonError || !anonData.user) {
        console.error("[Telegram Auth] Failed to create anonymous user:", anonError);
        res.status(500).json({ error: "Failed to create session" });
        return;
      }
      
      userId = anonData.user.id;
      console.log("[Telegram Auth] Created anonymous user:", userId);
      
      // Update the auto-created profile with Telegram data
      await supabase
        .from("profiles")
        .update({
          telegram_chat_id: chatId,
          telegram_username: authData.username || null,
          telegram_first_name: authData.first_name,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", userId);
        
      console.log("[Telegram Auth] Linked Telegram data to profile:", userId);
    }

    // Return success with user data
    res.status(200).json({
      success: true,
      userId,
      telegram: {
        chat_id: chatId,
        username: authData.username,
        first_name: authData.first_name,
      },
    });
  } catch (error) {
    console.error("Telegram auth callback error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}