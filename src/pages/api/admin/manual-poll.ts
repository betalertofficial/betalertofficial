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

    console.log("🔍 Attempting to invoke Edge Function 'evaluate-triggers'...");
    console.log("📍 Supabase URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
    
    const { data, error } = await supabaseAdmin.functions.invoke(
      "evaluate-triggers",
      { body: {} }
    );

    // Log the FULL error object structure
    if (error) {
      console.error("❌ Edge Function invocation error:");
      console.error("  - error object:", JSON.stringify(error, null, 2));
      console.error("  - error.message:", error.message);
      console.error("  - error.context:", error.context);
      console.error("  - error keys:", Object.keys(error));
      
      return res.status(500).json({
        error: "Edge Function invocation failed",
        errorObject: error,
        errorMessage: error.message,
        errorContext: error.context,
        errorKeys: Object.keys(error),
      });
    }

    console.log("✅ Edge Function SUCCESS! Response:", JSON.stringify(data, null, 2));
    return res.status(200).json({
      success: true,
      checked: data?.checked || 0,
      hit: data?.hit || 0,
      message: data?.message || "Manual poll completed",
      rawData: data,
    });

  } catch (error: any) {
    console.error("❌❌❌ CRITICAL API ERROR in manual-poll:", error);
    console.error("  - Error name:", error.name);
    console.error("  - Error message:", error.message);
    console.error("  - Error stack:", error.stack);
    
    return res.status(500).json({ 
      error: "Internal Server Error in /api/admin/manual-poll",
      details: error.message,
      errorName: error.name,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
}
