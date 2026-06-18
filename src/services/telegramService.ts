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

// Build the live score line shown beneath the alert, mirroring the dashboard:
// "📊 {awayTeam} {awayScore} – {homeTeam} {homeScore} · {detail}".
// Returns null when there's no usable live score so the caller can omit it.
function formatEspnLiveLine(espnData?: {
  homeTeam?: string;
  awayTeam?: string;
  homeScore?: number;
  awayScore?: number;
  period?: number;
  detail?: string;
  state?: string;
}): string | null {
  if (!espnData) return null;

  const { homeTeam, awayTeam, homeScore, awayScore, detail } = espnData;

  // Require both scores to render the score line; otherwise there's nothing
  // dashboard-like to show.
  if (homeScore === undefined || awayScore === undefined) return null;

  const away = awayTeam ? `${awayTeam} ${awayScore}` : `${awayScore}`;
  const home = homeTeam ? `${homeTeam} ${homeScore}` : `${homeScore}`;

  let line = `📊 ${away} – ${home}`;
  if (detail) {
    line += ` · ${detail}`;
  }
  return line;
}

// Format an alert message for Telegram
export function formatTelegramAlert(alert: {
  game: string;
  market: string;
  detail: string;
  currentOdds: number;
  targetOdds: number;
  comparator?: string;
  // Resolved sportsbook URL for the matched book (preferred: direct bet-slip
  // deep link; falls back to the event page, then the book's home URL). When
  // present, a tappable "Bet on {detail}" link is added to the message. The
  // caller (alertService) resolves this; we just render it if truthy.
  betLink?: string;
  // Live ESPN score, mirroring the dashboard. Fields match the ESPNScore shape
  // returned by espnService.findGameScore (camelCase).
  espnData?: {
    homeTeam?: string;
    awayTeam?: string;
    homeScore?: number;
    awayScore?: number;
    period?: number;
    detail?: string;
    state?: string;
  };
}): string {
  const direction = alert.comparator ? oddsDirection(alert.comparator) : "";
  let message = `🚨 *Betting Alert!*

*Game:* ${alert.game}
*Market:* ${alert.market}
*Detail:* ${alert.detail}

*Target Odds:* ${alert.targetOdds}${direction}
*Current Odds:* ${alert.currentOdds}`;

  // Add a single live line mirroring the dashboard, e.g.
  // "📊 Yankees 3 – Red Sox 2 · Top 7th". Only rendered when we actually have
  // a live score; missing pieces are omitted so we never print "undefined".
  const liveLine = formatEspnLiveLine(alert.espnData);
  if (liveLine) {
    message += `\n\n${liveLine}`;
  }

  // Tappable sportsbook link for the matched book. parse_mode is Markdown, so
  // render an inline Markdown link. Only added when a URL was resolved, so we
  // never print "undefined".
  if (alert.betLink) {
    message += `\n\n👉 [Bet on ${alert.detail}](${alert.betLink})`;
  }

  message += '\n\nTime to place your bet! 🎯';

  return message;
}