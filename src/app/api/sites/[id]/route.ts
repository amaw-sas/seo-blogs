import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const site = await prisma.site.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            posts: true,
            keywords: true,
            clusters: true,
            tags: true,
            categories: true,
          },
        },
      },
    });

    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    // Never expose the actual password — only indicate if one is set
    const { apiPassword, ...rest } = site;
    return NextResponse.json({ ...rest, hasApiPassword: !!apiPassword });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch site";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    // Don't overwrite password with empty string
    const data = { ...body };
    if (!data.apiPassword) {
      delete data.apiPassword;
    }

    const site = await prisma.site.update({
      where: { id },
      data,
    });

    return NextResponse.json(site);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }
    const message = error instanceof Error ? error.message : "Failed to update site";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    await prisma.site.delete({ where: { id } });

    return NextResponse.json({ message: "Site deleted" });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }
    const message = error instanceof Error ? error.message : "Failed to delete site";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
