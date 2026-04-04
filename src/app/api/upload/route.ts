import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

/**
 * POST /api/upload
 *
 * Upload a CSV file with keywords.
 * - ?preview=true → parse and return headers + rows for column mapping UI
 * - default → create keywords directly (backwards-compatible)
 */
export async function POST(request: NextRequest) {
  try {
    const preview = request.nextUrl.searchParams.get("preview") === "true";
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const siteId = formData.get("siteId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!siteId) {
      return NextResponse.json({ error: "siteId is required" }, { status: 400 });
    }

    const text = await file.text();
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) {
      return NextResponse.json({ error: "CSV file is empty" }, { status: 400 });
    }

    // Parse all rows into columns
    const allRows = lines.map((line) =>
      line.split(",").map((p) => p.trim().replace(/^["']|["']$/g, "")),
    );

    // Detect if first row is a header
    const firstRowLower = allRows[0].map((c) => c.toLowerCase());
    const keywordAliases = ["keyword", "phrase", "frase", "palabra", "kw"];
    const priorityAliases = ["priority", "prioridad", "prio"];
    const hasHeader = firstRowLower.some(
      (c) => keywordAliases.includes(c) || priorityAliases.includes(c),
    );

    const headers = hasHeader ? allRows[0] : allRows[0].map((_, i) => `Columna ${i + 1}`);
    const dataRows = hasHeader ? allRows.slice(1) : allRows;

    // Auto-detect column mapping
    const detectedMapping: { keyword?: number; priority?: number } = {};
    for (let i = 0; i < firstRowLower.length; i++) {
      if (keywordAliases.includes(firstRowLower[i])) detectedMapping.keyword = i;
      if (priorityAliases.includes(firstRowLower[i])) detectedMapping.priority = i;
    }
    // Fallback: first column is keyword if no header match
    if (detectedMapping.keyword === undefined) detectedMapping.keyword = 0;

    if (preview) {
      return NextResponse.json({
        headers,
        rows: dataRows,
        hasHeader,
        detectedMapping,
        totalRows: dataRows.length,
      });
    }

    // Direct creation mode (backwards-compatible)
    const kwColIdx = detectedMapping.keyword ?? 0;
    const prioColIdx = detectedMapping.priority;

    const keywords: { siteId: string; phrase: string; priority: number }[] = [];
    for (const row of dataRows) {
      const phrase = row[kwColIdx];
      if (!phrase) continue;
      const priority = prioColIdx !== undefined && row[prioColIdx]
        ? parseInt(row[prioColIdx], 10)
        : 0;
      keywords.push({ siteId, phrase, priority: isNaN(priority) ? 0 : priority });
    }

    if (keywords.length === 0) {
      return NextResponse.json({ error: "No valid keywords found in CSV" }, { status: 400 });
    }

    const result = await prisma.keyword.createMany({
      data: keywords,
      skipDuplicates: true,
    });

    return NextResponse.json(
      {
        message: "Keywords uploaded successfully",
        total: keywords.length,
        created: result.count,
        skipped: keywords.length - result.count,
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to upload keywords";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
