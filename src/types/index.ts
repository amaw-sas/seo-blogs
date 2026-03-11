export type PostStatus = "draft" | "review" | "published" | "archived" | "error";
export type KeywordStatus = "pending" | "used" | "skipped";
export type LinkType = "internal" | "external" | "conversion";
export type HolidayType = "national" | "commercial" | "lunar" | "custom";
export type SitePlatform = "wordpress" | "custom";

export interface SeoMetrics {
  keywordDensity: number;
  keywordFrequency: number;
  keywordDistribution: {
    firstHundredWords: boolean;
    inH2s: boolean;
    inBody: boolean;
    inConclusion: boolean;
  };
  readabilityScore: number;
  seoScore: number;
  wordCount: number;
  charCount: number;
  readingTimeMinutes: number;
  imageCount: number;
  internalLinkCount: number;
  externalLinkCount: number;
  hasFaq: boolean;
  hasSchema: boolean;
  hasConversionLink: boolean;
}

export interface GeneratedPost {
  title: string;
  slug: string;
  contentHtml: string;
  contentMarkdown: string;
  metaTitle: string;
  metaDescription: string;
  keyword: string;
  tags: string[];
  category: string;
  images: {
    url: string;
    altText: string;
    position: number;
    width: number;
    height: number;
    fileSize: number;
  }[];
  links: {
    url: string;
    anchorText: string;
    type: LinkType;
  }[];
  metrics: SeoMetrics;
  schemaJsonLd: Record<string, unknown>;
}
