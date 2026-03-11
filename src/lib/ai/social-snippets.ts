/**
 * Social media snippet generation using Claude API.
 * Generates platform-specific snippets for blog posts.
 */

import Anthropic from "@anthropic-ai/sdk";

// ── Types ────────────────────────────────────────────────────

export interface SocialSnippets {
  twitter: string;
  facebook: string;
  linkedin: string;
  instagram: string;
}

export interface PostForSnippets {
  title: string;
  keyword: string;
  metaDescription: string | null;
  contentHtml: string;
}

// ── Client ───────────────────────────────────────────────────

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({ apiKey });
}

// ── Generation ───────────────────────────────────────────────

/**
 * Generate social media snippets for all 4 platforms using Claude.
 */
export async function generateSocialSnippets(
  post: PostForSnippets,
): Promise<SocialSnippets> {
  const client = getClient();

  // Extract plain text summary (first 500 chars) to keep prompt concise
  const plainText = post.contentHtml
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);

  const prompt = `Eres un experto en marketing de contenidos y redes sociales en espanol.

Genera snippets para redes sociales basados en este articulo de blog:

Titulo: "${post.title}"
Keyword: "${post.keyword}"
Descripcion: "${post.metaDescription ?? "No disponible"}"
Resumen del contenido: "${plainText}..."

Genera snippets para cada plataforma con estas reglas:

1. Twitter/X: Maximo 280 caracteres. Incluye 2-3 hashtags relevantes. Tono directo y atractivo.
2. Facebook: 1-2 parrafos. Tono conversacional y engaging. Invita a la lectura.
3. LinkedIn: Tono profesional. 1-2 parrafos. Enfocado en valor y aprendizaje.
4. Instagram: Tono casual con emojis. Incluye 5-8 hashtags al final. Formato de caption atractivo.

IMPORTANTE: Todo en espanol.

Responde SOLO con JSON valido (sin markdown code fences):
{
  "twitter": "texto del tweet",
  "facebook": "texto para facebook",
  "linkedin": "texto para linkedin",
  "instagram": "texto para instagram"
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
    throw new Error("Failed to parse social snippets from Claude response");
  }

  const snippets = JSON.parse(jsonMatch[0]) as SocialSnippets;

  // Validate all fields exist
  if (!snippets.twitter || !snippets.facebook || !snippets.linkedin || !snippets.instagram) {
    throw new Error("Generated snippets are missing required platforms");
  }

  // Enforce Twitter character limit
  if (snippets.twitter.length > 280) {
    snippets.twitter = snippets.twitter.slice(0, 277) + "...";
  }

  return snippets;
}
