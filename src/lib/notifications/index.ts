/**
 * Unified notification dispatcher.
 * Routes notifications to email or Telegram and records them in the DB.
 */

import { prisma } from "../db/prisma";
import { sendEmail } from "./email";
import { sendTelegramMessage } from "./telegram";

type NotificationChannel = "email" | "telegram";

/**
 * Send a notification via the specified channel and record it in the database.
 * Creates a Notification record and marks as sent on success.
 */
export async function sendNotification(
  type: string,
  message: string,
  channel: NotificationChannel,
  siteId?: string,
): Promise<string> {
  // Create DB record first
  const notification = await prisma.notification.create({
    data: {
      siteId: siteId ?? null,
      type,
      message,
      channel,
      sent: false,
    },
  });

  try {
    switch (channel) {
      case "email": {
        const to = process.env.ADMIN_EMAIL ?? process.env.SMTP_USER;
        if (!to) {
          throw new Error("No recipient email configured (ADMIN_EMAIL or SMTP_USER)");
        }
        const subject = `[SEO Blogs] ${type}`;
        await sendEmail(to, subject, formatHtmlEmail(type, message));
        break;
      }
      case "telegram": {
        await sendTelegramMessage(formatTelegramMessage(type, message));
        break;
      }
      default: {
        throw new Error(`Unknown notification channel: ${channel}`);
      }
    }

    // Mark as sent
    await prisma.notification.update({
      where: { id: notification.id },
      data: { sent: true },
    });

    console.log(
      `[Notifications] Sent ${type} via ${channel} (id: ${notification.id})`,
    );

    return notification.id;
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : String(error);
    console.error(
      `[Notifications] Failed to send ${type} via ${channel}: ${errorMsg}`,
    );
    throw error;
  }
}

function formatHtmlEmail(type: string, message: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: #1a1a2e; color: white; padding: 16px 20px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0; font-size: 18px;">SEO Blogs Engine</h2>
        <p style="margin: 4px 0 0; opacity: 0.8; font-size: 13px;">${type}</p>
      </div>
      <div style="border: 1px solid #e5e7eb; border-top: none; padding: 20px; border-radius: 0 0 8px 8px;">
        ${message}
      </div>
      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 16px;">
        Enviado automáticamente por SEO Blogs Engine
      </p>
    </div>
  `.trim();
}

function formatTelegramMessage(type: string, message: string): string {
  // Strip HTML tags for Telegram plain text, keep Telegram-safe HTML
  const cleanMessage = message
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(div|p|h[1-6]|ul|ol|li|table|tr|td|th|thead|tbody)[^>]*>/gi, "\n")
    .replace(/<\/?(span|a|img)[^>]*>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return `<b>[SEO Blogs] ${type}</b>\n\n${cleanMessage}`;
}

export { sendEmail } from "./email";
export { sendTelegramMessage } from "./telegram";
