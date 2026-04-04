import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ── Prompt parts extracted from source files ────────────────

// competition-analyzer.ts (lines 27-44)
const COMPETITION_ANALYSIS = {
  promptBase: `Eres un experto en SEO y analisis de contenido competitivo.

Analiza la estructura tipica de contenido que ranquea en las primeras posiciones de Google para la keyword: "{{keyword}}"

Basandote en tu conocimiento de patrones de contenido SEO, proporciona:

1. **avgWordCount**: Estimacion del conteo promedio de palabras de los articulos top (numero entero)
2. **commonH2Topics**: Los 5-8 temas/secciones H2 mas comunes que cubren los articulos top
3. **contentGaps**: 3-5 temas o angulos que los articulos existentes NO cubren bien y representan oportunidades
4. **suggestedAngle**: Un angulo diferenciador especifico para nuestro articulo que lo haga unico frente a la competencia`,
  promptSections: {},
  responseFormat: `Responde SOLO con JSON valido (sin markdown code fences):
{
  "avgWordCount": 1800,
  "commonH2Topics": ["string"],
  "contentGaps": ["string"],
  "suggestedAngle": "string"
}`,
};

// content-generator.ts — generateOutline (lines 77-124)
const OUTLINE_GENERATION = {
  promptBase: `Eres un experto en SEO y redaccion de contenido en espanol.

Genera un outline detallado para un articulo de blog optimizado para la keyword: "{{keyword}}"
{{knowledgeBaseBlock}}{{competitionContext}}

REGLAS DE SEO APRENDIDAS (basadas en analisis de posts con alta puntuacion SEO):`,
  promptSections: {
    titulo_slug: {
      label: "Titulo y Slug",
      content: `TITULO Y SLUG:
- H1: keyword AL INICIO del titulo, seguida de ":" y un modificador descriptivo. MAXIMO 60 caracteres.
  BUENOS: "Renta autos Cartagena: guia para recorrer la ciudad", "Alquiler carro Cali barato: tips reales para ahorrar"
  MALOS: "Guia Completa sobre los Documentos Necesarios para Rentar un Carro en Bogota" (largo, keyword enterrada)
- metaTitle: version optimizada para CTR del H1, MAXIMO 60 caracteres, keyword al inicio
- El slug se generara automaticamente del keyword (3-5 palabras, sin stopwords). NO incluir "guia-completa", "descubre", "todo-lo-que-debes-saber" en el titulo.`,
      active: true,
    },
    estructura_headings: {
      label: "Estructura de Headings",
      content: `ESTRUCTURA DE HEADINGS:
- 4-7 secciones H2. NO todas deben ser preguntas — variar entre:
  * Afirmaciones directas: "Lugares imperdibles con renta de autos"
  * Listas con numero: "7 consejos clave para ahorrar"
  * Guias practicas: "Consejos para conducir en la ciudad"
  * Solo 1-2 H2s como pregunta: "¿Cuanto cuesta alquilar?"
- Cada H2 debe tener 0-3 H3 como maximo. Variar: algunas H2 sin H3, otras con 2-3.
- CRITICO PARA YOAST: Al menos 1 H2 debe contener la keyword "{{keyword}}" TEXTUAL (se permiten articulos/preposiciones extra). Ejemplo si keyword es "alquiler camioneta 4x4 bogota": "Alquiler de camioneta 4x4 en Bogotá: mejores opciones". Yoast busca la frase exacta, no palabras sueltas.
- Seccion de FAQ con 3-5 preguntas antes de la conclusion
- Seccion de conclusion al final
- PROHIBIDO: H2s que repitan la misma estructura gramatical ("¿Como X?", "¿Que Y?", "¿Cuales Z?" consecutivos)`,
      active: true,
    },
    relevancia_tematica: {
      label: "Relevancia Tematica",
      content: `RELEVANCIA TEMATICA:
- El contenido DEBE estar directamente relacionado con el nicho del sitio
- PROHIBIDO: posts off-topic (festividades religiosas, eventos culturales sin conexion directa al servicio)
- Cada seccion debe aportar valor practico: lugares, precios, requisitos, comparaciones, rutas`,
      active: true,
    },
  },
  responseFormat: `Responde SOLO con JSON valido (sin markdown code fences) con esta estructura:
{
  "h1": "string (max 60 chars, keyword al inicio)",
  "metaTitle": "string (max 60 chars, keyword al inicio, optimizado para CTR)",
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
}`,
};

