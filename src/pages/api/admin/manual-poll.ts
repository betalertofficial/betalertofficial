
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
      return res.status(401).json({ error: "Unauthorized - No auth header" });
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
      return res.status(401).json({ error: "Unauthorized - Invalid token", details: userError?.message });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return res.status(403).json({ error: "Access denied - No profile", details: profileError?.message });
    }

    if (profile.role !== "admin" && profile.role !== "super_admin") {
      return res.status(403).json({ error: "Admin access required" });
    }
    
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error("❌ SUPABASE_SERVICE_ROLE_KEY not found in environment");
      return res.status(500).json({ error: "Server configuration error" });
    }
    
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    console.log("Invoking evaluate-triggers Edge Function...");
    const { data, error } = await supabaseAdmin.functions.invoke(
      "evaluate-triggers",
      { body: {} }
    );

    if (error) {
      console.error("❌ Error invoking 'evaluate-triggers':", error);
      // IMPORTANT: Forward the DETAILED error from the function invocation
      return res.status(500).json({
        error: "Edge Function 'evaluate-triggers' failed.",
        details: error.message, // e.g., "Relay Error"
        context: error.context, // The original error from the Edge Function runtime
      });
    }

    console.log("✅ Edge Function response:", data);
    return res.status(200).json({
      success: true,
      checked: data?.checked || 0,
      hit: data?.hit || 0,
      message: data?.message || "Manual poll completed",
    });

  } catch (error: any) {
    console.error("❌❌❌ CRITICAL API ERROR in manual-poll:", error);
    return res.status(500).json({ 
      error: "Internal Server Error in /api/admin/manual-poll",
      details: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
}
