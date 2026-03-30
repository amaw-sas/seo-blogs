import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { KeywordStatus, Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const siteId = searchParams.get("siteId");
    const status = searchParams.get("status") as KeywordStatus | null;
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit")) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.KeywordWhereInput = {};
    if (siteId) where.siteId = siteId;
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      prisma.keyword.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
        include: { site: { select: { name: true, domain: true } } },
      }),
      prisma.keyword.count({ where }),
    ]);

    return NextResponse.json({ data, total, page, limit });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch keywords";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Support bulk creation via array
    if (Array.isArray(body)) {
      if (body.length === 0) {
        return NextResponse.json({ error: "Empty array" }, { status: 400 });
      }

      for (const item of body) {
        if (!item.siteId || !item.phrase) {
          return NextResponse.json(
            { error: "Each keyword requires siteId and phrase" },
            { status: 400 },
          );
        }
      }

      const result = await prisma.keyword.createMany({
        data: body.map((item: { siteId: string; phrase: string; priority?: number; status?: KeywordStatus }) => ({
          siteId: item.siteId,
          phrase: item.phrase,
          priority: item.priority ?? 0,
          status: item.status ?? "pending",
        })),
        skipDuplicates: true,
      });

      return NextResponse.json({ created: result.count }, { status: 201 });
    }

    // Single creation
    const { siteId, phrase, priority, status, parentId } = body;

    if (!siteId || !phrase) {
      return NextResponse.json(
        { error: "Missing required fields: siteId, phrase" },
        { status: 400 },
      );
    }

    const keyword = await prisma.keyword.create({
      data: {
        siteId,
        phrase,
        priority: priority ?? 0,
        status: status ?? "pending",
        parentId: parentId ?? null,
      },
    });

    return NextResponse.json(keyword, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Keyword already exists for this site" }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : "Failed to create keyword";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
