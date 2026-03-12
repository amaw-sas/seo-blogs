/**
 * Keyword expansion using OpenAI API.
 * Generates long-tail and "People Also Ask" style derived keywords.
 */

import { chatCompletion } from "./openai-client";

export interface ExpandedKeyword {
  phrase: string;
  priority: number;
}

export interface SiteContext {
  domain: string;
  existingKeywords: string[];
}

/**
 * Expand a seed keyword into 5-10 derived long-tail keywords.
 * Returns phrases ranked by estimated search priority.
 */
export async function expandKeyword(
  keyword: string,
  siteContext: SiteContext,
): Promise<ExpandedKeyword[]> {
  const existingList =
    siteContext.existingKeywords.length > 0
      ? `\nKeywords ya existentes en el sitio (evitar duplicados):\n${siteContext.existingKeywords.map((k) => `- ${k}`).join("\n")}`
      : "";

  const prompt = `Eres un experto en SEO y keyword research para contenido en espanol.

Dada la keyword semilla: "${keyword}"
Dominio del sitio: ${siteContext.domain}
${existingList}

Genera entre 5 y 10 keywords derivadas que cumplan:
1. Long-tail keywords (3+ palabras) relacionadas con la keyword semilla
2. Estilo "People Also Ask" — preguntas que los usuarios buscan
3. Variaciones con intencion de busqueda informacional
4. Evitar keywords demasiado similares entre si
5. Evitar duplicar las keywords existentes del sitio
6. Idioma: Espanol (Latinoamerica)

Asigna prioridad de 1 (mas alta) a 10 (mas baja) segun volumen de busqueda estimado.

Responde SOLO con JSON valido (sin markdown code fences):
[
  { "phrase": "string", "priority": number }
]`;

  const text = await chatCompletion(prompt, 1500);

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error("Failed to parse keyword expansion JSON from AI response");
  }

  const keywords = JSON.parse(jsonMatch[0]) as ExpandedKeyword[];

  if (!Array.isArray(keywords) || keywords.length === 0) {
    throw new Error("Keyword expansion returned empty results");
  }

  // Validate and normalize
  return keywords
    .filter((k) => k.phrase && typeof k.priority === "number")
    .map((k) => ({
      phrase: k.phrase.trim().toLowerCase(),
      priority: Math.max(1, Math.min(10, Math.round(k.priority))),
    }))
    .sort((a, b) => a.priority - b.priority);
}
