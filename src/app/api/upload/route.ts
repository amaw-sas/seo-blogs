import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function POST(request: NextRequest) {
  try {
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

    // Check if first line is a header
    const firstLine = lines[0].toLowerCase();
    const startIndex = firstLine.startsWith("keyword") || firstLine.startsWith("phrase") ? 1 : 0;

    const keywords: { siteId: string; phrase: string; priority: number }[] = [];

    for (let i = startIndex; i < lines.length; i++) {
      const parts = lines[i].split(",").map((p) => p.trim().replace(/^["']|["']$/g, ""));
      const phrase = parts[0];
      if (!phrase) continue;

      const priority = parts[1] ? parseInt(parts[1], 10) : 0;

      keywords.push({
        siteId,
        phrase,
        priority: isNaN(priority) ? 0 : priority,
      });
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
