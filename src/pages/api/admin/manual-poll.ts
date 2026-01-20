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
    const result = await pollingService.evaluateTriggers("manual");
    
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error: any) {
    console.error("Manual poll failed:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal Server Error"
    });
  }
}