// content-generator.ts — generateContent (lines 168-241)
const CONTENT_GENERATION = {
  promptBase: `Eres un redactor experto en SEO para contenido en espanol. Escribes como un local que conoce el tema de primera mano, no como una enciclopedia.

Escribe un articulo completo basado en este outline:

{{outline}}

Keyword principal: "{{keyword}}"
{{knowledgeBaseBlock}}
REGLAS SEO CRITICAS (aprendidas de posts con alta puntuacion en Yoast/RankMath):`,
  promptSections: {
    keyword_placement: {
      label: "Keyword Placement",
      content: `KEYWORD PLACEMENT (el plugin SEO evalua cada uno de estos):
1. INTRODUCCION: La keyword "{{keyword}}" DEBE aparecer textualmente en la PRIMERA ORACION del articulo. No parafraseada, no como sinonimo — la frase exacta.
2. CUERPO: La keyword debe aparecer minimo 3-4 veces en total (intro, cuerpo, conclusion). Densidad entre 0.5%-2.5%.
3. SUBTITULOS: Al menos 1 H2 DEBE contener la keyword "{{keyword}}" TEXTUAL (se permiten articulos/preposiciones extra como "de", "en", "para"). Yoast busca la frase EXACTA en subtitulos, no palabras sueltas. Ejemplo: si keyword es "alquiler camioneta 4x4 bogota", un H2 valido es "Alquiler de camioneta 4x4 en Bogotá: mejores opciones".
4. META DESCRIPTION: Debe incluir la keyword exacta. MAXIMO 155 caracteres (no 156+). CTA implicito.`,
      active: true,
    },
    longitud_profundidad: {
      label: "Longitud y Profundidad",
      content: `LONGITUD Y PROFUNDIDAD:
- Objetivo: {{targetMinWords}}-{{maxWords}} palabras. MINIMO ABSOLUTO: {{minWords}}.
- Cada seccion H2: MINIMO 3 parrafos (excepto FAQ y Conclusion).
- Cada seccion H3: 1-3 parrafos de desarrollo. Si un H3 solo tendria 1 oracion, eliminalo y fusiona con el H2.
- Cada parrafo: MINIMO 50 palabras. Desarrollar con ejemplos locales, precios reales, nombres de lugares, distancias.
- Antes de responder, cuenta palabras — si no llegas a {{targetMinWords}}, expande con datos concretos.`,
      active: true,
    },
    estilo: {
      label: "Estilo de Contenido",
      content: `ESTILO DE CONTENIDO (patron de posts exitosos):
- Contenido PRACTICO y LOCAL: mencionar lugares reales, precios aproximados, distancias, nombres de empresas
- Cada H2 abre con respuesta directa (2-3 oraciones) antes de profundizar — critico para featured snippets
- Tono: como un amigo local que te da consejos reales, no como un articulo de enciclopedia`,
      active: true,
    },
    variedad_formato: {
      label: "Variedad de Formato",
      content: `VARIEDAD DE FORMATO (obligatorio para evitar monotonia):
{{formatoReglas}}
- OBLIGATORIO: Incluir exactamente 1 <blockquote> con una frase destacada (dato clave, consejo memorable o estadistica). Ejemplo: <blockquote>Reservar con 2 semanas de anticipacion puede ahorrarte hasta un 40% en temporada alta.</blockquote>. Si no incluyes blockquote, el articulo sera RECHAZADO.
- Al menos 2-3 secciones H3 deben tener 2-3 parrafos de desarrollo real (no una oracion y fuera).
- Variar estructura entre secciones: parrafos narrativos, {{formatoElemento}}, listas cortas, blockquotes, tips numerados. NUNCA dos secciones consecutivas con el mismo formato.
- Puedes usar <figure><figcaption> para datos destacados con fuente (ej: <figure><blockquote>Dato importante</blockquote><figcaption>Fuente: Secretaria de Transito</figcaption></figure>). Maximo 1-2 por articulo.
- Puedes usar <hr> como separador visual entre secciones tematicamente distintas. Maximo 1-2 por articulo. No usar antes de FAQ ni antes de Conclusion.`,
      active: true,
    },
    seccion_faq: {
      label: "Seccion FAQ",
      content: `SECCION FAQ:
- {{faqCount}} preguntas y respuestas detalladas
- Usar <section class="faq"> con <details>/<summary> tags
- Cada respuesta: 2-4 oraciones con datos especificos`,
      active: true,
    },
    prohibido: {
      label: "Prohibido",
      content: `PROHIBIDO (patrones detectados como AI de baja calidad):
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
- Contenido off-topic sin relacion directa al servicio/nicho del sitio`,
      active: true,
    },
    obligatorio: {
      label: "Obligatorio",
      content: `OBLIGATORIO:
- La introduccion responde la pregunta del titulo en la primera oracion E incluye la keyword
- La conclusion da un paso accionable ESPECIFICO: empresa, precio, URL o accion concreta
- Al menos 2 datos especificos por articulo (precios, porcentajes, nombres de empresas locales)
- Incluir al menos 1 dato no obvio o contraIntuitivo sobre el tema`,
      active: true,
    },
  },
  responseFormat: `Estructura de la respuesta — responde SOLO con JSON valido (sin markdown code fences):
{
  "html": "<article>...contenido HTML completo con tags semanticos (h1, h2, h3, p, ul, ol, strong, em, table, thead, tbody, tr, th, td, blockquote)...</article>",
  "metaDescription": "string (120-155 chars, DEBE incluir la keyword exacta '{{keyword}}', con CTA implicito)",
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
- NO incluyas links, se insertaran despues`,
};

