import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const site = await prisma.site.findUnique({ where: { id }, select: { id: true } });
    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    const siteHolidays = await prisma.siteHoliday.findMany({
      where: { siteId: id },
      include: { holiday: true },
    });

    return NextResponse.json({ data: siteHolidays });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch site holidays";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const { holidayId, daysInAdvance } = body;

    if (!holidayId) {
      return NextResponse.json(
        { error: "Missing required field: holidayId" },
        { status: 400 },
      );
    }

    const siteHoliday = await prisma.siteHoliday.create({
      data: {
        siteId: id,
        holidayId,
        daysInAdvance: daysInAdvance ?? 15,
      },
      include: { holiday: true },
    });

    return NextResponse.json(siteHoliday, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return NextResponse.json(
          { error: "This holiday is already activated for this site" },
          { status: 409 },
        );
      }
      if (error.code === "P2003") {
        return NextResponse.json(
          { error: "Site or holiday not found" },
          { status: 404 },
        );
      }
    }
    const message = error instanceof Error ? error.message : "Failed to activate holiday";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const { holidayId } = body;

    if (!holidayId) {
      return NextResponse.json(
        { error: "Missing required field: holidayId" },
        { status: 400 },
      );
    }

    await prisma.siteHoliday.delete({
      where: {
        siteId_holidayId: { siteId: id, holidayId },
      },
    });

    return NextResponse.json({ message: "Holiday deactivated for site" });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json(
        { error: "Holiday not activated for this site" },
        { status: 404 },
      );
    }
    const message = error instanceof Error ? error.message : "Failed to deactivate holiday";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
