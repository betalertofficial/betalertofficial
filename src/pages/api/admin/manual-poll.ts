
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  console.log("=== Manual Poll API Called ===");
  console.log("Method:", req.method);
  
  if (req.method !== "POST") {
    console.log("❌ Method not allowed:", req.method);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    console.log("Step 1: Checking authorization header");
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      console.log("❌ No authorization header");
      return res.status(401).json({ error: "Unauthorized - No auth header" });
    }
    console.log("✅ Auth header present");

    console.log("Step 2: Creating Supabase client");
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

    console.log("Step 3: Getting user from token");
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      console.error("❌ Error getting user:", userError);
      return res.status(401).json({ error: "Unauthorized - Invalid token", details: userError.message });
    }
    
    if (!user) {
      console.log("❌ No user found");
      return res.status(401).json({ error: "Unauthorized - No user" });
    }
    console.log("✅ User authenticated:", user.id);

    console.log("Step 4: Checking user profile and role");
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError) {
      console.error("❌ Error fetching profile:", profileError);
      return res.status(403).json({ error: "Access denied - Profile error", details: profileError.message });
    }
    
    if (!profile) {
      console.log("❌ No profile found");
      return res.status(403).json({ error: "Access denied - No profile" });
    }
    
    console.log("✅ User role:", profile.role);

    if (profile.role !== "admin" && profile.role !== "super_admin") {
      console.log("❌ User is not admin:", profile.role);
      return res.status(403).json({ error: "Admin access required" });
    }

    console.log("Step 5: Creating admin Supabase client");
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error("❌ SUPABASE_SERVICE_ROLE_KEY not found in environment");
      return res.status(500).json({ error: "Server configuration error - Missing service role key" });
    }
    
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    console.log("✅ Admin client created");

    console.log("Step 6: Invoking evaluate-triggers Edge Function");
    const { data, error } = await supabaseAdmin.functions.invoke(
      "evaluate-triggers",
      {
        body: {},
      }
    );

    if (error) {
      console.error("❌ Error invoking evaluate-triggers:");
      console.error("Error object:", JSON.stringify(error, null, 2));
      return res.status(500).json({ 
        error: "Failed to run manual poll",
        details: error.message || "Unknown error from Edge Function",
        errorContext: error.context || "No context available"
      });
    }

    console.log("✅ Edge Function response:");
    console.log(JSON.stringify(data, null, 2));

    return res.status(200).json({
      success: true,
      checked: data?.checked || 0,
      hit: data?.hit || 0,
      message: data?.message || "Manual poll completed",
      totalApiCalls: data?.totalApiCalls,
      oddsSnapshotsCreated: data?.oddsSnapshotsCreated
    });
  } catch (error: any) {
    console.error("❌❌❌ Manual poll CRITICAL error:");
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    console.error("Error object:", JSON.stringify(error, null, 2));
    return res.status(500).json({ 
      error: "Internal server error",
      details: error.message || "Unknown error",
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined
    });
  }
}