// image-generator.ts — buildImagePrompt (lines 113-129)
const IMAGE_GENERATION = {
  promptBase: `Generate an image prompt for a blog post about "{{keyword}}".

Context of the section: "{{context}}"`,
  promptSections: {
    prompt_style: {
      label: "Image Style",
      content: `Documentary photography, candid, realistic, slightly imperfect framing. Latin American urban/rural context.
Hero image: A photograph that visually represents: "{{context}}". Warm natural light, vivid colors. Balanced square composition.
Detail image: A detailed photograph that illustrates: "{{context}}". Natural light, warm tones, shallow depth of field. Landscape composition.`,
      active: true,
    },
    prohibitions: {
      label: "Prohibitions",
      content:
        "Never depict documents, IDs, licenses, certificates, or any surface with text. Show the contextual scene instead. No signs, banners, screens, posters, people, hands, or cameras.",
      active: true,
    },
  },
  responseFormat: null,
};

// auto-categorizer.ts (lines 43-64)
const AUTO_CATEGORIZATION = {
  promptBase: `Eres un experto en SEO y clasificacion de contenido en espanol.

Dado el siguiente articulo:
- Titulo: "{{title}}"
- Keyword principal: "{{keyword}}"

Y estas categorias existentes:
{{categoriesList}}

Determina la mejor categoria para este articulo.

Reglas:
1. Si una categoria existente encaja bien (>70% de relevancia semantica), usala.
2. Si ninguna categoria existente encaja, sugiere una nueva categoria en espanol.
3. El slug debe ser en minusculas, sin acentos, separado por guiones.`,
  promptSections: {},
  responseFormat: `Responde SOLO con JSON valido (sin markdown code fences):
{
  "categorySlug": "string",
  "categoryName": "string",
  "isNew": boolean
}`,
};

