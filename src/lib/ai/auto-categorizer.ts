/**
 * AI-powered auto-categorization using Claude.
 * Assigns posts to the best existing category or suggests a new one.
 */

import Anthropic from "@anthropic-ai/sdk";

// ── Types ────────────────────────────────────────────────────

export interface CategorySuggestion {
  categorySlug: string;
  categoryName: string;
  isNew: boolean;
}

interface ExistingCategory {
  slug: string;
  name: string;
}

// ── Public API ───────────────────────────────────────────────

/**
 * Use Claude to determine the best category for a post based on its title and keyword.
 *
 * - If an existing category fits, returns it with isNew: false.
 * - If no existing category fits, suggests a new one with isNew: true.
 */
export async function categorizePost(
  title: string,
  keyword: string,
  existingCategories: ExistingCategory[],
): Promise<CategorySuggestion> {
  // If no existing categories, always suggest a new one
  if (existingCategories.length === 0) {
    return suggestNewCategory(title, keyword);
  }

  const client = getClient();

  const categoriesList = existingCategories
    .map((c) => `- ${c.name} (slug: ${c.slug})`)
    .join("\n");

  const prompt = `Eres un experto en SEO y clasificacion de contenido en espanol.

Dado el siguiente articulo:
- Titulo: "${title}"
- Keyword principal: "${keyword}"

Y estas categorias existentes:
${categoriesList}

Determina la mejor categoria para este articulo.

Reglas:
1. Si una categoria existente encaja bien (>70% de relevancia semantica), usala.
2. Si ninguna categoria existente encaja, sugiere una nueva categoria en espanol.
3. El slug debe ser en minusculas, sin acentos, separado por guiones.

Responde SOLO con JSON valido (sin markdown code fences):
{
  "categorySlug": "string",
  "categoryName": "string",
  "isNew": boolean
}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 200,
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    // Fallback: assign to first category
    return {
      categorySlug: existingCategories[0]!.slug,
      categoryName: existingCategories[0]!.name,
      isNew: false,
    };
  }

  const result = JSON.parse(jsonMatch[0]) as CategorySuggestion;

  // Validate the response references a real category when isNew is false
  if (!result.isNew) {
    const match = existingCategories.find(
      (c) => c.slug === result.categorySlug,
    );
    if (!match) {
      // Claude hallucinated a slug — try to find by name
      const nameMatch = existingCategories.find(
        (c) => c.name.toLowerCase() === result.categoryName.toLowerCase(),
      );
      if (nameMatch) {
        result.categorySlug = nameMatch.slug;
        result.categoryName = nameMatch.name;
      } else {
        // Mark as new since the suggested existing category doesn't exist
        result.isNew = true;
        result.categorySlug = generateSlug(result.categoryName);
      }
    }
  } else {
    // Ensure slug is properly formatted for new categories
    result.categorySlug = generateSlug(result.categoryName);
  }

  return result;
}

// ── Helpers ──────────────────────────────────────────────────

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({ apiKey });
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

async function suggestNewCategory(
  title: string,
  keyword: string,
): Promise<CategorySuggestion> {
  const client = getClient();

  const prompt = `Eres un experto en SEO. Sugiere UNA categoria en espanol para este articulo:
- Titulo: "${title}"
- Keyword: "${keyword}"

La categoria debe ser:
- General (para agrupar articulos similares en el futuro)
- En espanol
- Corta (2-4 palabras maximo)

Responde SOLO con JSON valido (sin markdown code fences):
{
  "categorySlug": "string (minusculas, sin acentos, guiones)",
  "categoryName": "string"
}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 100,
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    // Hardcoded fallback
    const slug = generateSlug(keyword);
    return {
      categorySlug: slug || "general",
      categoryName: keyword || "General",
      isNew: true,
    };
  }

  const result = JSON.parse(jsonMatch[0]) as {
    categorySlug: string;
    categoryName: string;
  };

  return {
    categorySlug: generateSlug(result.categoryName),
    categoryName: result.categoryName,
    isNew: true,
  };
}
