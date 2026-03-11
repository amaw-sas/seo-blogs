import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { sendNotification } from "@/lib/notifications";

/**
 * GET /api/notifications
 * List notifications with optional filters.
 * Query params: type, channel, sent, siteId, page, limit
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const type = searchParams.get("type");
    const channel = searchParams.get("channel");
    const sent = searchParams.get("sent");
    const siteId = searchParams.get("siteId");
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const limit = Math.min(
      100,
      Math.max(1, Number(searchParams.get("limit")) || 20),
    );
    const skip = (page - 1) * limit;

    const where: {
      type?: string;
      channel?: string;
      sent?: boolean;
      siteId?: string;
    } = {};

    if (type) where.type = type;
    if (channel) where.channel = channel;
    if (sent !== null && sent !== undefined && sent !== "") {
      where.sent = sent === "true";
    }
    if (siteId) where.siteId = siteId;

    const [data, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          site: { select: { name: true, domain: true } },
        },
      }),
      prisma.notification.count({ where }),
    ]);

    return NextResponse.json({ data, total, page, limit });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch notifications";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/notifications
 * Send a test notification.
 * Body: { type?: string, message?: string, channel: "email" | "telegram" }
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      type?: string;
      message?: string;
      channel: "email" | "telegram";
    };

    if (!body.channel) {
      return NextResponse.json(
        { error: "Missing required field: channel" },
        { status: 400 },
      );
    }

    const type = body.type ?? "test";
    const message =
      body.message ?? "Esta es una notificación de prueba desde SEO Blogs Engine.";

    const notificationId = await sendNotification(type, message, body.channel);

    return NextResponse.json({
      message: "Notification sent successfully",
      notificationId,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to send notification";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
