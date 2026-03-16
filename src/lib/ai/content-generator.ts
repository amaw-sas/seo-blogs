/**
 * AI content generation using OpenAI API.
 * Generates SEO-optimized blog post outlines and full content in Spanish.
 */

import { chatCompletion } from "./openai-client";

// ── Types ────────────────────────────────────────────────────

export interface SiteConfig {
  minWords: number;
  maxWords: number;
  conversionUrl: string | null;
  authoritativeSources: string[];
  domain: string;
}

export interface OutlineSection {
  tag: "h1" | "h2" | "h3";
  text: string;
  children?: OutlineSection[];
}

export interface PostOutline {
  h1: string;
  metaTitle: string;
  sections: OutlineSection[];
  faqQuestions: string[];
  conclusion: string;
  tableOfContents: string[];
}

export interface GeneratedContent {
  html: string;
  markdown: string;
  wordCount: number;
  metaDescription: string;
  faqItems: { question: string; answer: string }[];
}

// ── Outline Generation ───────────────────────────────────────

interface CompetitionInsights {
  avgWordCount: number;
  commonH2Topics: string[];
  contentGaps: string[];
  suggestedAngle: string;
}

export async function generateOutline(
  keyword: string,
  siteConfig: SiteConfig,
  competitionAnalysis?: CompetitionInsights,
): Promise<PostOutline> {
  const competitionContext = competitionAnalysis
    ? `

Analisis de la competencia para esta keyword:
- Los articulos top tienen ~${competitionAnalysis.avgWordCount} palabras en promedio
- Temas H2 comunes: ${competitionAnalysis.commonH2Topics.join(", ")}
- Brechas de contenido (oportunidades): ${competitionAnalysis.contentGaps.join(", ")}
- Angulo sugerido para diferenciarnos: ${competitionAnalysis.suggestedAngle}

Usa esta informacion para crear un outline SUPERIOR a la competencia. Cubre los temas comunes PERO tambien aborda las brechas de contenido identificadas. Adopta el angulo sugerido para diferenciar el articulo.
`
    : "";

  const prompt = `Eres un experto en SEO y redaccion de contenido en espanol.

Genera un outline detallado para un articulo de blog optimizado para la keyword: "${keyword}"
${competitionContext}
Requisitos:
- Idioma: Espanol
- Rango de palabras: ${siteConfig.minWords}-${siteConfig.maxWords}
- H1: titulo atractivo que incluya la keyword, MAXIMO 60 caracteres
- metaTitle: version optimizada para CTR del H1, MAXIMO 60 caracteres, debe incluir la keyword
- 4-6 secciones H2, cada una con 1-3 H3 de apoyo
- Cada H2 debe poder responder directamente una pregunta (formato LLM-friendly)
- Seccion de FAQ con 3-5 preguntas antes de la conclusion
- Seccion de conclusion al final
- La keyword debe aparecer naturalmente en los encabezados

Responde SOLO con JSON valido (sin markdown code fences) con esta estructura:
{
  "h1": "string (max 60 chars)",
  "metaTitle": "string (max 60 chars, optimizado para CTR)",
  "sections": [
    {
      "tag": "h2",
      "text": "string",
      "children": [
        { "tag": "h3", "text": "string" }
      ]
    }
  ],
  "faqQuestions": ["string"],
  "conclusion": "Titulo de la conclusion",
  "tableOfContents": ["string - lista de todos los H2"]
}`;

  const text = await chatCompletion(prompt, 2000);

  const outline = JSON.parse(extractJson(text)) as PostOutline;

  // Enforce H1 length limit
  if (outline.h1.length > 70) {
    // Truncate at last word boundary within 60 chars
    const truncated = outline.h1.slice(0, 60);
    const lastSpace = truncated.lastIndexOf(" ");
    outline.h1 = lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated;
  }

  // Ensure metaTitle exists and respects length
  if (!outline.metaTitle || outline.metaTitle.length > 60) {
    outline.metaTitle = outline.h1.slice(0, 60);
  }

  // Remove any H2 that duplicates the H1 (LLM sometimes generates this)
  if (outline.h1 && outline.sections?.length) {
    const h1Lower = outline.h1.toLowerCase();
    outline.sections = outline.sections.filter(
      (s) => s.text.toLowerCase() !== h1Lower,
    );
  }

  // Validate minimum structure
  if (!outline.h1 || !outline.sections?.length || !outline.faqQuestions?.length) {
    throw new Error("Generated outline is missing required fields");
  }

  return outline;
}

// ── Content Generation ───────────────────────────────────────

