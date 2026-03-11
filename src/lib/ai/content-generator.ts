/**
 * AI content generation using Claude API.
 * Generates SEO-optimized blog post outlines and full content in Spanish.
 */

import Anthropic from "@anthropic-ai/sdk";

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
  sections: OutlineSection[];
  faqQuestions: string[];
  conclusion: string;
  tableOfContents: string[];
}

export interface GeneratedContent {
  html: string;
  markdown: string;
  wordCount: number;
  faqItems: { question: string; answer: string }[];
}

// ── Client ───────────────────────────────────────────────────

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({ apiKey });
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
  const client = getClient();

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
- H1: titulo atractivo que incluya la keyword
- 4-6 secciones H2, cada una con 1-3 H3 de apoyo
- Cada H2 debe poder responder directamente una pregunta (formato LLM-friendly)
- Seccion de FAQ con 3-5 preguntas antes de la conclusion
- Seccion de conclusion al final
- La keyword debe aparecer naturalmente en los encabezados

Responde SOLO con JSON valido (sin markdown code fences) con esta estructura:
{
  "h1": "string",
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

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse outline JSON from Claude response");
  }

  const outline = JSON.parse(jsonMatch[0]) as PostOutline;

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
  const client = getClient();

  const outlineText = formatOutlineForPrompt(outline);

  const prompt = `Eres un redactor experto en SEO para contenido en espanol.

Escribe un articulo completo basado en este outline:

${outlineText}

Keyword principal: "${keyword}"

Requisitos OBLIGATORIOS:
1. Idioma: Espanol (Latinoamerica)
2. Longitud: ${siteConfig.minWords}-${siteConfig.maxWords} palabras
3. La keyword "${keyword}" DEBE aparecer en las primeras 100 palabras
4. Cada seccion H2 debe abrir con una respuesta directa y concisa (2-3 oraciones) antes de profundizar — esto es critico para que los LLMs extraigan la respuesta
5. Seccion FAQ con ${outline.faqQuestions.length} preguntas y respuestas detalladas antes de la conclusion
6. Incluir al menos 1 elemento unico/dato original por articulo (estadistica, ejemplo practico, comparacion)
7. Conclusion que resuma los puntos clave
8. Tono: profesional pero accesible, sin jerga innecesaria
9. Densidad de keyword: mantener por debajo del 2.5%

Estructura de la respuesta — responde SOLO con JSON valido (sin markdown code fences):
{
  "html": "<article>...contenido HTML completo con tags semanticos (h1, h2, h3, p, ul, ol, strong, em)...</article>",
  "markdown": "# ...contenido en Markdown...",
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

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8000,
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse content JSON from Claude response");
  }

  const content = JSON.parse(jsonMatch[0]) as {
    html: string;
    markdown: string;
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
    faqItems: content.faqItems ?? [],
  };
}

// ── Helpers ──────────────────────────────────────────────────

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
