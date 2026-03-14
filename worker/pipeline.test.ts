import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────

const mockPrisma = vi.hoisted(() => {
  const createMockModel = () => ({
    findUniqueOrThrow: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  });
  return {
    site: createMockModel(),
    post: createMockModel(),
    keyword: createMockModel(),
    category: createMockModel(),
    publishLog: createMockModel(),
  };
});

const mockSupabaseStorage = vi.hoisted(() => ({
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
}));

vi.mock("@prisma/client", () => ({
  PrismaClient: class {
    site = mockPrisma.site;
    post = mockPrisma.post;
    keyword = mockPrisma.keyword;
    category = mockPrisma.category;
    publishLog = mockPrisma.publishLog;
  },
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => mockSupabaseStorage),
    },
  })),
}));

vi.mock("../src/lib/ai/content-generator", () => ({
  generateOutline: vi.fn(),
  generateContent: vi.fn(),
}));

vi.mock("../src/lib/ai/competition-analyzer", () => ({
  analyzeCompetition: vi.fn(),
}));

vi.mock("../src/lib/ai/image-generator", () => ({
  generatePostImages: vi.fn(),
}));

vi.mock("../src/lib/ai/auto-categorizer", () => ({
  categorizePost: vi.fn(),
}));

vi.mock("./connectors/wordpress", () => ({
  publishToWordPress: vi.fn(),
  uploadMediaToWordPress: vi.fn(),
}));

vi.mock("../src/lib/seo/auto-linker", () => ({
  addRetroactiveLinks: vi.fn(),
  addConversionLink: vi.fn(),
}));

// ── Imports (after mocks) ────────────────────────────────────

import { runPipeline } from "./pipeline";
import { generateOutline, generateContent } from "../src/lib/ai/content-generator";
import { analyzeCompetition } from "../src/lib/ai/competition-analyzer";
import { generatePostImages } from "../src/lib/ai/image-generator";
import { categorizePost } from "../src/lib/ai/auto-categorizer";
import { publishToWordPress, uploadMediaToWordPress } from "./connectors/wordpress";
import { addRetroactiveLinks, addConversionLink } from "../src/lib/seo/auto-linker";

// ── Fixtures ─────────────────────────────────────────────────

const SITE_ID = "site-1";
const KEYWORD_ID = "kw-1";
const POST_ID = "post-new";

function makeSite(overrides: Record<string, unknown> = {}) {
  return {
    id: SITE_ID,
    name: "Test Site",
    domain: "example.com",
    platform: "wordpress",
    apiUrl: "https://example.com/wp-json",
    apiUser: "admin",
    apiPassword: "secret",
    conversionUrl: "https://example.com/contacto",
    minWords: 1000,
    maxWords: 2000,
    authoritativeSources: ["https://moz.com", "https://ahrefs.com"],
    posts: [
      { id: "p-old", keyword: "old keyword", slug: "old-post", title: "Old Post" },
    ],
    keywords: [
      { id: KEYWORD_ID, phrase: "nueva keyword seo", status: "pending" },
    ],
    ...overrides,
  };
}

function makeOutline() {
  return {
    h1: "Guía Completa de SEO",
    sections: [
      { tag: "h2" as const, text: "Introducción al SEO" },
      { tag: "h2" as const, text: "Estrategias Avanzadas" },
      { tag: "h2" as const, text: "Conclusión" },
    ],
    faqQuestions: ["¿Qué es SEO?"],
    conclusion: "En resumen, el SEO es clave.",
    tableOfContents: ["Introducción", "Estrategias", "Conclusión"],
  };
}

function makeContent() {
  // Content must score >= 70 on calculateSeoScore (pure function, not mocked).
  // Keyword "nueva keyword seo" must appear: in first 100 words, in an H2, with proper density.
  // Must include: <details> (FAQ), conclusion H2, sufficient paragraphs.
  const html = [
    "<h1>Guía Completa de SEO</h1>",
    "<p>La nueva keyword seo es fundamental para cualquier estrategia digital moderna. En este artículo exploramos todo lo que necesitas saber sobre nueva keyword seo y cómo implementarla correctamente en tu sitio web para mejorar tu posicionamiento.</p>",
    "<h2>Qué es nueva keyword seo</h2>",
    "<p>La nueva keyword seo se refiere a las técnicas avanzadas de optimización que permiten mejorar el ranking de un sitio web en los motores de búsqueda de forma sostenible.</p>",
    "<h2>Estrategias Avanzadas</h2>",
    "<p>Existen múltiples estrategias de optimización que puedes aplicar para mejorar los resultados de tu sitio.</p>",
    "<p>Cada estrategia debe adaptarse al contexto específico de tu industria y audiencia objetivo.</p>",
    "<details><summary>¿Qué es nueva keyword seo?</summary><p>Es la optimización moderna.</p></details>",
    "<h2>Conclusión</h2>",
    "<p>En resumen, aplicar nueva keyword seo correctamente mejora la visibilidad y el tráfico orgánico de tu sitio web.</p>",
  ].join("\n");

  return {
    html,
    markdown: "# Guía Completa de SEO\n\nContent here",
    wordCount: 1500,
    faqItems: [{ question: "¿Qué es nueva keyword seo?", answer: "Es la optimización moderna." }],
  };
}

