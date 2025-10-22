
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

    const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) throw listError;

    let adminUser = existingUsers.users.find(u => u.phone === adminPhone);

    if (!adminUser) {
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        phone: adminPhone,
        phone_confirm: true,
        user_metadata: {
          name: "Super Admin"
        }
      });

      if (createError) throw createError;
      adminUser = newUser.user;

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
        throw profileError;
      }
    } else {
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
          throw profileError;
        }
      } else if (profile.role !== "super_admin") {
        await supabaseAdmin
          .from("profiles")
          .update({ role: "super_admin", subscription_tier: "enterprise", trigger_limit: 999 })
          .eq("id", adminUser.id);
      }
    }

    const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.admin.createSession({
      user_id: adminUser.id
    });

    if (sessionError) throw sessionError;

    res.status(200).json({
      access_token: sessionData.access_token,
      refresh_token: sessionData.refresh_token,
      user: adminUser
    });
  } catch (error: any) {
    console.error("Dev admin login error:", error);
    res.status(500).json({ error: error.message || "Failed to create admin session" });
  }
}
