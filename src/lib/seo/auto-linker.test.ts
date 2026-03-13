import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Prisma mock ──────────────────────────────────────────────

const mockPrisma = vi.hoisted(() => ({
  site: {
    findUniqueOrThrow: vi.fn(),
  },
  post: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  postLink: {
    create: vi.fn(),
  },
  postVersion: {
    create: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("@prisma/client", () => ({
  PrismaClient: class {
    site = mockPrisma.site;
    post = mockPrisma.post;
    postLink = mockPrisma.postLink;
    postVersion = mockPrisma.postVersion;
    $transaction = mockPrisma.$transaction;
  },
}));

import {
  addConversionLink,
  addRetroactiveLinks,
  updateExistingPostsWithLink,
} from "./auto-linker";

// ── addConversionLink (pure function) ────────────────────────

describe("addConversionLink", () => {
  it("inserts a conversion link into the middle third of paragraphs", () => {
    const html = [
      "<p>First paragraph.</p>",
      "<p>Second paragraph.</p>",
      "<p>Third paragraph.</p>",
      "<p>Fourth paragraph.</p>",
      "<p>Fifth paragraph.</p>",
      "<p>Sixth paragraph.</p>",
    ].join("");

    const result = addConversionLink(html, "https://buy.example.com", "zapatos");

    expect(result).toContain('href="https://buy.example.com"');
    expect(result).toContain('class="conversion-link"');
    // Link should mention the keyword
    expect(result).toContain("zapatos");
  });

  it("returns unchanged html when conversionUrl is empty", () => {
    const html = "<p>Content here.</p>";
    expect(addConversionLink(html, "", "kw")).toBe(html);
  });

  it("returns unchanged html when there are no paragraphs", () => {
    const html = "<h2>Title only</h2>";
    expect(addConversionLink(html, "https://buy.com", "kw")).toBe(html);
  });

  it("handles single paragraph content", () => {
    const html = "<p>Only paragraph.</p>";
    const result = addConversionLink(html, "https://buy.com", "kw");
    expect(result).toContain('href="https://buy.com"');
  });

  it("places the link before the closing </p> tag", () => {
    const html = "<p>First.</p><p>Second.</p><p>Third.</p>";
    const result = addConversionLink(html, "https://buy.com", "kw");
    // Link is appended before </p>
    expect(result).toMatch(/<a [^>]+>[^<]+<\/a><\/p>/);
  });

  it("uses one of the predefined anchor text templates", () => {
    const html = "<p>A</p><p>B</p><p>C</p>";
    const result = addConversionLink(html, "https://buy.com", "zapatos");

    const validAnchors = [
      "Descubre más sobre zapatos",
      "Conoce las mejores opciones de zapatos",
      "Encuentra lo que necesitas sobre zapatos",
    ];
    const hasValidAnchor = validAnchors.some((a) => result.includes(a));
    expect(hasValidAnchor).toBe(true);
  });

  it("does not modify paragraphs that contain HTML tags (regex filter)", () => {
    // The regex <p>[^<]+<\/p> skips paragraphs with inner tags
    const html = "<p><strong>Bold</strong> text.</p><p>Plain text.</p><p>More plain.</p>";
    const result = addConversionLink(html, "https://buy.com", "kw");
    // Should still insert a link in one of the plain paragraphs
    expect(result).toContain('href="https://buy.com"');
  });
});

// ── addRetroactiveLinks (Prisma-mocked) ──────────────────────

describe("addRetroactiveLinks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const newPost = { id: "new-1", title: "Zapatos Running", slug: "zapatos-running", keyword: "zapatos running" };

  it("returns empty when fewer than 2 related posts found", async () => {
    mockPrisma.site.findUniqueOrThrow.mockResolvedValueOnce({ domain: "example.com" });
    mockPrisma.post.findMany.mockResolvedValueOnce([
      { id: "p1", title: "Camisetas running", slug: "camisetas", keyword: "camisetas", contentHtml: "<p>x</p>" },
    ]);

    const result = await addRetroactiveLinks(newPost, "site-1");

    expect(result.updatedPostIds).toEqual([]);
    expect(result.linksInserted).toBe(0);
  });

  it("finds related posts by keyword overlap and updates them", async () => {
    mockPrisma.site.findUniqueOrThrow.mockResolvedValueOnce({ domain: "example.com" });
    mockPrisma.post.findMany.mockResolvedValueOnce([
      { id: "p1", title: "Zapatos baratos", slug: "zapatos-baratos", keyword: "zapatos baratos", contentHtml: "<p>Content A.</p><p>Content B.</p><p>Content C.</p>" },
      { id: "p2", title: "Running tips", slug: "running-tips", keyword: "running tips", contentHtml: "<p>Tip 1.</p><p>Tip 2.</p><p>Tip 3.</p>" },
      { id: "p3", title: "Comida saludable", slug: "comida", keyword: "comida saludable", contentHtml: "<p>Food.</p>" },
    ]);

    // Mock updateExistingPostsWithLink internals
    mockPrisma.post.findUnique
      .mockResolvedValueOnce({ id: "p1", contentHtml: "<p>Content A.</p><p>Content B.</p><p>Content C.</p>" })
      .mockResolvedValueOnce({ id: "p2", contentHtml: "<p>Tip 1.</p><p>Tip 2.</p><p>Tip 3.</p>" });
    mockPrisma.$transaction.mockResolvedValue(undefined);

    const result = await addRetroactiveLinks(newPost, "site-1");

    expect(result.updatedPostIds).toEqual(["p1", "p2"]);
    expect(result.linksInserted).toBe(2);
  });

  it("excludes the new post itself from candidates", async () => {
    mockPrisma.site.findUniqueOrThrow.mockResolvedValueOnce({ domain: "example.com" });
    mockPrisma.post.findMany.mockResolvedValueOnce([]);

    await addRetroactiveLinks(newPost, "site-1");

    const whereArg = mockPrisma.post.findMany.mock.calls[0]![0].where;
    expect(whereArg.id.not).toBe("new-1");
  });
});

// ── updateExistingPostsWithLink ──────────────────────────────

describe("updateExistingPostsWithLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts link and creates PostLink + PostVersion records in transaction", async () => {
    mockPrisma.post.findUnique.mockResolvedValueOnce({
      id: "p1",
      contentHtml: "<p>First.</p><p>Second.</p><p>Third.</p>",
    });
    mockPrisma.$transaction.mockResolvedValueOnce(undefined);

    const ids = await updateExistingPostsWithLink(
      ["p1"],
      "https://example.com/new-post",
      "New Post Title",
      "site-1",
    );

    expect(ids).toEqual(["p1"]);
    expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
  });

  it("skips post when link already exists in content", async () => {
    mockPrisma.post.findUnique.mockResolvedValueOnce({
      id: "p1",
      contentHtml: '<p>Already has <a href="https://example.com/new-post">link</a>.</p>',
    });

    const ids = await updateExistingPostsWithLink(
      ["p1"],
      "https://example.com/new-post",
      "Title",
      "site-1",
    );

    expect(ids).toEqual([]);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("skips post that no longer exists", async () => {
    mockPrisma.post.findUnique.mockResolvedValueOnce(null);

    const ids = await updateExistingPostsWithLink(
      ["deleted-id"],
      "https://example.com/new",
      "Title",
      "site-1",
    );

    expect(ids).toEqual([]);
  });

  it("continues processing remaining posts when one fails", async () => {
    mockPrisma.post.findUnique
      .mockRejectedValueOnce(new Error("DB error"))
      .mockResolvedValueOnce({ id: "p2", contentHtml: "<p>A.</p><p>B.</p><p>C.</p>" });
    mockPrisma.$transaction.mockResolvedValueOnce(undefined);

    const ids = await updateExistingPostsWithLink(
      ["p1", "p2"],
      "https://example.com/new",
      "Title",
      "site-1",
    );

    expect(ids).toEqual(["p2"]);
  });
});
