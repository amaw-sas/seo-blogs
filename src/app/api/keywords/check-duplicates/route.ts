import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

const SPANISH_STOPWORDS = new Set([
  "de", "la", "el", "en", "y", "a", "los", "las", "del",
  "un", "una", "por", "con", "para", "es", "al", "lo", "como", "su", "se", "que",
]);

function normalize(phrase: string): string {
  return phrase
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word && !SPANISH_STOPWORDS.has(word))
    .join(" ")
    .trim();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { siteId, phrases } = body as { siteId?: string; phrases?: string[] };

    if (!siteId || !Array.isArray(phrases) || phrases.length === 0) {
      return NextResponse.json(
        { error: "Missing required fields: siteId, phrases (non-empty array)" },
        { status: 400 },
      );
    }

    const existing = await prisma.keyword.findMany({
      where: { siteId },
      select: { phrase: true },
    });

    const existingPhrases = existing.map((k) => k.phrase);
    const existingSet = new Set(existingPhrases);
    const normalizedMap = new Map<string, string>();
    for (const ep of existingPhrases) {
      normalizedMap.set(normalize(ep), ep);
    }

    const results = phrases.map((phrase) => {
      if (existingSet.has(phrase)) {
        return { phrase, status: "exact_dup" as const, matchedPhrase: phrase };
      }

      const normalizedIncoming = normalize(phrase);
      const matchedOriginal = normalizedMap.get(normalizedIncoming);
      if (matchedOriginal) {
        return { phrase, status: "normalized_dup" as const, matchedPhrase: matchedOriginal };
      }

      return { phrase, status: "new" as const };
    });

    return NextResponse.json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to check duplicates";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
