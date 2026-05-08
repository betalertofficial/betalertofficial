import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "@/integrations/supabase/client";

// Telegram Update types
interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      is_bot: boolean;
      first_name: string;
      last_name?: string;
      username?: string;
    };
    chat: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
      type: string;
    };
    date: number;
    text?: string;
  };
}

// Send message via Telegram Bot API
async function sendTelegramMessage(chatId: number, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error("TELEGRAM_BOT_TOKEN not set");
    return false;
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
      }),
    });

    const data = await response.json();
    if (!data.ok) {
      console.error("Telegram API error:", data);
      return false;
    }
    return true;
  } catch (error) {
    console.error("Failed to send Telegram message:", error);
    return false;
  }
}

// Handle /start command
async function handleStartCommand(
  chatId: number,
  username?: string,
  firstName?: string
): Promise<void> {
  // Upsert profile with telegram_chat_id
  const { error } = await supabase
    .from("profiles")
    .upsert(
      {
        telegram_chat_id: chatId.toString(),
        telegram_username: username,
        telegram_first_name: firstName,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "telegram_chat_id",
      }
    );

  if (error) {
    console.error("Failed to create/update profile:", error);
    await sendTelegramMessage(
      chatId,
      "Sorry, something went wrong. Please try again later."
    );
    return;
  }

  // Send welcome message
  const welcomeMessage = `🎯 *Welcome to Hammer Notifs!*

I'll send you instant notifications when your betting triggers hit.

*How it works:*
• Set up triggers in the dashboard
• Get alerted when odds match your criteria
• Never miss a betting opportunity

To access your dashboard, tap the menu button below.`;

  await sendTelegramMessage(chatId, welcomeMessage);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  // Only accept POST requests
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const update: TelegramUpdate = req.body;
    console.log("Telegram webhook received:", JSON.stringify(update, null, 2));

    // Extract message data
    const message = update.message;
    if (!message || !message.text) {
      res.status(200).json({ ok: true });
      return;
    }

    const chatId = message.chat.id;
    const text = message.text.trim();
    const username = message.from.username;
    const firstName = message.from.first_name;

    // Handle /start command
    if (text === "/start" || text.startsWith("/start ")) {
      // First check if profile exists with this telegram_chat_id
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("telegram_chat_id", chatId.toString())
        .maybeSingle();

      if (existingProfile) {
        // Update existing profile
        await supabase
          .from("profiles")
          .update({
            telegram_username: username || null,
            telegram_first_name: firstName,
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", existingProfile.id);
      } else {
        // Create new profile - will be linked to auth user when they open web app
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

      // Send welcome message
      const welcomeMessage = `🎯 *Welcome to Hammer Notifs!*

I'll send you instant notifications when your betting triggers hit.

*How it works:*
• Set up triggers in the dashboard
• Get alerted when odds match your criteria
• Never miss a betting opportunity

To access your dashboard, tap the menu button below.`;

      await sendTelegramMessage(chatId, welcomeMessage);
      res.status(200).json({ ok: true });
      return;
    }

    // Unknown command
    await sendTelegramMessage(
      chatId,
      "Unknown command. Send /start to begin."
    );
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Webhook handler error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}