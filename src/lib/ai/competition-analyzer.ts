/**
 * Competition analysis for keywords.
 * Uses OpenAI to analyze top-ranking content structure and identify gaps.
 * Results feed into the outline generation step for better content strategy.
 */

import { chatCompletion } from "./openai-client";
import { buildPrompt } from "./prompt-builder";

// ── Types ────────────────────────────────────────────────────

export interface CompetitionAnalysis {
  avgWordCount: number;
  commonH2Topics: string[];
  contentGaps: string[];
  suggestedAngle: string;
}

// ── Public API ───────────────────────────────────────────────

/**
 * Analyze top-ranking content structure for a keyword using Claude.
 * Returns insights about competitor content to inform outline generation.
 */
export async function analyzeCompetition(
  keyword: string,
  siteId?: string,
): Promise<CompetitionAnalysis> {
  let prompt: string;
  let maxTokens = 1500;

  try {
    const result = await buildPrompt("competition_analysis", siteId ?? null, {
      keyword,
    });
    prompt = result.prompt;
    maxTokens = result.maxTokens;
  } catch {
    // Fallback to hardcoded prompt when DB step not found or disabled
    prompt = `Eres un experto en SEO y analisis de contenido competitivo.

Analiza la estructura tipica de contenido que ranquea en las primeras posiciones de Google para la keyword: "${keyword}"

Basandote en tu conocimiento de patrones de contenido SEO, proporciona:

1. **avgWordCount**: Estimacion del conteo promedio de palabras de los articulos top (numero entero)
2. **commonH2Topics**: Los 5-8 temas/secciones H2 mas comunes que cubren los articulos top
3. **contentGaps**: 3-5 temas o angulos que los articulos existentes NO cubren bien y representan oportunidades
4. **suggestedAngle**: Un angulo diferenciador especifico para nuestro articulo que lo haga unico frente a la competencia

Responde SOLO con JSON valido (sin markdown code fences):
{
  "avgWordCount": 1800,
  "commonH2Topics": ["string"],
  "contentGaps": ["string"],
  "suggestedAngle": "string"
}`;
  }

  const text = await chatCompletion(prompt, maxTokens);

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(
      "Failed to parse competition analysis JSON from AI response",
    );
  }

  const analysis = JSON.parse(jsonMatch[0]) as CompetitionAnalysis;

  if (
    !analysis.avgWordCount ||
    !analysis.commonH2Topics?.length ||
    !analysis.contentGaps?.length ||
    !analysis.suggestedAngle
  ) {
    throw new Error("Competition analysis is missing required fields");
  }

  return analysis;
}
