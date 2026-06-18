// Telegram Bot API service for sending notifications
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API_BASE = "https://api.telegram.org";

export interface TelegramInlineKeyboard {
  inline_keyboard: { text: string; url: string }[][];
}

export interface TelegramMessage {
  chatId: string;
  text: string;
  parseMode?: "Markdown" | "HTML";
  // Optional inline keyboard (e.g. a "Bet on FanDuel" button linking to the book).
  replyMarkup?: TelegramInlineKeyboard;
}

/**
 * Build an inline keyboard with a single tappable button linking to the
 * sportsbook (deep bet-slip link / event page / home URL). On mobile these
 * universal links open the sportsbook app.
 */
export function buildBetButton(url: string, bookmaker: string): TelegramInlineKeyboard {
  const label = bookmaker ? `🎯 Bet on ${bookmaker}` : "🎯 Place bet";
  return { inline_keyboard: [[{ text: label, url }]] };
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
          ...(message.replyMarkup ? { reply_markup: message.replyMarkup } : {}),
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

// Format an alert message for Telegram.
// NOTE: the sportsbook link is delivered as an inline keyboard BUTTON (see
// buildBetButton + sendTelegramMessage.replyMarkup), not inline text.
export function formatTelegramAlert(alert: {
  game: string;
  market: string;
  detail: string;
  currentOdds: number;
  targetOdds: number;
  comparator?: string;
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

  message += '\n\nTime to place your bet! 🎯';

  return message;
}
