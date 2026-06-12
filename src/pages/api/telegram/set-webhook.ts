import type { NextApiRequest, NextApiResponse } from "next";

/**
 * One-time helper to register the Telegram webhook.
 *
 * Protected with CRON_SECRET so a random visitor can't repoint your bot's
 * webhook. Call it once (e.g. with curl) after deploy:
 *
 *   curl -X POST https://<your-domain>/api/telegram/set-webhook \
 *     -H "Authorization: Bearer $CRON_SECRET"
 *
 * If TELEGRAM_WEBHOOK_SECRET is set, it is registered with Telegram so that the
 * receiving webhook (/api/telegram/webhook) can verify incoming updates.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    res.status(500).json({ error: "TELEGRAM_BOT_TOKEN not set" });
    return;
  }

  const webhookUrl = req.body?.url || `${process.env.NEXT_PUBLIC_SITE_URL}/api/telegram/webhook`;
  const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ["message"],
        ...(secretToken ? { secret_token: secretToken } : {}),
      }),
    });

    const data = await response.json();
    if (!data.ok) {
      console.error("Failed to set webhook:", data.description);
      res.status(500).json({ error: "Failed to set webhook" });
      return;
    }

    res.status(200).json({ success: true, url: webhookUrl, secured: !!secretToken });
  } catch (error) {
    console.error("Error setting webhook");
    res.status(500).json({ error: "Failed to set webhook" });
  }
}