// keyword-interpreter.ts (NEW)
const KEYWORD_INTERPRETATION = {
  promptBase: `Eres un experto en SEO y estrategia de contenido en espanol.

Analiza la siguiente keyword y determina la intencion del usuario, el angulo recomendado para el articulo, y como conectar el contenido con el negocio.

Keyword: "{{keyword}}"
Dominio del sitio: {{domain}}
{{knowledgeBaseBlock}}

Tu objetivo es interpretar QUE busca el usuario con esta keyword y COMO debemos enfocar el articulo para que sea util y relevante.`,
  promptSections: {
    intencion: {
      label: "Análisis de Intención",
      content: `ANALISIS DE INTENCION:
- Determina si la intencion es informacional, transaccional, navegacional o mixta
- Identifica la pregunta implicita del usuario
- Si la keyword es coloquial o local, interpreta el significado real (ej: "carro barato bogota" = "opciones economicas de alquiler de vehiculo en Bogota")
- Considera el contexto del dominio para la interpretacion`,
      active: true,
    },
    angulo: {
      label: "Ángulo Recomendado",
      content: `ANGULO RECOMENDADO:
- Sugiere un angulo especifico y diferenciador para el articulo
- El angulo debe ser practico y accionable, no generico
- Debe conectar con la experiencia real del usuario
- Evitar angulos genericos como "guia completa" o "todo lo que debes saber"`,
      active: true,
    },
    profundidad: {
      label: "Profundidad Sugerida",
      content: `PROFUNDIDAD Y LONGITUD:
- Basandote en la complejidad del tema y la intencion del usuario, recomienda:
  - depth: "light" (500-1000 palabras) para keywords simples/transaccionales directas
  - depth: "medium" (1500-2500 palabras) para keywords informacionales estandar
  - depth: "deep" (2500-4000 palabras) para keywords complejas/comparativas/guias
- Sugiere un rango de palabras especifico (min, max)`,
      active: true,
    },
  },
  responseFormat: `Responde SOLO con JSON valido (sin markdown code fences):
{
  "userIntent": "string — que busca el usuario con esta keyword",
  "recommendedAngle": "string — angulo especifico para el articulo",
  "businessConnection": "string — como conectar con el negocio/servicio del sitio",
  "suggestedWordRange": { "min": number, "max": number },
  "depth": "light" | "medium" | "deep"
}`,
};

// ── Step definitions ────────────────────────────────────────

interface StepData {
  stepKey: string;
  label: string;
  description: string;
  order: number;
  active: boolean;
  hasPrompt: boolean;
  promptBase: string | null;
  promptSections: Prisma.InputJsonValue;
  responseFormat: string | null;
  model: string;
  maxTokens: number;
  temperature: number | null;
}

