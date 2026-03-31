/**
 * AI-powered auto-categorization using OpenAI.
 * Assigns posts to the best existing category or suggests a new one.
 */

import { chatCompletion } from "./openai-client";
import { buildPrompt } from "./prompt-builder";

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
  siteId?: string,
): Promise<CategorySuggestion> {
  // If no existing categories, always suggest a new one
  if (existingCategories.length === 0) {
    return suggestNewCategory(title, keyword);
  }

  const categoriesList = existingCategories
    .map((c) => `- ${c.name} (slug: ${c.slug})`)
    .join("\n");

  let prompt: string;
  let maxTokens = 200;

  try {
    const result = await buildPrompt("auto_categorization", siteId ?? null, {
      title,
      keyword,
      categoriesList,
    });
    prompt = result.prompt;
    maxTokens = result.maxTokens;
  } catch {
    // Fallback to hardcoded prompt when DB step not found or disabled
    prompt = `Eres un experto en SEO y clasificacion de contenido en espanol.

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
  }

  const text = await chatCompletion(prompt, maxTokens);

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

  const text = await chatCompletion(prompt, 100);

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
