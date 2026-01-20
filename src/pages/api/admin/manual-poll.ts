import type { NextApiRequest, NextApiResponse } from "next";
import { pollingService } from "@/services/pollingService";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    console.error("[Manual-Poll API] About to call pollingService.evaluateTriggers()...");
    const result = await pollingService.evaluateTriggers();
    console.error("[Manual-Poll API] Result received:", JSON.stringify(result, null, 2));
    
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error: any) {
    console.error("[Manual-Poll API] ERROR caught:", error);
    console.error("[Manual-Poll API] Error message:", error.message);
    console.error("[Manual-Poll API] Error stack:", error.stack);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal Server Error"
    });
  }
}