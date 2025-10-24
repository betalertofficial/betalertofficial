
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Only allow in development
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ error: "Admin login is only available in development" });
  }

  try {
    const { phone } = req.body;

    // Check if this is the super admin phone number
    if (phone !== "+15555550001") {
      return res.status(403).json({ error: "Invalid admin credentials" });
    }

    // Return a mock session token for the super admin
    // This will be used to bypass auth on the frontend
    res.status(200).json({
      success: true,
      user: {
        id: "00000000-0000-0000-0000-000000000001",
        phone: "+15555550001",
        role: "super_admin"
      },
      bypass_token: "dev_super_admin_bypass"
    });
  } catch (error: any) {
    console.error("Admin login error:", error);
    res.status(500).json({ 
      error: error.message || "Failed to authenticate admin"
    });
  }
}
