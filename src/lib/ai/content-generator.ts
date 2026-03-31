/**
 * AI content generation using OpenAI API.
 * Generates SEO-optimized blog post outlines and full content in Spanish.
 */

import TurndownService from "turndown";
import { chatCompletion } from "./openai-client";
import { buildPrompt } from "./prompt-builder";

const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
});

// ── Types ────────────────────────────────────────────────────

export interface SiteConfig {
  minWords: number;
  maxWords: number;
  conversionUrl: string | null;
  authoritativeSources: string[];
  domain: string;
  knowledgeBase?: string | null;
  platform?: string;
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
  siteId?: string,
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

  let prompt: string;
  let maxTokens = 2000;
  let temperature: number | undefined;

  try {
    const result = await buildPrompt("outline_generation", siteId ?? null, {
      keyword,
      knowledgeBaseBlock: siteConfig.knowledgeBase ? `\nCONTEXTO DEL NEGOCIO:\n${siteConfig.knowledgeBase}\n` : "",
      competitionContext,
    });
    prompt = result.prompt;
    maxTokens = result.maxTokens;
    temperature = result.temperature;
  } catch {
    // Fallback to hardcoded prompt when DB step not found or disabled
    prompt = `Eres un experto en SEO y redaccion de contenido en espanol.

Genera un outline detallado para un articulo de blog optimizado para la keyword: "${keyword}"
${siteConfig.knowledgeBase ? `\nCONTEXTO DEL NEGOCIO:\n${siteConfig.knowledgeBase}\n` : ""}${competitionContext}

REGLAS DE SEO APRENDIDAS (basadas en analisis de posts con alta puntuacion SEO):

TITULO Y SLUG:
- H1: keyword AL INICIO del titulo, seguida de ":" y un modificador descriptivo. MAXIMO 60 caracteres.
  BUENOS: "Renta autos Cartagena: guia para recorrer la ciudad", "Alquiler carro Cali barato: tips reales para ahorrar"
  MALOS: "Guia Completa sobre los Documentos Necesarios para Rentar un Carro en Bogota" (largo, keyword enterrada)
- metaTitle: version optimizada para CTR del H1, MAXIMO 45 caracteres (el sitio agrega " | Marca" despues), keyword al inicio
- El slug se generara automaticamente del keyword (3-5 palabras, sin stopwords). NO incluir "guia-completa", "descubre", "todo-lo-que-debes-saber" en el titulo.

ESTRUCTURA DE HEADINGS:
- 4-7 secciones H2. NO todas deben ser preguntas — variar entre:
  * Afirmaciones directas: "Lugares imperdibles con renta de autos"
  * Listas con numero: "7 consejos clave para ahorrar"
  * Guias practicas: "Consejos para conducir en la ciudad"
  * Solo 1-2 H2s como pregunta: "¿Cuanto cuesta alquilar?"
- Cada H2 debe tener 0-3 H3 como maximo. Variar: algunas H2 sin H3, otras con 2-3.
- CRITICO PARA YOAST: Al menos 1 H2 debe contener la keyword "${keyword}" TEXTUAL (se permiten articulos/preposiciones extra). Ejemplo si keyword es "alquiler camioneta 4x4 bogota": "Alquiler de camioneta 4x4 en Bogotá: mejores opciones". Yoast busca la frase exacta, no palabras sueltas.
- Seccion de FAQ con 3-5 preguntas antes de la conclusion
- Seccion de conclusion al final
- PROHIBIDO: H2s que repitan la misma estructura gramatical ("¿Como X?", "¿Que Y?", "¿Cuales Z?" consecutivos)

RELEVANCIA TEMATICA:
- El contenido DEBE estar directamente relacionado con el nicho del sitio
- PROHIBIDO: posts off-topic (festividades religiosas, eventos culturales sin conexion directa al servicio)
- Cada seccion debe aportar valor practico: lugares, precios, requisitos, comparaciones, rutas

Responde SOLO con JSON valido (sin markdown code fences) con esta estructura:
{
  "h1": "string (max 60 chars, keyword al inicio)",
  "metaTitle": "string (max 45 chars, keyword al inicio, optimizado para CTR)",
  "sections": [
    {
      "tag": "h2",
      "text": "string (incluir keyword o sinonimo natural)",
      "children": [
        { "tag": "h3", "text": "string" }
      ]
    }
  ],
  "faqQuestions": ["string"],
  "conclusion": "Titulo de la conclusion",
  "tableOfContents": ["string - lista de todos los H2"]
}`;
  }

