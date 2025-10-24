
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const SUPER_ADMIN_ID = "00000000-0000-0000-0000-000000000001";
const SUPER_ADMIN_EMAIL = "admin@betalert.dev";
const SUPER_ADMIN_PHONE = "+15555550001";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ error: "This endpoint is only available in development" });
  }

  try {
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Step 1: Check if super admin user exists
    const { data: existingUser, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(SUPER_ADMIN_ID);
    
    let userId = SUPER_ADMIN_ID;
    let user = existingUser?.user;

    if (getUserError || !user) {
      // User doesn't exist, create it
      const { data: createUserData, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
        id: SUPER_ADMIN_ID,
        email: SUPER_ADMIN_EMAIL,
        phone: SUPER_ADMIN_PHONE,
        email_confirm: true,
        phone_confirm: true,
        user_metadata: {
          name: "Super Admin",
          role: "super_admin"
        }
      });

      if (createUserError) {
        console.error("Error creating super admin user:", createUserError);
        throw new Error(`Failed to create super admin user: ${createUserError.message}`);
      }

      user = createUserData.user;
      userId = user.id;

      // Step 2: Create profile for the new user
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .insert([
          {
            id: userId,
            phone_e164: SUPER_ADMIN_PHONE,
            country_code: "US",
            role: "super_admin",
            subscription_tier: "enterprise",
            trigger_limit: 999,
            name: "Super Admin"
          }
        ]);

      if (profileError && profileError.code !== "23505") { // Ignore if already exists
        console.error("Error creating super admin profile:", profileError);
        throw new Error(`Failed to create super admin profile: ${profileError.message}`);
      }
    } else {
      // User exists, ensure profile exists and has correct role
      const { data: existingProfile } = await supabaseAdmin
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (!existingProfile) {
        const { error: profileError } = await supabaseAdmin
          .from("profiles")
          .insert([{ id: userId, phone_e164: SUPER_ADMIN_PHONE, country_code: "US", role: "super_admin", subscription_tier: "enterprise", trigger_limit: 999, name: "Super Admin" }]);
        if (profileError && profileError.code !== "23505") throw profileError;
      } else if (existingProfile.role !== "super_admin") {
        await supabaseAdmin.from("profiles").update({ role: "super_admin", trigger_limit: 999 }).eq("id", userId);
      }
    }

    // Step 3: Generate session tokens using a magic link
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: SUPER_ADMIN_EMAIL,
    });

    if (linkError) {
      console.error("Error generating magic link:", linkError);
      throw new Error(`Failed to generate magic link: ${linkError.message}`);
    }
    
    // The action_link contains the session tokens in the URL fragment
    const actionLink = linkData.properties.action_link;
    const url = new URL(actionLink);
    const hash = new URLSearchParams(url.hash.substring(1)); // remove #

    const access_token = hash.get('access_token');
    const refresh_token = hash.get('refresh_token');
    const expires_in = hash.get('expires_in');

    if (!access_token || !refresh_token) {
        throw new Error("Could not parse tokens from magic link.");
    }

    // Return the session tokens to the client
    res.status(200).json({
      access_token,
      refresh_token,
      expires_in: expires_in ? parseInt(expires_in) : undefined,
      token_type: "bearer",
      user
    });
  } catch (error: any) {
    console.error("Dev admin login error:", error);
    res.status(500).json({
      error: error.message || "Failed to create admin session",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined
    });
  }
}
