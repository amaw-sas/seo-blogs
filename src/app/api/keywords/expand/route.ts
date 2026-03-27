import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { expandKeyword, ExpandedKeyword } from "@/lib/ai/keyword-expander";

export async function POST(request: NextRequest) {
  try {
    const { keywordIds, siteId } = await request.json();

    if (!siteId || !Array.isArray(keywordIds) || keywordIds.length === 0) {
      return NextResponse.json(
        { error: "Se requiere siteId y keywordIds (array no vacío)" },
        { status: 400 }
      );
    }

    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: { domain: true },
    });

    if (!site) {
      return NextResponse.json({ error: "Sitio no encontrado" }, { status: 404 });
    }

    // Fetch seed keywords and existing keywords for context
    const [seedKeywords, existingKeywords] = await Promise.all([
      prisma.keyword.findMany({
        where: { id: { in: keywordIds }, siteId },
        select: { id: true, phrase: true },
      }),
      prisma.keyword.findMany({
        where: { siteId },
        select: { phrase: true },
      }),
    ]);

    if (seedKeywords.length === 0) {
      return NextResponse.json(
        { error: "No se encontraron keywords con los IDs proporcionados" },
        { status: 404 }
      );
    }

    const siteContext = {
      domain: site.domain,
      existingKeywords: existingKeywords.map((k) => k.phrase),
    };

    // Expand each seed keyword
    const allExpanded: Array<ExpandedKeyword & { parentId: string }> = [];

    for (const seed of seedKeywords) {
      const expanded = await expandKeyword(seed.phrase, siteContext);
      for (const kw of expanded) {
        allExpanded.push({ ...kw, parentId: seed.id });
      }
      // Add newly expanded phrases to context to avoid cross-seed duplicates
      siteContext.existingKeywords.push(...expanded.map((k) => k.phrase));
    }

    // Insert all expanded keywords, skip duplicates
    const { count } = await prisma.keyword.createMany({
      data: allExpanded.map((kw) => ({
        siteId,
        phrase: kw.phrase,
        priority: kw.priority,
        parentId: kw.parentId,
      })),
      skipDuplicates: true,
    });

    return NextResponse.json({
      expanded: seedKeywords.length,
      created: count,
      keywords: allExpanded,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al expandir keywords";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
