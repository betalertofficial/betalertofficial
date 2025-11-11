import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (profile.role !== "admin" && profile.role !== "super_admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data, error } = await supabaseAdmin.functions.invoke(
      "evaluate-triggers",
      {
        body: {},
      }
    );

    if (error) {
      console.error("Error invoking evaluate-triggers:", error);
      return res.status(500).json({ 
        error: "Failed to run manual poll",
        details: error.message 
      });
    }

    return res.status(200).json({
      success: true,
      checked: data?.checked || 0,
      hit: data?.hit || 0,
      message: data?.message || "Manual poll completed"
    });
  } catch (error: any) {
    console.error("Manual poll error:", error);
    return res.status(500).json({ 
      error: "Internal server error",
      details: error.message 
    });
  }
}
