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

function oddsDirection(comparator: string): string {
  if (comparator === ">=" || comparator === ">") return " or higher";
  if (comparator === "<=" || comparator === "<") return " or lower";
  return "";
}

// Format an alert message for Telegram
export function formatTelegramAlert(alert: {
  game: string;
  market: string;
  detail: string;
  currentOdds: number;
  targetOdds: number;
  comparator?: string;
  espnData?: {
    home_score?: number;
    away_score?: number;
    period?: number;
    detail?: string;
    status?: string;
  };
}): string {
  const direction = alert.comparator ? oddsDirection(alert.comparator) : "";
  let message = `🚨 *Betting Alert!*

*Game:* ${alert.game}
*Market:* ${alert.market}
*Detail:* ${alert.detail}

*Target Odds:* ${alert.targetOdds}${direction}
*Current Odds:* ${alert.currentOdds}`;

  // Add ESPN live game data if available
  if (alert.espnData) {
    const { home_score, away_score, period, detail, status } = alert.espnData;
    
    message += '\n\n*Live Game Info:*';
    
    if (home_score !== undefined && away_score !== undefined) {
      message += `\n📊 Score: ${away_score} - ${home_score}`;
    }
    
    if (period !== undefined && period > 0) {
      message += `\n⏱️ Period: ${period}`;
    }
    
    if (detail) {
      message += `\n🎮 Status: ${detail}`;
    }
    
    if (status) {
      message += `\n⚡ Game: ${status}`;
    }
  }

  message += '\n\nTime to place your bet! 🎯';
  
  return message;
}