const steps: StepData[] = [
  {
    stepKey: "keyword_selection",
    label: "Selección de Keyword",
    description:
      "Selecciona la siguiente keyword pendiente del pool del sitio, priorizando por prioridad y orden de creación.",
    order: 1,
    active: true,
    hasPrompt: false,
    promptBase: null,
    promptSections: {},
    responseFormat: null,
    model: "gpt-4.1",
    maxTokens: 2000,
    temperature: null,
  },
  {
    stepKey: "keyword_interpretation",
    label: "Interpretación de Keyword",
    description:
      "Analiza la keyword para determinar intención del usuario, ángulo recomendado, conexión con el negocio y profundidad sugerida.",
    order: 2,
    active: true,
    hasPrompt: true,
    promptBase: KEYWORD_INTERPRETATION.promptBase,
    promptSections: KEYWORD_INTERPRETATION.promptSections,
    responseFormat: KEYWORD_INTERPRETATION.responseFormat,
    model: "gpt-4.1",
    maxTokens: 1000,
    temperature: null,
  },
  {
    stepKey: "competition_analysis",
    label: "Análisis de Competencia",
    description:
      "Analiza la estructura de contenido que ranquea en Google para la keyword y devuelve insights sobre temas comunes, brechas y ángulo diferenciador.",
    order: 3,
    active: true,
    hasPrompt: true,
    promptBase: COMPETITION_ANALYSIS.promptBase,
    promptSections: COMPETITION_ANALYSIS.promptSections,
    responseFormat: COMPETITION_ANALYSIS.responseFormat,
    model: "gpt-4.1",
    maxTokens: 1500,
    temperature: null,
  },
  {
    stepKey: "outline_generation",
    label: "Generación de Outline",
    description:
      "Genera el outline del artículo: H1, metaTitle, secciones H2/H3, preguntas FAQ y conclusión, optimizado para SEO.",
    order: 4,
    active: true,
    hasPrompt: true,
    promptBase: OUTLINE_GENERATION.promptBase,
    promptSections: OUTLINE_GENERATION.promptSections,
    responseFormat: OUTLINE_GENERATION.responseFormat,
    model: "gpt-4.1",
    maxTokens: 2000,
    temperature: null,
  },
  {
    stepKey: "content_generation",
    label: "Generación de Contenido",
    description:
      "Genera el artículo HTML completo a partir del outline, con keyword placement, FAQ, formato variado y reglas SEO estrictas.",
    order: 5,
    active: true,
    hasPrompt: true,
    promptBase: CONTENT_GENERATION.promptBase,
    promptSections: CONTENT_GENERATION.promptSections,
    responseFormat: CONTENT_GENERATION.responseFormat,
    model: "gpt-4.1",
    maxTokens: 16000,
    temperature: 0.7,
  },
  {
    stepKey: "image_generation",
    label: "Generación de Imágenes",
    description:
      "Construye prompts de imagen y genera imágenes hero + detalle para el artículo usando GPT Image 1 Mini.",
    order: 6,
    active: true,
    hasPrompt: true,
    promptBase: IMAGE_GENERATION.promptBase,
    promptSections: IMAGE_GENERATION.promptSections,
    responseFormat: IMAGE_GENERATION.responseFormat,
    model: "gpt-4.1",
    maxTokens: 500,
    temperature: null,
  },
  {
    stepKey: "seo_scoring",
    label: "Puntuación SEO",
    description:
      "Calcula métricas SEO del post generado: densidad de keyword, distribución, conteo de palabras, imágenes, links y presencia de FAQ/schema.",
    order: 7,
    active: true,
    hasPrompt: false,
    promptBase: null,
    promptSections: {},
    responseFormat: null,
    model: "gpt-4.1",
    maxTokens: 2000,
    temperature: null,
  },
  {
    stepKey: "post_save",
    label: "Guardar Post",
    description:
      "Persiste el post generado en la base de datos con status draft, incluyendo HTML, meta description, imágenes y métricas SEO.",
    order: 8,
    active: true,
    hasPrompt: false,
    promptBase: null,
    promptSections: {},
    responseFormat: null,
    model: "gpt-4.1",
    maxTokens: 2000,
    temperature: null,
  },
  {
    stepKey: "auto_categorization",
    label: "Categorización Automática",
    description:
      "Clasifica el post en una categoría existente o sugiere una nueva, basándose en título y keyword.",
    order: 9,
    active: true,
    hasPrompt: true,
    promptBase: AUTO_CATEGORIZATION.promptBase,
    promptSections: AUTO_CATEGORIZATION.promptSections,
    responseFormat: AUTO_CATEGORIZATION.responseFormat,
    model: "gpt-4.1",
    maxTokens: 200,
    temperature: null,
  },
  {
    stepKey: "auto_linking",
    label: "Enlaces Automáticos",
    description:
      "Inserta internal links contextuales hacia otros posts publicados del mismo sitio, con anchor text relevante.",
    order: 10,
    active: true,
    hasPrompt: false,
    promptBase: null,
    promptSections: {},
    responseFormat: null,
    model: "gpt-4.1",
    maxTokens: 2000,
    temperature: null,
  },
  {
    stepKey: "publishing",
    label: "Publicación",
    description:
      "Publica el post al blog externo via el conector configurado (WordPress REST API o custom) y actualiza el status a published.",
    order: 11,
    active: true,
    hasPrompt: false,
    promptBase: null,
    promptSections: {},
    responseFormat: null,
    model: "gpt-4.1",
    maxTokens: 2000,
    temperature: null,
  },
];

// ── Main ────────────────────────────────────────────────────

async function main() {
  console.log("Seeding pipeline steps...\n");

  for (const step of steps) {
    const { stepKey, ...data } = step;
    await prisma.pipelineStep.upsert({
      where: { stepKey },
      update: data,
      create: step,
    });
    console.log(`  ✓ ${stepKey}`);
  }

  console.log(`\nSeeded ${steps.length} pipeline steps.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
