import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const keyword = await prisma.keyword.findUnique({
      where: { id },
      include: {
        site: { select: { name: true, domain: true } },
        parent: { select: { id: true, phrase: true } },
        children: { select: { id: true, phrase: true, status: true } },
      },
    });

    if (!keyword) {
      return NextResponse.json({ error: "Keyword not found" }, { status: 404 });
    }

    return NextResponse.json(keyword);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch keyword";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    const keyword = await prisma.keyword.update({
      where: { id },
      data: {
        ...(body.status !== undefined && { status: body.status }),
        ...(body.priority !== undefined && { priority: body.priority }),
        ...(body.phrase !== undefined && { phrase: body.phrase }),
        ...(body.skipReason !== undefined && { skipReason: body.skipReason }),
        ...(body.trendScore !== undefined && { trendScore: body.trendScore }),
        ...(body.parentId !== undefined && { parentId: body.parentId }),
      },
    });

    return NextResponse.json(keyword);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Keyword not found" }, { status: 404 });
    }
    const message = error instanceof Error ? error.message : "Failed to update keyword";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    await prisma.keyword.delete({ where: { id } });

    return NextResponse.json({ message: "Keyword deleted" });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Keyword not found" }, { status: 404 });
    }
    const message = error instanceof Error ? error.message : "Failed to delete keyword";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
