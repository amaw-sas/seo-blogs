/**
 * Image generation using GPT Image 1 Mini.
 * All images compressed to WebP via shared compressor utility.
 */

import OpenAI from "openai";
import sharp from "sharp";
import { compressToWebP } from "../../../worker/utils/image-compressor";

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
): Promise<GeneratedImage[]> {
  const images: GeneratedImage[] = [];

  for (let i = 0; i < count; i++) {
    const isHero = i === 0;
    const context = isHero ? title : (sectionContexts?.[i - 1] ?? title);
    const prompt = buildImagePrompt(context, keyword, isHero, knowledgeBase);

    const rawBuffer = await generateRawImage(prompt);
    const compressed = await compressToWebP(rawBuffer, 150);
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
async function generateRawImage(prompt: string): Promise<Buffer> {
  const client = getClient();
  const response = await client.images.generate({
    model: "gpt-image-1",
    prompt,
    n: 1,
    size: "1024x1024",
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
  // Alt text must include the keyword naturally for SEO plugin compliance.
  const trimmedContext = context.trim();
  const keywordLower = keyword.toLowerCase();

  if (trimmedContext) {
    const contextLower = trimmedContext.toLowerCase();
    if (contextLower.includes(keywordLower)) {
      return trimmedContext.length > 100 ? trimmedContext.slice(0, 100).trimEnd() : trimmedContext;
    }
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
): string {
  const noOverlays = "Absolutely nothing written, printed, or displayed in the image. No signs, banners, screens, posters, people, hands, or cameras.";
  // knowledgeBase is NOT injected into image prompts — it often contains brand names
  // (Kia, Chevrolet, Toyota, etc.) that the API rejects as trademark violations.
  const kbContext = "";

  if (isHero) {
    return `A photograph that visually represents: "${context}". The image should directly illustrate this specific topic — not a generic landscape.${kbContext} Warm natural light, vivid colors, travel magazine quality. Balanced square composition. ${noOverlays}`;
  }

  return `A detailed photograph that illustrates: "${context}". The image should show a specific scene, object, or environment directly related to this topic.${kbContext} Natural light, warm tones, shallow focus, editorial quality. Centered square composition. ${noOverlays}`;
}
