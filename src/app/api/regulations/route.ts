import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const siteId = searchParams.get("siteId");
    const type = searchParams.get("type");

    const where: Prisma.RegulationWhereInput = {};
    if (siteId) where.siteId = siteId;
    if (type) where.type = type;

    const regulations = await prisma.regulation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { site: { select: { name: true, domain: true } } },
    });

    return NextResponse.json({ data: regulations });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch regulations";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { siteId, type, data, validFrom, validUntil, sourceUrl, autoMonitor } = body;

    if (!siteId || !type || !data || !validFrom) {
      return NextResponse.json(
        { error: "Missing required fields: siteId, type, data, validFrom" },
        { status: 400 },
      );
    }

    const regulation = await prisma.regulation.create({
      data: {
        siteId,
        type,
        data,
        validFrom: new Date(validFrom),
        validUntil: validUntil ? new Date(validUntil) : null,
        sourceUrl: sourceUrl ?? null,
        autoMonitor: autoMonitor ?? false,
      },
    });

    return NextResponse.json(regulation, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }
    const message = error instanceof Error ? error.message : "Failed to create regulation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
