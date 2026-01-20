import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { Database } from "@/integrations/supabase/types";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  console.error("=== MANUAL POLL STARTED ===");
  console.error("ENV CHECK:");
  console.error("- NEXT_PUBLIC_SUPABASE_URL:", process.env.NEXT_PUBLIC_SUPABASE_URL ? "EXISTS" : "MISSING");
  console.error("- SUPABASE_SERVICE_ROLE_KEY:", process.env.SUPABASE_SERVICE_ROLE_KEY ? "EXISTS (length: " + process.env.SUPABASE_SERVICE_ROLE_KEY.length + ")" : "MISSING");

  try {
    // Create Supabase client with service role
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("ERROR: Missing credentials");
      return res.status(500).json({
        success: false,
        error: "Missing Supabase credentials",
        debug: {
          hasUrl: !!supabaseUrl,
          hasKey: !!serviceRoleKey
        }
      });
    }

    console.error("Creating Supabase client...");
    const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    console.error("Supabase client created successfully");

    // Query triggers directly
    console.error("Querying triggers table...");
    const { data: triggers, error: triggerError } = await supabase
      .from("triggers")
      .select("*");

    console.error("Query result:");
    console.error("- Error:", triggerError ? triggerError.message : "none");
    console.error("- Data:", triggers ? `${triggers.length} records` : "null");

    if (triggerError) {
      console.error("Database error:", triggerError);
      return res.status(500).json({
        success: false,
        error: triggerError.message,
        debug: {
          code: triggerError.code,
          details: triggerError.details,
          hint: triggerError.hint
        }
      });
    }

    // Log first few triggers for inspection
    if (triggers && triggers.length > 0) {
      console.error("Sample triggers (first 3):");
      triggers.slice(0, 3).forEach(t => {
        console.error(`  - ID: ${t.id}, Status: "${t.status}", Team: ${t.team_or_player}`);
      });
    }

    // Filter for active triggers (case-insensitive)
    const activeTriggers = triggers?.filter(t => 
      t.status?.toLowerCase() === "active"
    ) || [];

    console.error(`Active triggers found: ${activeTriggers.length}`);

    return res.status(200).json({
      success: true,
      data: {
        totalTriggers: triggers?.length || 0,
        activeTriggers: activeTriggers.length,
        sampleStatuses: triggers?.slice(0, 5).map(t => t.status) || []
      }
    });

  } catch (error: any) {
    console.error("EXCEPTION:", error.message);
    console.error("Stack:", error.stack);
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
}