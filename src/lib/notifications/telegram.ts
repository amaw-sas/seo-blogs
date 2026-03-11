/**
 * Telegram notification sender via Bot API.
 * Supports HTML formatting.
 */

const TELEGRAM_API_BASE = "https://api.telegram.org";

interface TelegramConfig {
  botToken: string;
  chatId: string;
}

function getTelegramConfig(): TelegramConfig {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    throw new Error(
      "Missing Telegram configuration. Set TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID env vars.",
    );
  }

  return { botToken, chatId };
}

/**
 * Send a message via Telegram Bot API.
 * Supports HTML parse mode for formatting.
 */
export async function sendTelegramMessage(message: string): Promise<void> {
  const config = getTelegramConfig();

  const url = `${TELEGRAM_API_BASE}/bot${config.botToken}/sendMessage`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: config.chatId,
      text: message,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Telegram API error (${response.status}): ${body}`,
    );
  }

  console.log(`[Telegram] Message sent to chat ${config.chatId}`);
}
