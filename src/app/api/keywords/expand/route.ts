import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { expandKeyword, ExpandedKeyword } from "@/lib/ai/keyword-expander";

export async function POST(request: NextRequest) {
  try {
    const { keywordIds, siteId, dryRun, maxPerSeed } = await request.json() as {
      keywordIds?: string[];
      siteId?: string;
      dryRun?: boolean;
      maxPerSeed?: number;
    };

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

    const limit = maxPerSeed && maxPerSeed > 0 ? maxPerSeed : undefined;

    for (const seed of seedKeywords) {
      const expanded = await expandKeyword(seed.phrase, siteContext);
      const limited = limit ? expanded.slice(0, limit) : expanded;
      for (const kw of limited) {
        allExpanded.push({ ...kw, parentId: seed.id });
      }
      siteContext.existingKeywords.push(...limited.map((k) => k.phrase));
    }

    // dryRun: return suggestions without inserting
    if (dryRun) {
      return NextResponse.json({
        expanded: seedKeywords.length,
        created: 0,
        keywords: allExpanded,
      });
    }

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
