import { describe, it, expect } from "vitest";
import { generateArticleSchema, type SchemaPostInput, type SchemaSiteInput } from "./schema-markup";

const site: SchemaSiteInput = { domain: "example.com", name: "Test Blog" };

function makePost(overrides: Partial<SchemaPostInput> = {}): SchemaPostInput {
  return {
    title: "Guía completa de SEO",
    slug: "guia-completa-de-seo",
    metaDescription: "Aprende SEO desde cero.",
    keyword: "seo",
    contentHtml: "<article><p>Contenido</p></article>",
    publishedAt: new Date("2025-01-15T12:00:00Z"),
    images: [],
    wordCount: 1500,
    readingTimeMinutes: 8,
    hasFaq: false,
    ...overrides,
  };
}

describe("generateArticleSchema", () => {
  it("produces valid Article schema with required fields", () => {
    const schema = generateArticleSchema(makePost(), site);
    expect(schema["@context"]).toBe("https://schema.org");
    expect(schema["@type"]).toBe("Article");
    expect(schema.headline).toBe("Guía completa de SEO");
    expect(schema.inLanguage).toBe("es");
  });

  it("builds correct URL from domain and slug", () => {
    const schema = generateArticleSchema(makePost(), site);
    expect(schema.url).toBe("https://example.com/guia-completa-de-seo");
  });

  it("sets author and publisher as Organization", () => {
    const schema = generateArticleSchema(makePost(), site);
    const author = schema.author as Record<string, string>;
    expect(author["@type"]).toBe("Organization");
    expect(author.name).toBe("Test Blog");
  });

  it("formats timeRequired as ISO 8601 duration", () => {
    const schema = generateArticleSchema(makePost({ readingTimeMinutes: 5 }), site);
    expect(schema.timeRequired).toBe("PT5M");
  });

  it("includes image objects when images are provided", () => {
    const post = makePost({
      images: [{ url: "https://img.com/1.webp", altText: "Alt 1", width: 800, height: 600 }],
    });
    const schema = generateArticleSchema(post, site);
    const images = schema.image as Record<string, unknown>[];
    expect(images).toHaveLength(1);
    expect(images[0]["@type"]).toBe("ImageObject");
    expect(images[0].url).toBe("https://img.com/1.webp");
  });

  it("omits image field when no images", () => {
    const schema = generateArticleSchema(makePost(), site);
    expect(schema.image).toBeUndefined();
  });

  it("includes FAQPage graph when hasFaq is true with items", () => {
    const post = makePost({
      hasFaq: true,
      faqItems: [{ question: "¿Qué es SEO?", answer: "Optimización." }],
    });
    const schema = generateArticleSchema(post, site);
    const graph = schema["@graph"] as Record<string, unknown>[];
    expect(graph).toHaveLength(1);
    expect(graph[0]["@type"]).toBe("FAQPage");
  });

  it("omits FAQ graph when hasFaq is false", () => {
    const schema = generateArticleSchema(makePost({ hasFaq: false }), site);
    expect(schema["@graph"]).toBeUndefined();
  });

  it("handles string publishedAt", () => {
    const schema = generateArticleSchema(
      makePost({ publishedAt: "2025-06-01T00:00:00Z" }),
      site,
    );
    expect(schema.datePublished).toBe("2025-06-01T00:00:00Z");
  });

  it("handles null publishedAt by using current date", () => {
    const schema = generateArticleSchema(makePost({ publishedAt: null }), site);
    // Should be a valid ISO string (today)
    expect(typeof schema.datePublished).toBe("string");
    expect((schema.datePublished as string).length).toBeGreaterThan(0);
  });
});
