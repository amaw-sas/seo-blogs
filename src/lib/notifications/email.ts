/**
 * Email notification sender via SMTP.
 * Uses nodemailer with configuration from environment variables.
 */

import nodemailer from "nodemailer";

interface EmailConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

function getEmailConfig(): EmailConfig {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM ?? `SEO Blogs <${user}>`;

  if (!host || !user || !pass) {
    throw new Error(
      "Missing SMTP configuration. Set SMTP_HOST, SMTP_USER, SMTP_PASS env vars.",
    );
  }

  return { host, port, user, pass, from };
}

/**
 * Send an email via SMTP.
 */
export async function sendEmail(
  to: string,
  subject: string,
  htmlBody: string,
): Promise<void> {
  const config = getEmailConfig();

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  await transporter.sendMail({
    from: config.from,
    to,
    subject,
    html: htmlBody,
  });

  console.log(`[Email] Sent to ${to}: ${subject}`);
}
