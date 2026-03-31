import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

type RouteContext = { params: Promise<{ stepKey: string }> };

const STEP_TO_EVENT_TYPES: Record<string, string[]> = {
  keyword_selection: ["keyword_selection"],
  outline_generation: ["outline_generation"],
  content_generation: ["content_generation"],
  image_generation: ["image_generation"],
  seo_optimization: ["seo_optimization"],
  internal_linking: ["internal_linking"],
  publishing: ["wordpress_publish", "nuxt_publish"],
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { stepKey } = await context.params;
    const siteId = request.nextUrl.searchParams.get("siteId");

    const eventTypes = STEP_TO_EVENT_TYPES[stepKey] ?? [stepKey];

    const log = await prisma.publishLog.findFirst({
      where: {
        eventType: { in: eventTypes },
        ...(siteId ? { siteId } : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: log });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch last result";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
