/**
 * Content gap analysis.
 * Analyzes published posts + keywords to find uncovered topics.
 * Uses OpenAI to identify gaps and suggest new content opportunities.
 */

import { chatCompletion } from "./openai-client";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ── Types ────────────────────────────────────────────────────

export interface ContentGap {
  topic: string;
  reason: string;
  suggestedKeywords: string[];
}

// ── Public API ───────────────────────────────────────────────

/**
 * Analyze published posts and keywords for a site to find topic gaps.
 * Returns uncovered topics with reasons and suggested keywords.
 */
export async function findContentGaps(
  siteId: string,
): Promise<ContentGap[]> {
  // Gather existing content data
  const [posts, keywords] = await Promise.all([
    prisma.post.findMany({
      where: {
        siteId,
        status: { in: ["published", "review", "draft"] },
      },
      select: { title: true, keyword: true, slug: true },
    }),
    prisma.keyword.findMany({
      where: { siteId },
      select: { phrase: true, status: true },
    }),
  ]);

  if (posts.length === 0 && keywords.length === 0) {
    return [];
  }

  const existingTopics = posts.map((p) => `- "${p.title}" (keyword: ${p.keyword})`).join("\n");
  const existingKeywords = keywords.map((k) => `- "${k.phrase}" (${k.status})`).join("\n");

  const prompt = `Eres un experto en estrategia de contenido SEO.

Analiza el contenido existente de un sitio web y sus keywords para identificar brechas de contenido (content gaps).

## Posts existentes:
${existingTopics || "Ninguno"}

## Keywords registradas:
${existingKeywords || "Ninguna"}

Identifica 5-10 temas que el sitio NO esta cubriendo pero DEBERIA cubrir, considerando:
1. Temas relacionados que complementarian el contenido existente
2. Preguntas que los usuarios probablemente buscan y no estan respondidas
3. Temas de soporte (supporting content) para los pilares existentes
4. Oportunidades de long-tail keywords no explotadas

Responde SOLO con JSON valido (sin markdown code fences):
{
  "gaps": [
    {
      "topic": "Tema sugerido",
      "reason": "Por que este tema es importante y como complementa el contenido existente",
      "suggestedKeywords": ["keyword 1", "keyword 2", "keyword 3"]
    }
  ]
}`;

  const text = await chatCompletion(prompt, 3000);

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(
      "Failed to parse content gap analysis JSON from AI response",
    );
  }

  const result = JSON.parse(jsonMatch[0]) as { gaps: ContentGap[] };

  return result.gaps ?? [];
}
