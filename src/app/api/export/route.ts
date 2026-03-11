import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";

/**
 * GET — export data as CSV or JSON.
 * Params: type (posts|keywords|logs|analytics), siteId, format (csv|json), dateFrom, dateTo
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const type = searchParams.get("type");
    const siteId = searchParams.get("siteId");
    const format = searchParams.get("format") ?? "json";
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    if (!type || !siteId) {
      return NextResponse.json(
        { error: "type and siteId are required" },
        { status: 400 },
      );
    }

    const validTypes = ["posts", "keywords", "logs", "analytics"];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `type must be one of: ${validTypes.join(", ")}` },
        { status: 400 },
      );
    }

    if (format !== "csv" && format !== "json") {
      return NextResponse.json(
        { error: "format must be csv or json" },
        { status: 400 },
      );
    }

    const data = await fetchExportData(type, siteId, dateFrom, dateTo);

    if (format === "json") {
      return NextResponse.json({ data });
    }

    // CSV format
    const csv = convertToCsv(data);
    const filename = `${type}_${siteId}_${new Date().toISOString().split("T")[0]}.csv`;

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to export data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── Data Fetching ────────────────────────────────────────────

async function fetchExportData(
  type: string,
  siteId: string,
  dateFrom: string | null,
  dateTo: string | null,
): Promise<Record<string, unknown>[]> {
  switch (type) {
    case "posts": {
      const where: Prisma.PostWhereInput = { siteId };
      if (dateFrom || dateTo) {
        where.createdAt = {};
        if (dateFrom) where.createdAt.gte = new Date(dateFrom);
        if (dateTo) where.createdAt.lte = new Date(dateTo);
      }
      const posts = await prisma.post.findMany({
        where,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          slug: true,
          keyword: true,
          status: true,
          seoScore: true,
          wordCount: true,
          keywordDensity: true,
          readabilityScore: true,
          generationCost: true,
          publishedAt: true,
          createdAt: true,
        },
      });
      return posts as unknown as Record<string, unknown>[];
    }

    case "keywords": {
      const where: Prisma.KeywordWhereInput = { siteId };
      if (dateFrom || dateTo) {
        where.createdAt = {};
        if (dateFrom) where.createdAt.gte = new Date(dateFrom);
        if (dateTo) where.createdAt.lte = new Date(dateTo);
      }
      const keywords = await prisma.keyword.findMany({
        where,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          phrase: true,
          status: true,
          priority: true,
          trendScore: true,
          skipReason: true,
          createdAt: true,
        },
      });
      return keywords as unknown as Record<string, unknown>[];
    }

    case "logs": {
      const where: Prisma.PublishLogWhereInput = { siteId };
      if (dateFrom || dateTo) {
        where.createdAt = {};
        if (dateFrom) where.createdAt.gte = new Date(dateFrom);
        if (dateTo) where.createdAt.lte = new Date(dateTo);
      }
      const logs = await prisma.publishLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          postId: true,
          eventType: true,
          status: true,
          errorMessage: true,
          costTokens: true,
          costImages: true,
          createdAt: true,
        },
      });
      return logs as unknown as Record<string, unknown>[];
    }

    case "analytics": {
      const where: Prisma.AnalyticsWhereInput = { siteId };
      if (dateFrom || dateTo) {
        where.date = {};
        if (dateFrom) where.date.gte = new Date(dateFrom);
        if (dateTo) where.date.lte = new Date(dateTo);
      }
      const analytics = await prisma.analytics.findMany({
        where,
        orderBy: { date: "desc" },
        include: {
          post: { select: { title: true, slug: true, keyword: true } },
        },
      });
      return analytics.map((a) => ({
        id: a.id,
        postId: a.postId,
        postTitle: a.post.title,
        postSlug: a.post.slug,
        keyword: a.post.keyword,
        date: a.date,
        views: a.views,
        clicks: a.clicks,
        impressions: a.impressions,
        position: a.position,
      }));
    }

    default:
      return [];
  }
}

// ── CSV Conversion ───────────────────────────────────────────

function convertToCsv(data: Record<string, unknown>[]): string {
  if (data.length === 0) return "";

  const headers = Object.keys(data[0]);

  const escapeCsvValue = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    const str = value instanceof Date ? value.toISOString() : String(value);
    // Escape double quotes and wrap in quotes if the value contains commas, quotes, or newlines
    if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines: string[] = [headers.join(",")];

  for (const row of data) {
    const values = headers.map((h) => escapeCsvValue(row[h]));
    lines.push(values.join(","));
  }

  // BOM for proper UTF-8 encoding in Excel
  return "\uFEFF" + lines.join("\n");
}