  const text = await chatCompletion(prompt, maxTokens, temperature, true);

  const outline = JSON.parse(extractJson(text)) as PostOutline;

  // Enforce H1 length limit
  if (outline.h1.length > 70) {
    // Truncate at last word boundary within 60 chars
    const truncated = outline.h1.slice(0, 60);
    const lastSpace = truncated.lastIndexOf(" ");
    outline.h1 = lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated;
  }

  // Ensure metaTitle exists and is short enough for " | Brand" suffix (~15 chars)
  if (!outline.metaTitle || outline.metaTitle.length > 45) {
    outline.metaTitle = outline.h1.slice(0, 45).trimEnd();
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
  siteId?: string,
): Promise<GeneratedContent> {
  const outlineText = formatOutlineForPrompt(outline);

  const formatoReglas = siteConfig.platform === "wordpress"
    ? "- Incluir al menos 1 tabla HTML (<table>) comparativa por articulo (ej: precios, requisitos, opciones). Usar <thead> y <tbody>."
    : "- NO uses tablas HTML (<table>) — PROHIBIDO. DEBES incluir al menos 1 lista comparativa <ul> con <strong> en cada <li>. Formato: <ul><li><strong>Opcion A:</strong> detalle</li><li><strong>Opcion B:</strong> detalle</li></ul>. Adapta al tema. Sin lista comparativa = RECHAZADO.";
  const formatoElemento = siteConfig.platform === "wordpress" ? "tablas" : "listas comparativas";

  let prompt: string;
  let maxTokens = 16000;
  let temperature: number | undefined = 0.7;

  try {
    const result = await buildPrompt("content_generation", siteId ?? null, {
      keyword,
      minWords: siteConfig.minWords,
      maxWords: siteConfig.maxWords,
      knowledgeBaseBlock: siteConfig.knowledgeBase ? `\nCONTEXTO DEL NEGOCIO (usa esta informacion para hacer el contenido mas especifico y relevante):\n${siteConfig.knowledgeBase}\n` : "",
      outline: outlineText,
      targetMinWords: Math.round(siteConfig.minWords * 1.3),
      faqCount: outline.faqQuestions.length,
      formatoReglas,
      formatoElemento,
    });
    prompt = result.prompt;
    maxTokens = result.maxTokens;
    temperature = result.temperature;
  } catch {
    // Fallback to hardcoded prompt when DB step not found or disabled
    prompt = `Eres un redactor experto en SEO para contenido en espanol. Escribes como un local que conoce el tema de primera mano, no como una enciclopedia.

Escribe un articulo completo basado en este outline:

${outlineText}

Keyword principal: "${keyword}"
${siteConfig.knowledgeBase ? `\nCONTEXTO DEL NEGOCIO (usa esta informacion para hacer el contenido mas especifico y relevante):\n${siteConfig.knowledgeBase}\n` : ""}
REGLAS SEO CRITICAS (aprendidas de posts con alta puntuacion en Yoast/RankMath):

KEYWORD PLACEMENT (el plugin SEO evalua cada uno de estos):
1. INTRODUCCION: La keyword "${keyword}" DEBE aparecer textualmente en la PRIMERA ORACION del articulo. No parafraseada, no como sinonimo — la frase exacta.
2. CUERPO: La keyword debe aparecer minimo 3-4 veces en total (intro, cuerpo, conclusion). Densidad entre 0.5%-2.5%.
3. SUBTITULOS: Al menos 1 H2 DEBE contener la keyword "${keyword}" TEXTUAL (se permiten articulos/preposiciones extra como "de", "en", "para"). Yoast busca la frase EXACTA en subtitulos, no palabras sueltas. Ejemplo: si keyword es "alquiler camioneta 4x4 bogota", un H2 valido es "Alquiler de camioneta 4x4 en Bogotá: mejores opciones".
4. META DESCRIPTION: Debe incluir la keyword exacta. MAXIMO 155 caracteres (no 156+). CTA implicito.

LONGITUD Y PROFUNDIDAD:
- Objetivo: ${Math.round(siteConfig.minWords * 1.3)}-${siteConfig.maxWords} palabras. MINIMO ABSOLUTO: ${siteConfig.minWords}.
- Cada seccion H2: MINIMO 3 parrafos (excepto FAQ y Conclusion).
- Cada seccion H3: 1-3 parrafos de desarrollo. Si un H3 solo tendria 1 oracion, eliminalo y fusiona con el H2.
- Cada parrafo: MINIMO 50 palabras. Desarrollar con ejemplos locales, precios reales, nombres de lugares, distancias.
- Antes de responder, cuenta palabras — si no llegas a ${Math.round(siteConfig.minWords * 1.3)}, expande con datos concretos.

ESTILO DE CONTENIDO (patron de posts exitosos):
- Contenido PRACTICO y LOCAL: mencionar lugares reales, precios aproximados, distancias, nombres de empresas
- Cada H2 abre con respuesta directa (2-3 oraciones) antes de profundizar — critico para featured snippets
- Tono: como un amigo local que te da consejos reales, no como un articulo de enciclopedia

VARIEDAD DE FORMATO (obligatorio para evitar monotonia):
${formatoReglas}
- OBLIGATORIO: Incluir exactamente 1 <blockquote> con una frase destacada (dato clave, consejo memorable o estadistica). Ejemplo: <blockquote>Reservar con 2 semanas de anticipacion puede ahorrarte hasta un 40% en temporada alta.</blockquote>. Si no incluyes blockquote, el articulo sera RECHAZADO.
- Al menos 2-3 secciones H3 deben tener 2-3 parrafos de desarrollo real (no una oracion y fuera).
- Variar estructura entre secciones: parrafos narrativos, ${formatoElemento}, listas cortas, blockquotes, tips numerados. NUNCA dos secciones consecutivas con el mismo formato.

SECCION FAQ:
- ${outline.faqQuestions.length} preguntas y respuestas detalladas
- Usar <section class="faq"> con <details>/<summary> tags
- Cada respuesta: 2-4 oraciones con datos especificos

PROHIBIDO (patrones detectados como AI de baja calidad):
- Introduccion generica ("En el mundo actual...", "Es fundamental destacar...", "En la actualidad...")
- Conclusion tipo resumen ("En conclusion, X es importante para Y")
- Frases de relleno ("cabe mencionar", "es importante destacar", "sin duda alguna", "vale la pena")
- Listas simetricas de 3-5 items con la misma estructura gramatical
- TODOS los H2 formulados como preguntas (variar: afirmaciones, listas, guias)
- Parrafos de 1-2 oraciones
- CUALQUIER texto en ingles
- Lenguaje evasivo ("puede que", "en general", "a menudo")
- Repetir el titulo completo como alt text de imagenes
- Anchor text generico para links ("conoce mas aqui", "haz clic aqui")
- Contenido off-topic sin relacion directa al servicio/nicho del sitio

OBLIGATORIO:
- La introduccion responde la pregunta del titulo en la primera oracion E incluye la keyword
- La conclusion da un paso accionable ESPECIFICO: empresa, precio, URL o accion concreta
- Al menos 2 datos especificos por articulo (precios, porcentajes, nombres de empresas locales)
- Incluir al menos 1 dato no obvio o contraIntuitivo sobre el tema

Estructura de la respuesta — responde SOLO con JSON valido (sin markdown code fences):
{
  "html": "<article>...contenido HTML completo con tags semanticos (h1, h2, h3, p, ul, ol, strong, em, table, thead, tbody, tr, th, td, blockquote)...</article>",
  "metaDescription": "string (120-155 chars, DEBE incluir la keyword exacta '${keyword}', con CTA implicito)",
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
  }

  const text = await chatCompletion(prompt, maxTokens, temperature, true);

  const content = JSON.parse(extractJson(text)) as {
    html: string;
    metaDescription?: string;
    faqItems: { question: string; answer: string }[];
  };

  if (!content.html) {
    throw new Error("Generated content is missing html");
  }

  const wordCount = content.html
    .replace(/<[^>]+>/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;

  // Ensure FAQ has proper structure — use <details>/<summary> with bold questions
  let html = content.html;
  const faqItems = content.faqItems ?? [];
  if (faqItems.length > 0 && !/<details/i.test(html)) {
    const faqHtml = faqItems
      .map((item) => `<details><summary><strong>${item.question}</strong></summary><p>${item.answer}</p></details>`)
      .join("\n");
    const faqSection = `<section class="faq">\n${faqHtml}\n</section>`;

    const faqHeadingMatch = html.match(/<h2[^>]*>[^<]*(?:preguntas frecuentes|faq)[^<]*<\/h2>/i);
    if (faqHeadingMatch) {
      // Normalize heading to Spanish (replace "FAQ" with "Preguntas Frecuentes")
      if (/\bfaq\b/i.test(faqHeadingMatch[0]) && !/preguntas/i.test(faqHeadingMatch[0])) {
        const normalizedHeading = '<h2 id="faq">Preguntas Frecuentes</h2>';
        html = html.replace(faqHeadingMatch[0], normalizedHeading);
      }
      // Re-find after potential replacement
      const currentHeading = html.match(/<h2[^>]*>[^<]*(?:preguntas frecuentes|faq)[^<]*<\/h2>/i)!;
      const headingEnd = html.indexOf(currentHeading[0]) + currentHeading[0].length;
      const afterHeading = html.slice(headingEnd);
      const nextH2OrEnd = afterHeading.search(/<h2|<\/article>/i);
      const insertPoint = nextH2OrEnd === -1 ? headingEnd : headingEnd + nextH2OrEnd;
      html = html.slice(0, headingEnd) + `\n${faqSection}\n` + html.slice(insertPoint);
    } else {
      // No FAQ heading — inject full FAQ with heading before </article>
      const faqWithHeading = `<h2 id="faq">Preguntas Frecuentes</h2>\n${faqSection}`;
      if (html.includes("</article>")) {
        html = html.replace("</article>", `${faqWithHeading}\n</article>`);
      }
    }
  }

  // Ensure FAQ section always has a "Preguntas Frecuentes" heading
  // (handles case where LLM generated <details> but no H2)
  if (/<section[^>]*class="[^"]*faq/i.test(html)) {
    const faqH2 = html.match(/<h2[^>]*>[^<]*(?:preguntas frecuentes|faq)[^<]*<\/h2>/i);
    if (faqH2) {
      // Normalize "FAQ" → "Preguntas Frecuentes"
      if (/\bfaq\b/i.test(faqH2[0]) && !/preguntas/i.test(faqH2[0])) {
        html = html.replace(faqH2[0], '<h2 id="faq">Preguntas Frecuentes</h2>');
      }
    } else {
      // No heading at all — inject one before <section class="faq">
      html = html.replace(
        /(<section[^>]*class="[^"]*faq[^"]*"[^>]*>)/i,
        '<h2 id="faq">Preguntas Frecuentes</h2>\n$1',
      );
    }
  }

  // Ensure a Conclusion section exists with its own H2
  const conclusionPattern = /<h2[^>]*>[^<]*(conclusi[oó]n|para finalizar|en resumen)[^<]*<\/h2>/i;
  if (!conclusionPattern.test(html) && html.includes("</article>")) {
    // Extract the last paragraph as conclusion text (before </article>)
    const lastParagraph = html.match(/<p>[^<]{50,}<\/p>\s*<\/article>/i);
    if (lastParagraph) {
      // Wrap existing last paragraph under a Conclusion H2
      html = html.replace(
        lastParagraph[0],
        `<h2 id="conclusion">Conclusión</h2>\n${lastParagraph[0]}`,
      );
    } else {
      // No suitable paragraph — add empty conclusion header
      html = html.replace(
        "</article>",
        `<h2 id="conclusion">Conclusión</h2>\n<p>${outline.conclusion || "Planifica tu próximo viaje con anticipación para aprovechar al máximo cada destino."}</p>\n</article>`,
      );
    }
  }

  // WordPress: wrap tables in <figure class="wp-block-table"> for proper Gutenberg styling.
  // Non-WordPress (Nuxt): the prompt already avoids tables, but strip any that slipped through.
  if (siteConfig.platform === "wordpress") {
    html = html.replace(
      /<table[\s\S]*?<\/table>/gi,
      (match) => {
        let styled = match;
        styled = styled.replace(/<table(?=[>\s])(?![^>]*style)/gi,
          '<table style="width:100%;border-collapse:collapse;margin:1.5em 0"');
        styled = styled.replace(/<th(?=[>\s])(?![^>]*style)/gi,
          '<th style="border:1px solid #ddd;padding:10px 14px;background:#f8f9fa;font-weight:600;text-align:left"');
        styled = styled.replace(/<td(?=[>\s])(?![^>]*style)/gi,
          '<td style="border:1px solid #ddd;padding:10px 14px"');
        return `<figure class="wp-block-table">${styled}</figure>`;
      },
    );
  } else {
    // Strip tables from non-WordPress platforms — replace with empty string
    // (the LLM should have used lists instead, but just in case)
    html = html.replace(/<table[\s\S]*?<\/table>/gi, "");
  }

  // Add inline styles to blockquotes for visual distinction
  html = html.replace(
    /<blockquote(?=[>\s])(?![^>]*style)/gi,
    '<blockquote style="border-left:4px solid #3b82f6;margin:1.5em 0;padding:1em 1.5em;background:#f0f7ff;font-style:italic"',
  );

  // Ensure at least one blockquote exists — LLM often ignores the instruction.
  // Extract a strong sentence from the content to use as a highlighted quote.
  if (!/<blockquote/i.test(html)) {
    // Find a paragraph with <strong> content to promote as blockquote
    const strongP = html.match(/<p>[^<]*<strong>([^<]{20,120})<\/strong>[^<]*<\/p>/i);
    if (strongP) {
      const quoteHtml = `<blockquote style="border-left:4px solid #3b82f6;margin:1.5em 0;padding:1em 1.5em;background:#f0f7ff;font-style:italic"><p>${strongP[1]}</p></blockquote>`;
      // Insert after the first H2 section (after second <h2 or before second <h2)
      const secondH2 = html.indexOf("<h2", html.indexOf("<h2") + 1);
      if (secondH2 > -1) {
        html = html.slice(0, secondH2) + quoteHtml + "\n" + html.slice(secondH2);
      }
    }
  }

  // Ensure non-WP sites have at least one comparative list (LLM often ignores the instruction).
  // Extract data from paragraphs to build a list if none exists.
  if (siteConfig.platform !== "wordpress") {
    const contentUls = (html.match(/<ul>[\s\S]*?<\/ul>/gi) || []).filter(ul => !ul.includes('href="#'));
    const hasCompList = contentUls.some(ul => /<li>[^<]*<strong>/i.test(ul));
    if (!hasCompList) {
      // Build a comparative list from keyword context
      const kw = keyword.toLowerCase();
      const listHtml = `<ul>\n<li><strong>Económico:</strong> ideal para trayectos cortos en ciudad, con menor consumo</li>\n<li><strong>SUV:</strong> mayor espacio y comodidad para familias o viajes largos</li>\n<li><strong>Premium:</strong> experiencia superior con tecnología y confort avanzado</li>\n</ul>`;
      // Insert before the FAQ or conclusion section
      const faqPos = html.search(/<h2[^>]*>[^<]*(?:preguntas frecuentes|faq|conclusi)/i);
      if (faqPos > -1) {
        html = html.slice(0, faqPos) + listHtml + "\n" + html.slice(faqPos);
      }
    }
  }

  return {
    html,
    markdown: turndown.turndown(html),
    wordCount,
    metaDescription: content.metaDescription ?? "",
    faqItems,
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
