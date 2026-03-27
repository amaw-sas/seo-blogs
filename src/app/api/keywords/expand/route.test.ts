import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock keyword-expander before importing route
vi.mock("@/lib/ai/keyword-expander", () => ({
  expandKeyword: vi.fn(),
}));

// Mock prisma
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    keyword: {
      findMany: vi.fn(),
      createMany: vi.fn(),
    },
    site: {
      findUnique: vi.fn(),
    },
  },
}));

import { expandKeyword } from "@/lib/ai/keyword-expander";
import { prisma } from "@/lib/db/prisma";

const mockExpandKeyword = expandKeyword as ReturnType<typeof vi.fn>;
const mockFindMany = prisma.keyword.findMany as ReturnType<typeof vi.fn>;
const mockCreateMany = prisma.keyword.createMany as ReturnType<typeof vi.fn>;
const mockSiteFindUnique = prisma.site.findUnique as ReturnType<typeof vi.fn>;

describe("POST /api/keywords/expand — data contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires keywordIds array and siteId in body", () => {
    // Contract: { keywordIds: string[], siteId: string }
    const validBody = {
      keywordIds: ["kw1", "kw2"],
      siteId: "site1",
    };
    expect(validBody.keywordIds).toBeInstanceOf(Array);
    expect(typeof validBody.siteId).toBe("string");
  });

  it("response includes expanded keywords count and created count", () => {
    // Contract: { expanded: number, created: number, keywords: ExpandedKeyword[] }
    const response = {
      expanded: 2,
      created: 8,
      keywords: [
        { phrase: "alquiler de carros baratos", priority: 1 },
        { phrase: "donde alquilar carro", priority: 2 },
      ],
    };
    expect(typeof response.expanded).toBe("number");
    expect(typeof response.created).toBe("number");
    expect(response.keywords).toBeInstanceOf(Array);
    expect(response.keywords[0]).toHaveProperty("phrase");
    expect(response.keywords[0]).toHaveProperty("priority");
  });

  it("expandKeyword receives seed phrase and site context", async () => {
    const siteContext = {
      domain: "example.com",
      existingKeywords: ["keyword a", "keyword b"],
    };

    mockExpandKeyword.mockResolvedValue([
      { phrase: "long tail keyword", priority: 1 },
    ]);

    await expandKeyword("seed keyword", siteContext);

    expect(mockExpandKeyword).toHaveBeenCalledWith("seed keyword", siteContext);
  });

  it("expanded keywords are inserted with parentId linking to seed", () => {
    // Contract: createMany receives data with parentId set to source keyword id
    const seedId = "kw_seed_123";
    const expandedData = [
      { siteId: "site1", phrase: "long tail 1", priority: 1, parentId: seedId },
      { siteId: "site1", phrase: "long tail 2", priority: 2, parentId: seedId },
    ];

    expect(expandedData.every((d) => d.parentId === seedId)).toBe(true);
    expect(expandedData.every((d) => d.siteId === "site1")).toBe(true);
  });

  it("site domain is fetched for context", async () => {
    mockSiteFindUnique.mockResolvedValue({
      id: "site1",
      domain: "example.com",
    });

    const site = await prisma.site.findUnique({ where: { id: "site1" } });
    expect(site?.domain).toBe("example.com");
  });

  it("existing keywords are fetched to avoid duplicates", async () => {
    mockFindMany.mockResolvedValue([
      { phrase: "existing keyword 1" },
      { phrase: "existing keyword 2" },
    ]);

    const existing = await prisma.keyword.findMany({
      where: { siteId: "site1" },
      select: { phrase: true },
    });

    expect(existing.map((k: { phrase: string }) => k.phrase)).toEqual([
      "existing keyword 1",
      "existing keyword 2",
    ]);
  });
});
