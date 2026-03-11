/**
 * JSON-LD structured data generation for SEO.
 */

export interface SchemaPostInput {
  title: string;
  slug: string;
  metaDescription: string;
  keyword: string;
  contentHtml: string;
  publishedAt?: Date | string | null;
  images: { url: string; altText: string; width: number; height: number }[];
  wordCount: number;
  readingTimeMinutes: number;
  hasFaq: boolean;
  faqItems?: { question: string; answer: string }[];
}

export interface SchemaSiteInput {
  domain: string;
  name: string;
}

/**
 * Generate JSON-LD Article schema compliant with Google's structured data guidelines.
 */
export function generateArticleSchema(
  post: SchemaPostInput,
  site: SchemaSiteInput,
): Record<string, unknown> {
  const baseUrl = `https://${site.domain}`;
  const articleUrl = `${baseUrl}/${post.slug}`;
  const publishDate =
    post.publishedAt instanceof Date
      ? post.publishedAt.toISOString()
      : post.publishedAt ?? new Date().toISOString();

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.metaDescription,
    url: articleUrl,
    datePublished: publishDate,
    dateModified: publishDate,
    author: {
      "@type": "Organization",
      name: site.name,
      url: baseUrl,
    },
    publisher: {
      "@type": "Organization",
      name: site.name,
      url: baseUrl,
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": articleUrl,
    },
    inLanguage: "es",
    wordCount: post.wordCount,
    timeRequired: `PT${post.readingTimeMinutes}M`,
    keywords: post.keyword,
  };

  if (post.images.length > 0) {
    schema.image = post.images.map((img) => ({
      "@type": "ImageObject",
      url: img.url,
      width: img.width,
      height: img.height,
      caption: img.altText,
    }));
  }

  // FAQPage schema as part of the article
  if (post.hasFaq && post.faqItems && post.faqItems.length > 0) {
    schema["@graph"] = [
      {
        "@type": "FAQPage",
        mainEntity: post.faqItems.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: faq.answer,
          },
        })),
      },
    ];
  }

  return schema;
}
