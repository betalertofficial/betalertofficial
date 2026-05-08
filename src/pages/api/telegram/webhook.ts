import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "@/integrations/supabase/client";

// Helper function to send Telegram messages
async function sendTelegramMessage(chatId: number, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error("TELEGRAM_BOT_TOKEN not set");
    return;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Telegram API error:", error);
    }
  } catch (error) {
    console.error("Error sending Telegram message:", error);
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const update = req.body;
    
    // Extract message data
    const message = update.message;
    if (!message) {
      return res.status(200).json({ ok: true });
    }

    const chatId = message.chat.id;
    const text = message.text;
    const username = message.from?.username;
    const firstName = message.from?.first_name || "User";

    console.log("Received message:", { chatId, text, username, firstName });

    // Handle /start command
    if (text === "/start" || text?.startsWith("/start ")) {
      // First check if profile exists with this telegram_chat_id
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("telegram_chat_id", chatId.toString())
        .maybeSingle();

      if (existingProfile) {
        // Update existing profile - type assertion needed due to Supabase's strict types
        await supabase
          .from("profiles")
          .update({
            id: existingProfile.id,
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

    // Default response for other messages
    await sendTelegramMessage(
      chatId,
      "Thanks for your message! Use /start to get started with Hammer Notifs."
    );

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Webhook handler error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}