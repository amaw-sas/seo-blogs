/**
 * Keyword interpretation step for the content pipeline.
 * Analyzes a keyword to determine user intent, recommended angle,
 * business connection, and suggested content depth/length.
 * Runs before competition analysis and feeds into all downstream steps.
 */

import { chatCompletion } from "./openai-client";
import { buildPrompt } from "./prompt-builder";

// ── Types ────────────────────────────────────────────────────

export interface KeywordInterpretation {
  userIntent: string;
  recommendedAngle: string;
  businessConnection: string;
  suggestedWordRange: { min: number; max: number };
  depth: "light" | "medium" | "deep";
}

// ── Public API ───────────────────────────────────────────────

/**
 * Interpret a keyword to understand user intent and recommend content strategy.
 * Non-fatal: if this fails, the pipeline continues without interpretation.
 */
export async function interpretKeyword(
  keyword: string,
  domain: string,
  knowledgeBase?: string | null,
  siteId?: string,
): Promise<KeywordInterpretation> {
  let prompt: string;
  let maxTokens = 1000;
  let temperature: number | undefined;

  try {
    const result = await buildPrompt("keyword_interpretation", siteId ?? null, {
      keyword,
      domain,
      knowledgeBaseBlock: knowledgeBase
        ? `\nCONTEXTO DEL NEGOCIO:\n${knowledgeBase}\n`
        : "",
    });
    prompt = result.prompt;
    maxTokens = result.maxTokens;
    temperature = result.temperature;
  } catch {
    // Fallback to hardcoded prompt when DB step not found or disabled
    prompt = `Eres un experto en SEO y estrategia de contenido en espanol.

Analiza la siguiente keyword y determina la intencion del usuario, el angulo recomendado para el articulo, y como conectar el contenido con el negocio.

Keyword: "${keyword}"
Dominio del sitio: ${domain}
${knowledgeBase ? `\nCONTEXTO DEL NEGOCIO:\n${knowledgeBase}\n` : ""}

ANALISIS DE INTENCION:
- Determina si la intencion es informacional, transaccional, navegacional o mixta
- Identifica la pregunta implicita del usuario
- Si la keyword es coloquial o local, interpreta el significado real

ANGULO RECOMENDADO:
- Sugiere un angulo especifico y diferenciador para el articulo
- El angulo debe ser practico y accionable, no generico

PROFUNDIDAD Y LONGITUD:
- depth: "light" (500-1000 palabras) para keywords simples/transaccionales directas
- depth: "medium" (1500-2500 palabras) para keywords informacionales estandar
- depth: "deep" (2500-4000 palabras) para keywords complejas/comparativas/guias
- Sugiere un rango de palabras especifico (min, max)

Responde SOLO con JSON valido (sin markdown code fences):
{
  "userIntent": "string",
  "recommendedAngle": "string",
  "businessConnection": "string",
  "suggestedWordRange": { "min": number, "max": number },
  "depth": "light" | "medium" | "deep"
}`;
  }

  const text = await chatCompletion(prompt, maxTokens, temperature);

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse keyword interpretation JSON from AI response");
  }

  const interpretation = JSON.parse(jsonMatch[0]) as KeywordInterpretation;

  if (
    !interpretation.userIntent ||
    !interpretation.recommendedAngle ||
    !interpretation.businessConnection ||
    !interpretation.suggestedWordRange?.min ||
    !interpretation.suggestedWordRange?.max ||
    !interpretation.depth
  ) {
    throw new Error("Keyword interpretation is missing required fields");
  }

  // Validate depth value
  if (!["light", "medium", "deep"].includes(interpretation.depth)) {
    interpretation.depth = "medium";
  }

  // Ensure min <= max
  if (interpretation.suggestedWordRange.min > interpretation.suggestedWordRange.max) {
    const tmp = interpretation.suggestedWordRange.min;
    interpretation.suggestedWordRange.min = interpretation.suggestedWordRange.max;
    interpretation.suggestedWordRange.max = tmp;
  }

  return interpretation;
}
