import type { NextApiRequest, NextApiResponse } from "next";
import { pollingService } from "@/services/pollingService";

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
    const result = await pollingService.evaluateTriggers("cron");
    
    if (result.status === "skipped") {
      return res.status(200).json({ success: true, message: "Polling skipped (disabled)" });
    }

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