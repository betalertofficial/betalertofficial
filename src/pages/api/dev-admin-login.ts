
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

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

    const adminPhone = "+15555550001";
    const adminEmail = "admin@betalert.dev";

    // List all users to find existing admin
    const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) {
      console.error("Error listing users:", listError);
      throw listError;
    }

    let adminUser = existingUsers.users.find(u => u.email === adminEmail);

    if (!adminUser) {
      // Create new admin user with email (more reliable than phone for dev)
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: adminEmail,
        email_confirm: true,
        phone: adminPhone,
        phone_confirm: true,
        user_metadata: {
          name: "Super Admin"
        }
      });

      if (createError) {
        console.error("Error creating user:", createError);
        throw createError;
      }
      
      adminUser = newUser.user;

      // Create profile
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .insert([
          {
            id: adminUser.id,
            phone_e164: adminPhone,
            country_code: "US",
            role: "super_admin",
            subscription_tier: "enterprise",
            trigger_limit: 999,
            name: "Super Admin"
          }
        ]);

      if (profileError && profileError.code !== "23505") {
        console.error("Error creating profile:", profileError);
        throw profileError;
      }
    } else {
      // Ensure profile exists and is super_admin
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("*")
        .eq("id", adminUser.id)
        .single();

      if (!profile) {
        const { error: profileError } = await supabaseAdmin
          .from("profiles")
          .insert([
            {
              id: adminUser.id,
              phone_e164: adminPhone,
              country_code: "US",
              role: "super_admin",
              subscription_tier: "enterprise",
              trigger_limit: 999,
              name: "Super Admin"
            }
          ]);

        if (profileError && profileError.code !== "23505") {
          console.error("Error creating profile:", profileError);
          throw profileError;
        }
      } else if (profile.role !== "super_admin") {
        await supabaseAdmin
          .from("profiles")
          .update({ 
            role: "super_admin", 
            subscription_tier: "enterprise", 
            trigger_limit: 999 
          })
          .eq("id", adminUser.id);
      }
    }

    // Generate a real access token using the signInWithPassword method
    // Since we don't have a password, we'll use the admin API to generate tokens
    const { data: tokenData, error: tokenError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: adminEmail,
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/`
      }
    });

    if (tokenError) {
      console.error("Error generating token:", tokenError);
      throw tokenError;
    }

    // Extract the token from the magic link
    const urlParams = new URL(tokenData.properties.action_link).searchParams;
    const token = urlParams.get("token");
    const type = urlParams.get("type") as "magiclink";

    if (!token) {
      throw new Error("Failed to extract token from magic link");
    }

    // Verify the token and get a session
    const { data: sessionData, error: verifyError } = await supabaseAdmin.auth.verifyOtp({
      token_hash: token,
      type: type
    });

    if (verifyError) {
      console.error("Error verifying OTP:", verifyError);
      throw verifyError;
    }

    if (!sessionData.session) {
      throw new Error("No session returned from verification");
    }

    res.status(200).json({
      access_token: sessionData.session.access_token,
      refresh_token: sessionData.session.refresh_token,
      expires_in: sessionData.session.expires_in,
      token_type: "bearer",
      user: sessionData.user
    });
  } catch (error: any) {
    console.error("Dev admin login error:", error);
    res.status(500).json({ 
      error: error.message || "Failed to create admin session",
      details: error
    });
  }
}
