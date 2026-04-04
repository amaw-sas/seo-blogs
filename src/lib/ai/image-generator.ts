/**
 * Image generation using GPT Image 1 Mini.
 * All images compressed to WebP via shared compressor utility.
 */

import OpenAI from "openai";
import sharp from "sharp";
import { compressHero, compressContent } from "../../../worker/utils/image-compressor";

export interface GeneratedImage {
  buffer: Buffer;
  altText: string;
  width: number;
  height: number;
  fileSize: number;
}

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  return new OpenAI({ apiKey });
}

/**
 * Generate post images using GPT Image 1 Mini and compress to WebP <= maxSizeKB.
 */
export async function generatePostImages(
  title: string,
  keyword: string,
  count: number = 2,
  sectionContexts?: string[],
  knowledgeBase?: string | null,
  interpretation?: { angle: string; intent: string } | null,
): Promise<GeneratedImage[]> {
  const images: GeneratedImage[] = [];

  for (let i = 0; i < count; i++) {
    const isHero = i === 0;
    const context = isHero ? title : (sectionContexts?.[i - 1] ?? title);
    const prompt = buildImagePrompt(context, keyword, isHero, knowledgeBase, interpretation);
    const size = isHero ? "1024x1024" : "1536x1024";

    const rawBuffer = await generateRawImage(prompt, size);
    const compressed = isHero ? await compressHero(rawBuffer) : await compressContent(rawBuffer);
    const metadata = await sharp(compressed).metadata();
    const altText = generateAltText("", keyword, isHero, i, context);

    images.push({
      buffer: compressed,
      altText,
      width: metadata.width ?? 1024,
      height: metadata.height ?? 1024,
      fileSize: compressed.length,
    });
  }

  return images;
}

/**
 * Generate a single image with GPT Image 1 Mini.
 * Used by pre-generation endpoint to populate the pool.
 */
export async function generateSingleImage(prompt: string): Promise<Buffer> {
  return generateRawImage(prompt);
}

/**
 * Generate a raw image buffer using GPT Image 1 Mini.
 */
async function generateRawImage(
  prompt: string,
  size: "1024x1024" | "1536x1024" | "1024x1536" = "1024x1024",
): Promise<Buffer> {
  const client = getClient();
  const response = await client.images.generate({
    model: "gpt-image-1",
    prompt,
    n: 1,
    size,
    quality: "medium",
  });

  const b64Data = response.data?.[0]?.b64_json;
  if (!b64Data) {
    throw new Error("GPT Image 1 returned no image data");
  }
  return Buffer.from(b64Data, "base64");
}

// ── Helpers ──────────────────────────────────────────────────

export function generateAltText(
  _revisedPrompt: string,
  keyword: string,
  isHero: boolean,
  _index: number,
  context: string,
): string {
  // Alt text must include the keyword as an exact phrase for SEO plugin compliance.
  // Uses word boundaries to avoid partial substring matches (e.g. "carro" matching "carrotanque").
  const trimmedContext = context.trim();
  const normalize = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const kwNorm = normalize(keyword);
  // Word-boundary regex: \b doesn't work well with Spanish diacritics, so use lookaround on \s and ^/$
  const kwPattern = new RegExp(`(?:^|\\s)${kwNorm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`);

  if (trimmedContext) {
    const contextNorm = normalize(trimmedContext);
    if (kwPattern.test(contextNorm)) {
      return trimmedContext.length > 100 ? trimmedContext.slice(0, 100).trimEnd() : trimmedContext;
    }
    // Keyword not found as exact phrase — force "{keyword} — {context}" format
    const combined = `${keyword} — ${trimmedContext}`;
    return combined.length > 100 ? combined.slice(0, 100).trimEnd() : combined;
  }

  return isHero
    ? `Fotografia sobre ${keyword}`
    : `Detalle visual relacionado con ${keyword}`;
}

export function buildImagePrompt(
  context: string,
  keyword: string,
  isHero: boolean,
  knowledgeBase?: string | null,
  interpretation?: { angle: string; intent: string } | null,
): string {
  const style = "Documentary photography, candid, realistic, slightly imperfect framing. Latin American urban/rural context.";
  const prohibition = "Never depict documents, IDs, licenses, certificates, or any surface with text. Show the contextual scene instead. No signs, banners, screens, posters, people, hands, or cameras.";
  const interpretationContext = interpretation
    ? ` The article's angle: ${interpretation.angle}. The user is looking for: ${interpretation.intent}.`
    : "";

  if (isHero) {
    return `A photograph that visually represents: "${context}".${interpretationContext} ${style} Warm natural light, vivid colors. Balanced square composition. ${prohibition}`;
  }

  return `A detailed photograph that illustrates: "${context}".${interpretationContext} ${style} Natural light, warm tones, shallow depth of field. Landscape composition. ${prohibition}`;
}
