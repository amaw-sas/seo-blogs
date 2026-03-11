import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { HolidayType } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const country = searchParams.get("country");
    const type = searchParams.get("type") as HolidayType | null;

    const where: { country?: string; type?: HolidayType } = {};
    if (country) where.country = country;
    if (type) where.type = type;

    const holidays = await prisma.holiday.findMany({
      where,
      orderBy: { date: "asc" },
      include: { siteHolidays: { select: { siteId: true, daysInAdvance: true } } },
    });

    return NextResponse.json({ data: holidays });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch holidays";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { date, name, country, type } = body;

    if (!date || !name) {
      return NextResponse.json(
        { error: "Missing required fields: date, name" },
        { status: 400 },
      );
    }

    const holiday = await prisma.holiday.create({
      data: {
        date: new Date(date),
        name,
        country: country ?? "CO",
        type: type ?? "national",
      },
    });

    return NextResponse.json(holiday, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create holiday";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
