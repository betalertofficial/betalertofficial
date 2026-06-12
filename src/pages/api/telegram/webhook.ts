import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

/**
 * Public Telegram webhook.
 *
 * Security:
 *  - When TELEGRAM_WEBHOOK_SECRET is set (and registered via
 *    /api/telegram/set-webhook), every incoming update must carry the matching
 *    X-Telegram-Bot-Api-Secret-Token header, or it is rejected. This stops
 *    anyone from POSTing forged "Telegram" updates to spoof identities.
 *  - Profile writes use the SERVER-SIDE service-role client, never the public
 *    anon client.
 */
function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function sendTelegramMessage(chatId: number, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error("TELEGRAM_BOT_TOKEN not set");
    return;
  }
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    });
    if (!response.ok) {
      console.error("Telegram API error:", response.status);
    }
  } catch {
    console.error("Error sending Telegram message");
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Verify the request truly comes from Telegram (when a secret is configured).
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expectedSecret) {
    const provided = req.headers["x-telegram-bot-api-secret-token"];
    if (provided !== expectedSecret) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  try {
    const update = req.body;
    const message = update?.message;
    if (!message) {
      return res.status(200).json({ ok: true });
    }

    const chatId = message.chat.id;
    const text: string | undefined = message.text;
    const username = message.from?.username;
    const firstName = message.from?.first_name || "User";

    const supabase = getAdminClient();

    if (text === "/start" || text?.startsWith("/start ")) {
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("telegram_chat_id", chatId.toString())
        .maybeSingle();

      if (existingProfile) {
        await supabase
          .from("profiles")
          .update({
            telegram_username: username || null,
            telegram_first_name: firstName,
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", existingProfile.id);
      } else {
        const tempId = `telegram_${chatId}`;
        await supabase
          .from("profiles")
          .insert({
            id: tempId,
            telegram_chat_id: chatId.toString(),
            telegram_username: username || null,
            telegram_first_name: firstName,
          } as any);
      }

      const welcomeMessage = `🎯 *Welcome to Hammer Notifs!*\n\nI'll send you instant notifications when your betting triggers hit.\n\n*How it works:*\n• Set up triggers in the dashboard\n• Get alerted when odds match your criteria\n• Never miss a betting opportunity\n\nTo access your dashboard, tap the menu button below.`;
      await sendTelegramMessage(chatId, welcomeMessage);
      return res.status(200).json({ ok: true });
    }

    await sendTelegramMessage(
      chatId,
      "Thanks for your message! Use /start to get started with Hammer Notifs."
    );
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Webhook handler error");
    return res.status(500).json({ error: "Internal server error" });
  }
}