export async function generateContent(
  outline: PostOutline,
  keyword: string,
  siteConfig: SiteConfig,
): Promise<GeneratedContent> {
  const outlineText = formatOutlineForPrompt(outline);

  const prompt = `Eres un redactor experto en SEO para contenido en espanol.

Escribe un articulo completo basado en este outline:

${outlineText}

Keyword principal: "${keyword}"

Requisitos OBLIGATORIOS:
1. Idioma: Espanol (Latinoamerica) — CERO texto en ingles, todo el contenido debe ser en espanol
2. Longitud: ${siteConfig.minWords}-${siteConfig.maxWords} palabras
3. La keyword "${keyword}" DEBE aparecer en las primeras 100 palabras
4. Cada seccion H2 debe abrir con una respuesta directa y concisa (2-3 oraciones) antes de profundizar — esto es critico para que los LLMs extraigan la respuesta
5. Seccion FAQ con ${outline.faqQuestions.length} preguntas y respuestas detalladas antes de la conclusion
6. Incluir al menos 2 datos especificos por articulo (precios reales, porcentajes, nombres de empresas)
7. Tono: profesional pero accesible, sin jerga innecesaria
8. Densidad de keyword: mantener por debajo del 2.5%
9. metaDescription: genera una meta description de 120-155 caracteres con CTA implicito que incluya la keyword — NO copies una oracion del body

PROHIBIDO:
- Introduccion generica ("En el mundo actual...", "Es fundamental destacar...", "En la actualidad...")
- Conclusion tipo resumen ("En conclusion, X es importante para Y")
- Frases de relleno ("cabe mencionar", "es importante destacar", "sin duda alguna", "vale la pena")
- Listas simetricas de 3-5 items con la misma estructura gramatical
- CUALQUIER texto en ingles
- Lenguaje evasivo ("puede que", "en general", "a menudo") — ser especifico

OBLIGATORIO:
- La introduccion debe responder la pregunta del titulo en la primera oracion
- La conclusion debe dar un paso accionable concreto, no un resumen
- Variar la estructura entre secciones (no todas con el mismo patron)

Estructura de la respuesta — responde SOLO con JSON valido (sin markdown code fences):
{
  "html": "<article>...contenido HTML completo con tags semanticos (h1, h2, h3, p, ul, ol, strong, em)...</article>",
  "markdown": "# ...contenido en Markdown...",
  "metaDescription": "string (120-155 chars, con CTA implicito y keyword)",
  "faqItems": [
    { "question": "string", "answer": "string" }
  ]
}

Para el HTML:
- Usa <article> como wrapper
- Incluye tabla de contenidos al inicio como <nav> con <ul> y enlaces ancla
- Cada H2 debe tener un id slug (ej: <h2 id="que-es-keyword">)
- La seccion FAQ usa <section class="faq"> con <details>/<summary>
- NO incluyas imagenes, se insertaran despues
- NO incluyas links, se insertaran despues`;

  const text = await chatCompletion(prompt, 16000);

  const content = JSON.parse(extractJson(text)) as {
    html: string;
    markdown: string;
    metaDescription?: string;
    faqItems: { question: string; answer: string }[];
  };

  if (!content.html || !content.markdown) {
    throw new Error("Generated content is missing html or markdown");
  }

  const wordCount = content.html
    .replace(/<[^>]+>/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;

  return {
    html: content.html,
    markdown: content.markdown,
    wordCount,
    metaDescription: content.metaDescription ?? "",
    faqItems: content.faqItems ?? [],
  };
}

// ── Helpers ──────────────────────────────────────────────────

/**
 * Extract JSON from a Claude response that may contain markdown code fences.
 * Handles braces inside JSON string values (e.g., HTML with CSS).
 */
function extractJson(text: string): string {
  // Strip markdown code fences if present
  const stripped = text.replace(/```(?:json)?\s*\n?/g, "").trim();

  const start = stripped.indexOf("{");
  if (start === -1) throw new Error("No JSON object found in response");

  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = -1;

  for (let i = start; i < stripped.length; i++) {
    const ch = stripped[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  if (end === -1) throw new Error("Unbalanced JSON braces in response");
  return stripped.slice(start, end + 1);
}

// ── Exports for testing ─────────────────────────────────────
export { extractJson };

function formatOutlineForPrompt(outline: PostOutline): string {
  const lines: string[] = [];
  lines.push(`H1: ${outline.h1}`);
  lines.push("");

  for (const section of outline.sections) {
    lines.push(`H2: ${section.text}`);
    if (section.children) {
      for (const child of section.children) {
        lines.push(`  H3: ${child.text}`);
      }
    }
    lines.push("");
  }

  lines.push("FAQ:");
  for (const q of outline.faqQuestions) {
    lines.push(`  - ${q}`);
  }
  lines.push("");
  lines.push(`Conclusion: ${outline.conclusion}`);

  return lines.join("\n");
}
