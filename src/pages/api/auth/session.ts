import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "@/integrations/supabase/client";
import { verifyTelegramJWT } from "@/lib/jwt";
import { parse } from "cookie";

interface SessionResponse {
  authenticated: boolean;
  userId?: string;
  profile?: any;
  authMethod?: 'telegram' | 'supabase';
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SessionResponse>
) {
  if (req.method !== "GET") {
    res.status(405).json({ authenticated: false, error: "Method not allowed" });
    return;
  }

  try {
    // 1. Check for Telegram JWT cookie first
    const cookies = parse(req.headers.cookie || "");
    const telegramToken = cookies.telegram_session;

    console.log("[Session API] Cookie header:", req.headers.cookie ? "present" : "missing");
    console.log("[Session API] Parsed cookies:", Object.keys(cookies));
    console.log("[Session API] telegram_session cookie:", telegramToken ? "found" : "missing");

    if (telegramToken) {
      const payload = verifyTelegramJWT(telegramToken);
      
      if (payload) {
        // Valid Telegram session - fetch profile using service role to bypass RLS
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", payload.userId)
          .maybeSingle();

        if (error) {
          console.error("[Session API] Error fetching Telegram profile:", error);
          res.status(500).json({ authenticated: false, error: "Failed to fetch profile" });
          return;
        }

        if (profile) {
          res.status(200).json({
            authenticated: true,
            userId: payload.userId,
            profile,
            authMethod: 'telegram',
          });
          return;
        }
      }
      
      // Invalid token - clear cookie and continue to Supabase check
      res.setHeader("Set-Cookie", "telegram_session=; Path=/; Max-Age=0; HttpOnly");
    }

    // 2. Check for Supabase session
    const authHeader = req.headers.authorization;
    
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      
      // Verify Supabase token and get user
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      
      if (authError || !user) {
        console.error("[Session API] Invalid Supabase token:", authError);
        res.status(401).json({ authenticated: false, error: "Invalid session" });
        return;
      }

      // Fetch profile
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        console.error("[Session API] Error fetching Supabase profile:", profileError);
        res.status(500).json({ authenticated: false, error: "Failed to fetch profile" });
        return;
      }

      res.status(200).json({
        authenticated: true,
        userId: user.id,
        profile,
        authMethod: 'supabase',
      });
      return;
    }

    // 3. No valid session found
    res.status(401).json({ authenticated: false, error: "No session found" });
  } catch (error) {
    console.error("[Session API] Session check error:", error);
    res.status(500).json({ authenticated: false, error: "Internal server error" });
  }
}