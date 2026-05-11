import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "@/integrations/supabase/client";
import crypto from "crypto";
import { signTelegramJWT } from "@/lib/jwt";
import { serialize } from "cookie";

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
  console.log("[Telegram Callback] ============ REQUEST RECEIVED ============");
  console.log("[Telegram Callback] Method:", req.method);
  console.log("[Telegram Callback] Headers:", req.headers);
  
  if (req.method !== "POST") {
    console.log("[Telegram Callback] ❌ Method not allowed:", req.method);
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const authData: TelegramAuthData = req.body;
    console.log("[Telegram Callback] Auth data received:", {
      id: authData.id,
      first_name: authData.first_name,
      username: authData.username,
      auth_date: authData.auth_date,
      hasHash: !!authData.hash,
    });

    // Check environment variables FIRST
    console.log("[Telegram Callback] Checking environment variables...");
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const jwtSecret = process.env.JWT_SECRET;
    
    console.log("[Telegram Callback] TELEGRAM_BOT_TOKEN present:", !!botToken);
    console.log("[Telegram Callback] JWT_SECRET present:", !!jwtSecret);
    
    if (!botToken) {
      console.error("[Telegram Callback] ❌ TELEGRAM_BOT_TOKEN not set!");
      res.status(500).json({ error: "Server configuration error: Bot token missing" });
      return;
    }
    
    if (!jwtSecret) {
      console.error("[Telegram Callback] ❌ JWT_SECRET not set!");
      res.status(500).json({ error: "Server configuration error: JWT secret missing" });
      return;
    }

    // Verify auth data
    console.log("[Telegram Callback] Verifying Telegram auth hash...");
    const isValid = verifyTelegramAuth(authData);
    console.log("[Telegram Callback] Hash verification result:", isValid);
    
    if (!isValid) {
      console.error("[Telegram Callback] ❌ Invalid Telegram auth hash");
      res.status(401).json({ error: "Invalid authentication" });
      return;
    }

    // Check if auth is recent (within 1 hour)
    const authAge = Date.now() / 1000 - authData.auth_date;
    console.log("[Telegram Callback] Auth age (seconds):", authAge);
    
    if (authAge > 3600) {
      console.error("[Telegram Callback] ❌ Auth data too old:", authAge, "seconds");
      res.status(401).json({ error: "Authentication expired" });
      return;
    }

    const chatId = authData.id.toString();
    console.log("[Telegram Callback] ✅ Auth verified, chat_id:", chatId);

    // Check if profile exists with this telegram_chat_id
    console.log("[Telegram Callback] Querying database for existing profile...");
    const { data: existingProfile, error: lookupError } = await supabase
      .from("profiles")
      .select("id")
      .eq("telegram_chat_id", chatId)
      .maybeSingle();
    
    if (lookupError) {
      console.error("[Telegram Callback] ❌ Profile lookup error:", lookupError);
      res.status(500).json({ error: "Database error during lookup" });
      return;
    }
    
    console.log("[Telegram Callback] Profile lookup result:", existingProfile ? "FOUND" : "NOT FOUND");

    let userId: string;

    if (existingProfile) {
      // Profile exists - update Telegram info
      userId = existingProfile.id;
      console.log("[Telegram Callback] Updating existing profile:", userId);
      
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          telegram_chat_id: chatId,
          telegram_username: authData.username || null,
          telegram_first_name: authData.first_name,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", userId);
      
      if (updateError) {
        console.error("[Telegram Callback] ❌ Profile update error:", updateError);
        res.status(500).json({ error: "Database error during update" });
        return;
      }
      
      console.log("[Telegram Callback] ✅ Profile updated successfully");
    } else {
      // No existing profile - create new one
      const newUserId = crypto.randomUUID();
      console.log("[Telegram Callback] Creating new profile with UUID:", newUserId);
      
      const { error: insertError } = await supabase
        .from("profiles")
        .insert({
          id: newUserId,
          telegram_chat_id: chatId,
          telegram_username: authData.username || null,
          telegram_first_name: authData.first_name,
          name: authData.first_name,
          subscription_tier: "free",
          trigger_limit: 3,
        } as any);
      
      if (insertError) {
        console.error("[Telegram Callback] ❌ Profile creation error:", insertError);
        res.status(500).json({ error: "Failed to create profile" });
        return;
      }
      
      userId = newUserId;
      console.log("[Telegram Callback] ✅ Profile created successfully");
    }

    // Generate JWT for this Telegram user
    console.log("[Telegram Callback] Generating JWT token...");
    const token = signTelegramJWT({
      userId,
      telegramChatId: chatId,
      telegramUsername: authData.username,
      telegramFirstName: authData.first_name,
    });
    console.log("[Telegram Callback] ✅ JWT token generated");

    // Set HttpOnly cookie
    console.log("[Telegram Callback] Setting HTTP-only cookie...");
    const cookie = serialize("telegram_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: "/",
    });

    res.setHeader("Set-Cookie", cookie);
    console.log("[Telegram Callback] ✅ Cookie set");

    // Return success with user data
    console.log("[Telegram Callback] ============ SUCCESS ============");
    console.log("[Telegram Callback] User ID:", userId);
    console.log("[Telegram Callback] Chat ID:", chatId);
    
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
    console.error("[Telegram Callback] ❌❌❌ UNCAUGHT ERROR ❌❌❌");
    console.error("[Telegram Callback] Error type:", error?.constructor?.name);
    console.error("[Telegram Callback] Error message:", error instanceof Error ? error.message : String(error));
    console.error("[Telegram Callback] Error stack:", error instanceof Error ? error.stack : "No stack trace");
    console.error("[Telegram Callback] Full error object:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}