function makeCompetitionAnalysis() {
  return {
    avgWordCount: 1800,
    commonH2Topics: ["introducción", "beneficios", "herramientas"],
    contentGaps: ["SEO local", "voice search"],
    suggestedAngle: "enfoque práctico",
  };
}

function setupHappyPath(siteOverrides: Record<string, unknown> = {}) {
  const site = makeSite(siteOverrides);

  // Prisma
  mockPrisma.site.findUniqueOrThrow.mockResolvedValue(site);
  mockPrisma.post.create.mockResolvedValue({
    id: POST_ID,
    title: "Guía Completa de SEO",
    contentHtml: makeContent().html,
    siteId: SITE_ID,
  });
  mockPrisma.post.update.mockResolvedValue({ id: POST_ID });
  mockPrisma.keyword.update.mockResolvedValue({});
  mockPrisma.category.findMany.mockResolvedValue([
    { id: "cat-1", slug: "seo", name: "SEO" },
  ]);
  mockPrisma.publishLog.create.mockResolvedValue({});

  // Supabase storage
  mockSupabaseStorage.upload.mockResolvedValue({ error: null });
  mockSupabaseStorage.getPublicUrl.mockReturnValue({
    data: { publicUrl: "https://storage.example.com/image.webp" },
  });

  // AI modules
  (generateOutline as Mock).mockResolvedValue(makeOutline());
  (generateContent as Mock).mockResolvedValue(makeContent());
  (analyzeCompetition as Mock).mockResolvedValue(makeCompetitionAnalysis());
  (generatePostImages as Mock).mockResolvedValue([
    { buffer: Buffer.from("img1"), altText: "SEO diagram", width: 800, height: 600, fileSize: 50000 },
    { buffer: Buffer.from("img2"), altText: "SEO tools", width: 800, height: 600, fileSize: 45000 },
  ]);
  (categorizePost as Mock).mockResolvedValue({
    categorySlug: "seo",
    categoryName: "SEO",
    isNew: false,
  });

  // WordPress
  (publishToWordPress as Mock).mockResolvedValue("wp-123");
  (uploadMediaToWordPress as Mock).mockResolvedValue(42);

  // Auto-linker
  (addRetroactiveLinks as Mock).mockResolvedValue({
    linksInserted: 1,
    updatedPostIds: ["p-old"],
  });
  (addConversionLink as Mock).mockReturnValue(
    makeContent().html + '<a href="https://example.com/contacto">CTA</a>',
  );

  return site;
}

// ── Setup ────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
});

// ── Happy path ───────────────────────────────────────────────

describe("runPipeline — happy path", () => {
  it("completes full 12-step pipeline", async () => {
    setupHappyPath();

    const result = await runPipeline(SITE_ID);

    expect(result).toEqual({
      postId: POST_ID,
      seoScore: expect.any(Number),
      wordCount: 1500,
      attempts: 1,
    });
  });

  it("saves post to DB with correct data", async () => {
    setupHappyPath();

    await runPipeline(SITE_ID);

    expect(mockPrisma.post.create).toHaveBeenCalledOnce();
    const createArgs = mockPrisma.post.create.mock.calls[0][0];
    expect(createArgs.data).toMatchObject({
      siteId: SITE_ID,
      title: "Guía Completa de SEO",
      keyword: "nueva keyword seo",
      wordCount: 1500,
      status: "review",
    });
    expect(createArgs.data.slug).toBeTruthy();
    expect(createArgs.data.seoScore).toBeGreaterThan(0);
  });

  it("publishes to WordPress and updates post status", async () => {
    setupHappyPath();

    await runPipeline(SITE_ID);

    expect(publishToWordPress).toHaveBeenCalledOnce();
    expect(uploadMediaToWordPress).toHaveBeenCalledOnce();

    // Find the update call that sets status to "published"
    const updateCalls = mockPrisma.post.update.mock.calls;
    const publishCall = updateCalls.find(
      (call: Array<{ data: { status?: string } }>) => call[0]?.data?.status === "published",
    );
    expect(publishCall).toBeDefined();
    expect(publishCall[0].data.externalPostId).toBe("wp-123");
  });
});

// ── Keyword selection ────────────────────────────────────────

