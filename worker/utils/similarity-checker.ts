/**
 * Keyword cannibalization detection using Jaccard similarity.
 */

export interface SimilarityResult {
  keyword: string;
  similarity: number;
  isCannibalization: boolean;
}

const CANNIBALIZATION_THRESHOLD = 0.4;

/**
 * Check if a new keyword cannibalizes any existing keywords.
 * Uses Jaccard similarity on word-level tokens.
 *
 * @returns Array of similar keywords with scores. Empty if no cannibalization detected.
 */
export function checkCannibalization(
  newKeyword: string,
  existingKeywords: string[],
): SimilarityResult[] {
  const newTokens = tokenize(newKeyword);
  const results: SimilarityResult[] = [];

  for (const existing of existingKeywords) {
    const existingTokens = tokenize(existing);
    const similarity = jaccardSimilarity(newTokens, existingTokens);

    results.push({
      keyword: existing,
      similarity: Math.round(similarity * 1000) / 1000,
      isCannibalization: similarity >= CANNIBALIZATION_THRESHOLD,
    });
  }

  return results
    .filter((r) => r.isCannibalization)
    .sort((a, b) => b.similarity - a.similarity);
}

// ── Helpers ──────────────────────────────────────────────────

/**
 * Tokenize a keyword into normalized word-level tokens.
 * Removes common Spanish stopwords to improve signal.
 */
function tokenize(text: string): Set<string> {
  const stopwords = new Set([
    "de",
    "la",
    "el",
    "en",
    "y",
    "a",
    "los",
    "las",
    "del",
    "un",
    "una",
    "por",
    "con",
    "para",
    "es",
    "al",
    "lo",
    "como",
    "su",
    "se",
    "que",
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^a-záéíóúüñ\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !stopwords.has(w));

  // Also add bigrams for better phrase matching
  const tokens = new Set(words);
  for (let i = 0; i < words.length - 1; i++) {
    tokens.add(`${words[i]}_${words[i + 1]}`);
  }

  return tokens;
}

/**
 * Jaccard similarity: |A ∩ B| / |A ∪ B|
 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;

  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }

  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
