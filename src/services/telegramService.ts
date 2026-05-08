// Telegram Bot API service for sending notifications
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API_BASE = "https://api.telegram.org";

export interface TelegramMessage {
  chatId: string;
  text: string;
  parseMode?: "Markdown" | "HTML";
}

// Send a message via Telegram Bot API
export async function sendTelegramMessage(
  message: TelegramMessage
): Promise<{ success: boolean; error?: string }> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error("TELEGRAM_BOT_TOKEN not configured");
    return { success: false, error: "Bot token not configured" };
  }

  try {
    const response = await fetch(
      `${TELEGRAM_API_BASE}/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: message.chatId,
          text: message.text,
          parse_mode: message.parseMode || "Markdown",
        }),
      }
    );

    const data = await response.json();

    if (!data.ok) {
      console.error("Telegram API error:", data);
      return { success: false, error: data.description || "Unknown error" };
    }

    return { success: true };
  } catch (error) {
    console.error("Failed to send Telegram message:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Format an alert message for Telegram
export function formatTelegramAlert(alert: {
  game: string;
  market: string;
  detail: string;
  currentOdds: number;
  targetOdds: number;
}): string {
  return `🚨 *Betting Alert!*

*Game:* ${alert.game}
*Market:* ${alert.market}
*Detail:* ${alert.detail}

*Target Odds:* ${alert.targetOdds}
*Current Odds:* ${alert.currentOdds}

Time to place your bet! 🎯`;
}