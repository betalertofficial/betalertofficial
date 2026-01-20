import type { NextApiRequest, NextApiResponse } from "next";
import { pollingService } from "@/services/pollingService";
import { createClient } from "@supabase/supabase-js";
import { Database } from "@/integrations/supabase/types";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Verify Cron Secret (optional but recommended)
  // const authHeader = req.headers.authorization;
  // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  //   return res.status(401).json({ success: false, message: 'Unauthorized' });
  // }

  try {
    // Check if polling is enabled before running
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return res.status(500).json({ 
        success: false, 
        error: "Missing Supabase credentials" 
      });
    }

    const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);
    const isEnabled = await pollingService.isPollingEnabled(supabase);
    
    if (!isEnabled) {
      console.log("[Cron] Polling is disabled in admin settings. Skipping.");
      return res.status(200).json({ 
        success: true, 
        message: "Polling skipped (disabled in admin settings)" 
      });
    }

    const result = await pollingService.evaluateTriggers();
    
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error: any) {
    console.error("Cron poll failed:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal Server Error"
    });
  }
}