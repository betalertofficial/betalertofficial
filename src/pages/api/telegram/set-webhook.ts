import type { NextApiRequest, NextApiResponse } from "next";

// Helper endpoint to register webhook with Telegram
// Call this once to set up the webhook URL
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    res.status(500).json({ error: "TELEGRAM_BOT_TOKEN not set" });
    return;
  }

  // Get webhook URL from request or environment
  const webhookUrl =
    req.body.url || `${process.env.NEXT_PUBLIC_SITE_URL}/api/telegram/webhook`;

  try {
    // Register webhook with Telegram
    const response = await fetch(
      `https://api.telegram.org/bot${token}/setWebhook`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: webhookUrl,
          allowed_updates: ["message"],
        }),
      }
    );

    const data = await response.json();

    if (!data.ok) {
      console.error("Failed to set webhook:", data);
      res.status(500).json({ error: "Failed to set webhook", details: data });
      return;
    }

    console.log("Webhook registered:", webhookUrl);
    res.status(200).json({ success: true, url: webhookUrl, response: data });
  } catch (error) {
    console.error("Error setting webhook:", error);
    res.status(500).json({ error: "Failed to set webhook" });
  }
}