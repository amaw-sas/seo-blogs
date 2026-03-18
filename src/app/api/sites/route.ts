import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";

export async function GET() {
  try {
    const sites = await prisma.site.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { keywords: { where: { status: "pending" } } },
        },
      },
    });

    return NextResponse.json({ data: sites });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch sites";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { domain, name, platform, apiUrl, apiUser, apiPassword, postsPerDay,
      minWords, maxWords, windowStart, windowEnd, conversionUrl,
      authoritativeSources, knowledgeBase } = body;

    if (!domain || !name || !platform) {
      return NextResponse.json(
        { error: "Missing required fields: domain, name, platform" },
        { status: 400 },
      );
    }

    const site = await prisma.site.create({
      data: {
        domain,
        name,
        platform,
        apiUrl: apiUrl ?? null,
        apiUser: apiUser ?? null,
        apiPassword: apiPassword ?? null,
        postsPerDay: postsPerDay ?? 1,
        minWords: minWords ?? 1500,
        maxWords: maxWords ?? 2500,
        windowStart: windowStart ?? 7,
        windowEnd: windowEnd ?? 12,
        conversionUrl: conversionUrl ?? null,
        authoritativeSources: authoritativeSources ?? [],
        knowledgeBase: knowledgeBase ?? null,
      },
    });

    return NextResponse.json(site, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "A site with this domain already exists" }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : "Failed to create site";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
