import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const regulation = await prisma.regulation.findUnique({
      where: { id },
      include: { site: { select: { name: true, domain: true } } },
    });

    if (!regulation) {
      return NextResponse.json({ error: "Regulation not found" }, { status: 404 });
    }

    return NextResponse.json(regulation);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch regulation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    const data: Record<string, unknown> = {};
    if (body.type !== undefined) data.type = body.type;
    if (body.data !== undefined) data.data = body.data;
    if (body.validFrom !== undefined) data.validFrom = new Date(body.validFrom);
    if (body.validUntil !== undefined) data.validUntil = body.validUntil ? new Date(body.validUntil) : null;
    if (body.sourceUrl !== undefined) data.sourceUrl = body.sourceUrl;
    if (body.autoMonitor !== undefined) data.autoMonitor = body.autoMonitor;

    const regulation = await prisma.regulation.update({
      where: { id },
      data,
    });

    return NextResponse.json(regulation);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Regulation not found" }, { status: 404 });
    }
    const message = error instanceof Error ? error.message : "Failed to update regulation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    await prisma.regulation.delete({ where: { id } });

    return NextResponse.json({ message: "Regulation deleted" });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Regulation not found" }, { status: 404 });
    }
    const message = error instanceof Error ? error.message : "Failed to delete regulation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