describe("runPipeline — keyword selection", () => {
  it("selects specific keyword when keywordId provided", async () => {
    setupHappyPath();

    await runPipeline(SITE_ID, KEYWORD_ID);

    const createArgs = mockPrisma.post.create.mock.calls[0][0];
    expect(createArgs.data.keyword).toBe("nueva keyword seo");
  });

  it("auto-selects first non-cannibalizing keyword", async () => {
    // First keyword cannibalizes ("old keyword" vs "old keyword similar"),
    // second keyword is safe
    setupHappyPath({
      posts: [{ id: "p-old", keyword: "old keyword", slug: "old", title: "Old" }],
      keywords: [
        { id: "kw-skip", phrase: "old keyword", status: "pending" },
        { id: "kw-good", phrase: "nueva keyword seo", status: "pending" },
      ],
    });

    await runPipeline(SITE_ID);

    // First keyword should be skipped (exact match = cannibalization)
    expect(mockPrisma.keyword.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "kw-skip" },
        data: expect.objectContaining({ status: "skipped" }),
      }),
    );

    const createArgs = mockPrisma.post.create.mock.calls[0][0];
    expect(createArgs.data.keyword).toBe("nueva keyword seo");
  });

  it("throws when no valid keywords available", async () => {
    setupHappyPath({
      posts: [{ id: "p-old", keyword: "keyword existente", slug: "old", title: "Old" }],
      keywords: [
        { id: "kw-1", phrase: "keyword existente", status: "pending" },
      ],
    });

    await expect(runPipeline(SITE_ID)).rejects.toThrow(
      /No valid pending keywords found/,
    );
  });
});

// ── Retry logic ──────────────────────────────────────────────

describe("runPipeline — retry logic", () => {
  it("retries when SEO score < 70", async () => {
    setupHappyPath();

    // First call returns short content (low score), second returns good content
    const shortContent = {
      html: "<h1>Short</h1><p>Texto.</p>",
      markdown: "# Short\n\nTexto.",
      wordCount: 50,
      faqItems: [],
    };
    const goodContent = makeContent();

    (generateContent as Mock)
      .mockResolvedValueOnce(shortContent)
      .mockResolvedValueOnce(goodContent);

    const result = await runPipeline(SITE_ID);

    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(result.attempts).toBe(2);
  });

  it("throws after 3 failed attempts", async () => {
    setupHappyPath();

    (generateContent as Mock).mockRejectedValue(new Error("AI unavailable"));

    await expect(runPipeline(SITE_ID)).rejects.toThrow(
      /Pipeline failed after 3 attempts/,
    );
    expect(generateContent).toHaveBeenCalledTimes(3);
  });
});

// ── Non-fatal error resilience ───────────────────────────────

describe("runPipeline — non-fatal error resilience", () => {
  it("continues when competition analysis fails", async () => {
    setupHappyPath();
    (analyzeCompetition as Mock).mockRejectedValue(new Error("API timeout"));

    const result = await runPipeline(SITE_ID);

    expect(result.postId).toBe(POST_ID);
    // Outline still generated (without competition data)
    expect(generateOutline).toHaveBeenCalledOnce();
  });

  it("continues when auto-categorization fails", async () => {
    setupHappyPath();
    (categorizePost as Mock).mockRejectedValue(new Error("AI error"));

    const result = await runPipeline(SITE_ID);

    expect(result.postId).toBe(POST_ID);
    expect(mockPrisma.post.create).toHaveBeenCalledOnce();
  });

  it("continues when auto-linking fails", async () => {
    setupHappyPath();
    (addRetroactiveLinks as Mock).mockRejectedValue(new Error("DB error"));

    const result = await runPipeline(SITE_ID);

    expect(result.postId).toBe(POST_ID);
    expect(mockPrisma.post.create).toHaveBeenCalledOnce();
  });

  it("continues when WordPress publish fails", async () => {
    setupHappyPath();
    (publishToWordPress as Mock).mockRejectedValue(new Error("WP down"));

    const result = await runPipeline(SITE_ID);

    expect(result.postId).toBe(POST_ID);
    // Post should NOT be updated to "published"
    const updateCalls = mockPrisma.post.update.mock.calls;
    const publishUpdate = updateCalls.find(
      (call: Array<{ data: { status?: string } }>) => call[0]?.data?.status === "published",
    );
    expect(publishUpdate).toBeUndefined();
  });
});

// ── Edge cases ───────────────────────────────────────────────

describe("runPipeline — edge cases", () => {
  it("skips WordPress publish when site has no WP credentials", async () => {
    setupHappyPath({
      platform: "custom",
      apiUrl: null,
      apiUser: null,
      apiPassword: null,
    });

    const result = await runPipeline(SITE_ID);

    expect(result.postId).toBe(POST_ID);
    expect(publishToWordPress).not.toHaveBeenCalled();
    expect(uploadMediaToWordPress).not.toHaveBeenCalled();
  });

  it("aborts WordPress publish when featured image upload fails", async () => {
    setupHappyPath();
    (uploadMediaToWordPress as Mock).mockRejectedValue(
      new Error("Upload failed"),
    );

    const result = await runPipeline(SITE_ID);

    expect(result.postId).toBe(POST_ID);
    // publishToWordPress should NOT be called — image failure is fatal
    expect(publishToWordPress).not.toHaveBeenCalled();
    // Post remains in DB with status "review" (logged as failed)
    expect(mockPrisma.publishLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "wordpress_publish",
          status: "failed",
        }),
      }),
    );
  });

  it("skips conversion link when site has no conversionUrl", async () => {
    setupHappyPath({ conversionUrl: null });

    await runPipeline(SITE_ID);

    expect(addConversionLink).not.toHaveBeenCalled();
  });
});
