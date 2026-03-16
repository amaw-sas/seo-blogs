/**
 * SEO metrics calculations for Spanish-language content.
 */

/**
 * Calculate keyword density as a percentage of total words.
 * Handles multi-word keywords by counting phrase occurrences.
 */
export function calculateKeywordDensity(text: string, keyword: string): number {
  const plainText = stripHtml(text);
  const words = plainText.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;

  const frequency = calculateKeywordFrequency(plainText, keyword);
  const keywordWordCount = keyword.split(/\s+/).length;

  return (frequency * keywordWordCount * 100) / words.length;
}

/**
 * Count how many times the keyword phrase appears in the text (case-insensitive).
 */
export function calculateKeywordFrequency(text: string, keyword: string): number {
  const plainText = stripDiacritics(stripHtml(text).toLowerCase());
  const kw = stripDiacritics(keyword.toLowerCase().trim());
  if (!kw) return 0;

  // Exact match first
  let count = 0;
  let pos = 0;
  while ((pos = plainText.indexOf(kw, pos)) !== -1) {
    count++;
    pos += kw.length;
  }
  if (count > 0) return count;

  // For multi-word keywords (>3 words), count partial matches
  // using sliding window of contentWords (min 3 words from keyword)
  const kwWords = kw.split(/\s+/).filter(Boolean);
  if (kwWords.length <= 3) return 0;

  const minWindow = 3;
  for (let windowSize = kwWords.length - 1; windowSize >= minWindow; windowSize--) {
    for (let start = 0; start <= kwWords.length - windowSize; start++) {
      const partial = kwWords.slice(start, start + windowSize).join(" ");
      let partialPos = 0;
      while ((partialPos = plainText.indexOf(partial, partialPos)) !== -1) {
        count++;
        partialPos += partial.length;
      }
    }
    if (count > 0) return count;
  }

  return 0;
}

/**
 * Estimate reading time in minutes assuming 200 wpm for Spanish content.
 */
export function calculateReadingTime(wordCount: number): number {
  const WPM = 200;
  return Math.max(1, Math.round(wordCount / WPM));
}

/**
 * Calculate readability using the Fernandez-Huerta formula (adapted for Spanish).
 *
 * FH = 206.84 - 0.60 * P - 1.02 * F
 *   P = average syllables per word * 100 (syllables per 100 words)
 *   F = average words per sentence (sentences per 100 words inverted)
 *
 * Returns a score 0-100 (higher = easier to read).
 */
export function calculateReadabilityScore(text: string): number {
  const plainText = stripHtml(text);
  const sentences = splitSentences(plainText);
  const words = plainText.split(/\s+/).filter(Boolean);

  if (words.length === 0 || sentences.length === 0) return 0;

  const totalSyllables = words.reduce((sum, w) => sum + countSpanishSyllables(w), 0);
  const avgSyllablesPerWord = totalSyllables / words.length;
  const avgWordsPerSentence = words.length / sentences.length;

  // Fernandez-Huerta formula
  const P = avgSyllablesPerWord * 100; // syllables per 100 words
  const F = avgWordsPerSentence;

  const score = 206.84 - 0.60 * P - 1.02 * F;
  return Math.max(0, Math.min(100, Math.round(score)));
}

// ── Helpers ──────────────────────────────────────────────────

function stripDiacritics(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function stripHtml(text: string): string {
  return text
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSentences(text: string): string[] {
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Approximate syllable count for a Spanish word.
 * Spanish syllabification: count vowel groups (diphthongs = 1 syllable).
 */
function countSpanishSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-záéíóúüñ]/g, "");
  if (w.length === 0) return 0;

  const vowels = "aeiouáéíóúü";
  const strongVowels = "aeoáéó";

  let syllables = 0;
  let prevWasVowel = false;
  let prevVowel = "";

  for (const char of w) {
    const isVowel = vowels.includes(char);
    if (isVowel) {
      if (!prevWasVowel) {
        syllables++;
      } else {
        // Two strong vowels = hiatus (separate syllables)
        const isHiatus =
          strongVowels.includes(char) && strongVowels.includes(prevVowel);
        // Accented weak vowel breaks diphthong
        const accentedWeak = "íú".includes(char) || "íú".includes(prevVowel);
        if (isHiatus || accentedWeak) {
          syllables++;
        }
      }
      prevVowel = char;
    }
    prevWasVowel = isVowel;
  }

  return Math.max(1, syllables);
}
