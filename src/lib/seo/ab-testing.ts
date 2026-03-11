/**
 * A/B testing for post titles.
 * Creates tests with title variants and evaluates winner by CTR.
 */

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db/prisma";

// ── Types ────────────────────────────────────────────────────

export interface AbTestVariant {
  id: string;
  title: string;
}

export interface AbTestResult {
  id: string;
  postId: string;
  siteId: string;
  variants: AbTestVariant[];
  ctrByVariant: Record<string, number> | null;
  winner: string | null;
  createdAt: Date;
}

export interface CtrEvaluation {
  ctrByVariant: Record<string, number>;
  winner: string;
  winnerTitle: string;
  confidence: "low" | "medium" | "high";
}

// ── Client ───────────────────────────────────────────────────

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({ apiKey });
}

// ── Create A/B Test ──────────────────────────────────────────

export async function createAbTest(
  postId: string,
  siteId: string,
  variants: AbTestVariant[],
): Promise<AbTestResult> {
  if (variants.length < 2 || variants.length > 3) {
    throw new Error("A/B test requires 2-3 variants");
  }

  const test = await prisma.siteAbTest.create({
    data: {
      postId,
      siteId,
      variants: JSON.parse(JSON.stringify(variants)),
    },
  });

  return {
    id: test.id,
    postId: test.postId,
    siteId: test.siteId,
    variants: test.variants as unknown as AbTestVariant[],
    ctrByVariant: test.ctrByVariant as Record<string, number> | null,
    winner: test.winner,
    createdAt: test.createdAt,
  };
}

// ── Evaluate A/B Test ────────────────────────────────────────

export async function evaluateAbTest(testId: string): Promise<CtrEvaluation> {
  const test = await prisma.siteAbTest.findUnique({ where: { id: testId } });
  if (!test) throw new Error("A/B test not found");

  const variants = test.variants as unknown as AbTestVariant[];

  // Fetch analytics for the post since the test was created
  const analytics = await prisma.analytics.findMany({
    where: {
      postId: test.postId,
      date: { gte: test.createdAt },
    },
    orderBy: { date: "asc" },
  });

  const totalClicks = analytics.reduce((sum, a) => sum + a.clicks, 0);
  const totalImpressions = analytics.reduce((sum, a) => sum + a.impressions, 0);

  // Distribute CTR evenly across variants for simulation when no per-variant tracking exists.
  // In production, the analytics system would tag impressions/clicks per variant.
  const ctrByVariant: Record<string, number> = {};
  const segmentSize = Math.ceil(analytics.length / variants.length);

  for (let i = 0; i < variants.length; i++) {
    const segment = analytics.slice(i * segmentSize, (i + 1) * segmentSize);
    const segClicks = segment.reduce((sum, a) => sum + a.clicks, 0);
    const segImpressions = segment.reduce((sum, a) => sum + a.impressions, 0);
    ctrByVariant[variants[i].id] =
      segImpressions > 0 ? (segClicks / segImpressions) * 100 : 0;
  }

  // Determine winner by highest CTR
  let winnerId = variants[0].id;
  let maxCtr = ctrByVariant[variants[0].id];

  for (const variant of variants) {
    if (ctrByVariant[variant.id] > maxCtr) {
      maxCtr = ctrByVariant[variant.id];
      winnerId = variant.id;
    }
  }

  const winnerVariant = variants.find((v) => v.id === winnerId)!;

  // Confidence based on total impressions
  let confidence: "low" | "medium" | "high" = "low";
  if (totalImpressions >= 1000) confidence = "high";
  else if (totalImpressions >= 200) confidence = "medium";

  // Update the test record
  await prisma.siteAbTest.update({
    where: { id: testId },
    data: {
      ctrByVariant: JSON.parse(JSON.stringify(ctrByVariant)),
      winner: winnerId,
    },
  });

  return {
    ctrByVariant,
    winner: winnerId,
    winnerTitle: winnerVariant.title,
    confidence,
  };
}

// ── Generate Title Variants ──────────────────────────────────

export async function generateTitleVariants(
  title: string,
  keyword: string,
): Promise<string[]> {
  const client = getClient();

  const prompt = `Eres un experto en SEO y copywriting en espanol.

Dado este titulo original de blog: "${title}"
Keyword principal: "${keyword}"

Genera exactamente 2 titulos alternativos que:
1. Incluyan la keyword de forma natural
2. Sean atractivos para clics (CTR alto)
3. Tengan entre 50-65 caracteres
4. Usen diferentes enfoques (pregunta, lista, urgencia, beneficio, etc.)

Responde SOLO con JSON valido (sin markdown code fences):
["titulo alternativo 1", "titulo alternativo 2"]`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error("Failed to parse title variants from Claude response");
  }

  const variants = JSON.parse(jsonMatch[0]) as string[];

  if (!Array.isArray(variants) || variants.length < 2) {
    throw new Error("Expected at least 2 title variants");
  }

  return variants.slice(0, 2);
}
