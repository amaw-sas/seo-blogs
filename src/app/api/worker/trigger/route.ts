import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get("x-api-key");

    if (!apiKey || apiKey !== process.env.WORKER_API_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { siteId } = body;

    if (!siteId) {
      return NextResponse.json({ error: "siteId is required" }, { status: 400 });
    }

    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, name: true, domain: true, active: true },
    });

    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    if (!site.active) {
      return NextResponse.json({ error: "Site is not active" }, { status: 400 });
    }

    // Log the trigger event
    const log = await prisma.publishLog.create({
      data: {
        siteId,
        eventType: "pipeline_trigger",
        status: "success",
        metadata: { triggeredAt: new Date().toISOString() },
      },
    });

    return NextResponse.json({
      message: "Pipeline triggered",
      site: { id: site.id, name: site.name, domain: site.domain },
      logId: log.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to trigger pipeline";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
