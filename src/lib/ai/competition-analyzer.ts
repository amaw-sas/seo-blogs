/**
 * Competition analysis for keywords.
 * Uses Claude to analyze top-ranking content structure and identify gaps.
 * Results feed into the outline generation step for better content strategy.
 */

import Anthropic from "@anthropic-ai/sdk";

// ── Types ────────────────────────────────────────────────────

export interface CompetitionAnalysis {
  avgWordCount: number;
  commonH2Topics: string[];
  contentGaps: string[];
  suggestedAngle: string;
}

// ── Client ───────────────────────────────────────────────────

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({ apiKey });
}

// ── Public API ───────────────────────────────────────────────

/**
 * Analyze top-ranking content structure for a keyword using Claude.
 * Returns insights about competitor content to inform outline generation.
 */
export async function analyzeCompetition(
  keyword: string,
): Promise<CompetitionAnalysis> {
  const client = getClient();

  const prompt = `Eres un experto en SEO y analisis de contenido competitivo.

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

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1500,
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(
      "Failed to parse competition analysis JSON from Claude response",
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
