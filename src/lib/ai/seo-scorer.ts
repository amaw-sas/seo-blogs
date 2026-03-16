/**
 * SEO scoring system for generated blog posts.
 * Evaluates content against a checklist and returns a score 0-100.
 */

import {
  calculateKeywordDensity,
  calculateKeywordFrequency,
  calculateReadingTime,
  calculateReadabilityScore,
} from "../seo/metrics";

// ── Types ────────────────────────────────────────────────────

export interface ScorerInput {
  contentHtml: string;
  keyword: string;
  metaTitle: string;
  metaDescription: string;
  slug: string;
  images: { altText: string }[];
  links: { type: "internal" | "external" | "conversion" }[];
  schemaJsonLd: Record<string, unknown> | null;
  existingPostCount: number;
}

export interface ScoreBreakdown {
  keywordInFirst100Words: { score: number; max: 10; pass: boolean };
  keywordInH2s: { score: number; max: 10; pass: boolean };
  faqPresent: { score: number; max: 10; pass: boolean };
  imagesWithAlt: { score: number; max: 10; pass: boolean };
  internalLinks: { score: number; max: 5; pass: boolean };
  externalLinks: { score: number; max: 5; pass: boolean };
  conversionLink: { score: number; max: 5; pass: boolean };
  metaTitleOptimal: { score: number; max: 10; pass: boolean };
  metaDescriptionOptimal: { score: number; max: 10; pass: boolean };
  keywordDensityOk: { score: number; max: 10; pass: boolean };
  schemaPresent: { score: number; max: 5; pass: boolean };
  conclusionPresent: { score: number; max: 5; pass: boolean };
  slugLength: { score: number; max: 5; pass: boolean };
  h1Length: { score: number; max: 5; pass: boolean };
}

export interface SeoScoreResult {
  totalScore: number;
  breakdown: ScoreBreakdown;
  keywordDensity: number;
  keywordFrequency: number;
  keywordDistribution: {
    firstHundredWords: boolean;
    inH2s: boolean;
    inBody: boolean;
    inConclusion: boolean;
  };
  wordCount: number;
  charCount: number;
  readingTimeMinutes: number;
  readabilityScore: number;
}

// ── Main Function ────────────────────────────────────────────

export function calculateSeoScore(post: ScorerInput): SeoScoreResult {
  const html = post.contentHtml;
  const kw = stripDiacritics(post.keyword.toLowerCase());
  const plainText = stripHtml(html);
  const plainLower = stripDiacritics(plainText.toLowerCase());

  const words = plainText.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const charCount = plainText.length;

  const density = calculateKeywordDensity(html, post.keyword);
  const frequency = calculateKeywordFrequency(html, post.keyword);
  const readingTime = calculateReadingTime(wordCount);
  const readability = calculateReadabilityScore(html);

  // Distribution checks
  const first100 = stripDiacritics(words.slice(0, 100).join(" ").toLowerCase());
  const firstHundredWords = first100.includes(kw);

  const h2Matches = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/gi) ?? [];
  const h2Texts = h2Matches.map((h) => stripDiacritics(stripHtml(h).toLowerCase()));
  const inH2s = h2Texts.some((t) => t.includes(kw));

  const inBody = plainLower.includes(kw);

  const conclusionPattern =
    /<h2[^>]*>[^<]*(conclusi[oó]n|resumen|para finalizar|en resumen)[^<]*<\/h2>/i;
  const hasConclusion = conclusionPattern.test(html);
  const conclusionIdx = html.search(conclusionPattern);
  const inConclusion =
    hasConclusion && conclusionIdx !== -1
      ? html.slice(conclusionIdx).toLowerCase().includes(kw)
      : false;

  // FAQ check
  const hasFaq =
    /<section[^>]*class="[^"]*faq[^"]*"/i.test(html) ||
    /preguntas frecuentes/i.test(html) ||
    /<details/i.test(html);

  // Images with alt text
  const imgMatches = html.match(/<img[^>]+alt="[^"]+"/gi) ?? [];
  const hasImagesWithAlt =
    post.images.length > 0 && post.images.every((img) => img.altText.length > 0);
  const imagesPass = hasImagesWithAlt || imgMatches.length > 0;

  // Links
  const internalLinks = post.links.filter((l) => l.type === "internal");
  const externalLinks = post.links.filter((l) => l.type === "external");
  const conversionLinks = post.links.filter((l) => l.type === "conversion");

  // Meta checks
  const metaTitleOk =
    post.metaTitle.length <= 60 && post.metaTitle.toLowerCase().includes(kw);
  const metaDescOk =
    post.metaDescription.length <= 160 &&
    post.metaDescription.toLowerCase().includes(kw);

  // Schema
  const hasSchema =
    post.schemaJsonLd !== null && Object.keys(post.schemaJsonLd).length > 0;

  // Density check
  const densityOk = density < 2.5 && density > 0;

  // Slug length check (max 5 words)
  const slugWords = post.slug.split("-").filter(Boolean).length;
  const slugOk = slugWords <= 5 && slugWords > 0;

  // H1 length check (max 70 chars)
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const h1Text = h1Match ? stripHtml(h1Match[1]) : "";
  const h1LengthOk = h1Text.length > 0 && h1Text.length <= 70;

  // Build breakdown
  const breakdown: ScoreBreakdown = {
    keywordInFirst100Words: {
      score: firstHundredWords ? 10 : 0,
      max: 10,
      pass: firstHundredWords,
    },
    keywordInH2s: { score: inH2s ? 10 : 0, max: 10, pass: inH2s },
    faqPresent: { score: hasFaq ? 10 : 0, max: 10, pass: hasFaq },
    imagesWithAlt: { score: imagesPass ? 10 : 0, max: 10, pass: imagesPass },
    internalLinks: {
      score: post.existingPostCount === 0 || internalLinks.length > 0 ? 5 : 0,
      max: 5,
      pass: post.existingPostCount === 0 || internalLinks.length > 0,
    },
    externalLinks: {
      score: externalLinks.length > 0 ? 5 : 0,
      max: 5,
      pass: externalLinks.length > 0,
    },
    conversionLink: {
      score: conversionLinks.length > 0 ? 5 : 0,
      max: 5,
      pass: conversionLinks.length > 0,
    },
    metaTitleOptimal: { score: metaTitleOk ? 10 : 0, max: 10, pass: metaTitleOk },
    metaDescriptionOptimal: {
      score: metaDescOk ? 10 : 0,
      max: 10,
      pass: metaDescOk,
    },
    keywordDensityOk: { score: densityOk ? 10 : 0, max: 10, pass: densityOk },
    schemaPresent: { score: hasSchema ? 5 : 0, max: 5, pass: hasSchema },
    conclusionPresent: {
      score: hasConclusion ? 5 : 0,
      max: 5,
      pass: hasConclusion,
    },
    slugLength: { score: slugOk ? 5 : 0, max: 5, pass: slugOk },
    h1Length: { score: h1LengthOk ? 5 : 0, max: 5, pass: h1LengthOk },
  };

  const totalScore = Object.values(breakdown).reduce(
    (sum, item) => sum + item.score,
    0,
  );

  return {
    totalScore,
    breakdown,
    keywordDensity: Math.round(density * 100) / 100,
    keywordFrequency: frequency,
    keywordDistribution: {
      firstHundredWords,
      inH2s,
      inBody,
      inConclusion,
    },
    wordCount,
    charCount,
    readingTimeMinutes: readingTime,
    readabilityScore: readability,
  };
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
