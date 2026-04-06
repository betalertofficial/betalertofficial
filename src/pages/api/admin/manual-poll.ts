import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { pollingService } from "@/services/pollingService";

// Use local API key
const ODDS_API_KEY = "8fd23ab732557e3db9238fc571eddbbe";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Get auth token from request
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const token = authHeader.replace("Bearer ", "");

    // Create Supabase client with user's token
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }
    );

    // Verify admin access
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || (profile.role !== "admin" && profile.role !== "super_admin")) {
      return res.status(403).json({ error: "Forbidden: Admin access required" });
    }

    console.log("=== Starting Manual Poll ===");

    // Create Supabase ADMIN client for the polling operation to bypass RLS
    // The user has already been verified as admin using their token above
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!, 
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Use the shared polling service with the same logic as cron
    const result = await pollingService.evaluateTriggers(
      supabaseAdmin,
      ODDS_API_KEY,
      true // skipPollingCheck for manual
    );

    // If polling is disabled (should not happen with skipPollingCheck=true but handling anyway)
    if (result.data && result.data.triggersEvaluated === 0 && result.success && !result.data.matchesFound) {
        // If we get here with success but 0 evaluated, it might mean no triggers found OR polling disabled check logic
        // But we passed true for skipPollingCheck.
    }

    const stats = result.data || {
        triggersEvaluated: 0,
        matchesFound: 0,
        alertsSent: 0,
        durationMs: 0
    };

    console.log("=== Manual Poll Complete ===");
    console.log(`Checked: ${stats.triggersEvaluated}, Hit: ${stats.matchesFound}`);

    return res.status(200).json({
      success: result.success,
      checked: stats.triggersEvaluated,
      hit: stats.matchesFound,
      matches: stats.matchesFound,
      alerts: stats.alertsSent,
      message: result.error || "Manual poll completed successfully",
      debug: stats.debug // Include debug information
    });

  } catch (error: any) {
    console.error("Manual poll error:", error);
    return res.status(500).json({ 
      error: "Internal Server Error",
      details: error.message,
    });
  }
}