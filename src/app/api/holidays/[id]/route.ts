import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const holiday = await prisma.holiday.findUnique({
      where: { id },
      include: { siteHolidays: { select: { siteId: true, daysInAdvance: true } } },
    });

    if (!holiday) {
      return NextResponse.json({ error: "Holiday not found" }, { status: 404 });
    }

    return NextResponse.json(holiday);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch holiday";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    const data: Record<string, unknown> = {};
    if (body.date !== undefined) data.date = new Date(body.date);
    if (body.name !== undefined) data.name = body.name;
    if (body.country !== undefined) data.country = body.country;
    if (body.type !== undefined) data.type = body.type;

    const holiday = await prisma.holiday.update({
      where: { id },
      data,
    });

    return NextResponse.json(holiday);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Holiday not found" }, { status: 404 });
    }
    const message = error instanceof Error ? error.message : "Failed to update holiday";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    await prisma.holiday.delete({ where: { id } });

    return NextResponse.json({ message: "Holiday deleted" });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Holiday not found" }, { status: 404 });
    }
    const message = error instanceof Error ? error.message : "Failed to delete holiday";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
