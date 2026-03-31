import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: NextRequest) {
  try {
    const siteId = request.nextUrl.searchParams.get("siteId");

    const steps = await prisma.pipelineStep.findMany({
      orderBy: { order: "asc" },
      ...(siteId
        ? { include: { overrides: { where: { siteId } } } }
        : {}),
    });

    return NextResponse.json({ data: steps });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch pipeline steps";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
