import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ───────────────────────────────────────────────────
const mockPrisma = vi.hoisted(() => ({
  siteAbTest: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  analytics: { findMany: vi.fn() },
}));
vi.mock("../db/prisma", () => ({ prisma: mockPrisma }));

const mockChatCompletion = vi.hoisted(() => vi.fn());
vi.mock("../ai/openai-client", () => ({ chatCompletion: mockChatCompletion }));

import {
  createAbTest,
  evaluateAbTest,
  generateTitleVariants,
  type AbTestVariant,
} from "./ab-testing";

beforeEach(() => {
  vi.resetAllMocks();
});

// ── createAbTest ────────────────────────────────────────────

describe("createAbTest", () => {
  const variants2: AbTestVariant[] = [
    { id: "a", title: "Title A" },
    { id: "b", title: "Title B" },
  ];
  const variants3: AbTestVariant[] = [
    { id: "a", title: "A" },
    { id: "b", title: "B" },
    { id: "c", title: "C" },
  ];

  it("accepts 2 variants", async () => {
    mockPrisma.siteAbTest.create.mockResolvedValue({
      id: "test-1",
      postId: "p1",
      siteId: "s1",
      variants: variants2,
      ctrByVariant: null,
      winner: null,
      createdAt: new Date("2026-03-10"),
    });

    const result = await createAbTest("p1", "s1", variants2);

    expect(result.id).toBe("test-1");
    expect(result.variants).toHaveLength(2);
  });

  it("accepts 3 variants", async () => {
    mockPrisma.siteAbTest.create.mockResolvedValue({
      id: "test-2",
      postId: "p1",
      siteId: "s1",
      variants: variants3,
      ctrByVariant: null,
      winner: null,
      createdAt: new Date("2026-03-10"),
    });

    const result = await createAbTest("p1", "s1", variants3);

    expect(result.variants).toHaveLength(3);
  });

  it("rejects 1 variant", async () => {
    await expect(
      createAbTest("p1", "s1", [{ id: "a", title: "A" }]),
    ).rejects.toThrow("A/B test requires 2-3 variants");
  });

  it("rejects 4 variants", async () => {
    const four = [
      { id: "a", title: "A" },
      { id: "b", title: "B" },
      { id: "c", title: "C" },
      { id: "d", title: "D" },
    ];

    await expect(createAbTest("p1", "s1", four)).rejects.toThrow(
      "A/B test requires 2-3 variants",
    );
  });
});

// ── evaluateAbTest ──────────────────────────────────────────

describe("evaluateAbTest", () => {
  it("throws when test not found", async () => {
    mockPrisma.siteAbTest.findUnique.mockResolvedValue(null);

    await expect(evaluateAbTest("bad-id")).rejects.toThrow("A/B test not found");
  });

  it("calculates CTR as clicks/impressions*100", async () => {
    mockPrisma.siteAbTest.findUnique.mockResolvedValue({
      id: "t1",
      postId: "p1",
      createdAt: new Date("2026-03-01"),
      variants: [
        { id: "a", title: "A" },
        { id: "b", title: "B" },
      ],
    });
    mockPrisma.analytics.findMany.mockResolvedValue([
      { clicks: 10, impressions: 200 },
      { clicks: 30, impressions: 300 },
    ]);
    mockPrisma.siteAbTest.update.mockResolvedValue({});

    const result = await evaluateAbTest("t1");

    // Segment 0 → variant a: clicks=10, imp=200 → CTR=5
    // Segment 1 → variant b: clicks=30, imp=300 → CTR=10
    expect(result.ctrByVariant["a"]).toBeCloseTo(5);
    expect(result.ctrByVariant["b"]).toBeCloseTo(10);
  });

  it("picks winner as highest CTR", async () => {
    mockPrisma.siteAbTest.findUnique.mockResolvedValue({
      id: "t1",
      postId: "p1",
      createdAt: new Date("2026-03-01"),
      variants: [
        { id: "a", title: "Title A" },
        { id: "b", title: "Title B" },
      ],
    });
    mockPrisma.analytics.findMany.mockResolvedValue([
      { clicks: 5, impressions: 500 },  // variant a: CTR=1
      { clicks: 50, impressions: 500 }, // variant b: CTR=10
    ]);
    mockPrisma.siteAbTest.update.mockResolvedValue({});

    const result = await evaluateAbTest("t1");

    expect(result.winner).toBe("b");
    expect(result.winnerTitle).toBe("Title B");
  });

  it("returns low confidence when impressions < 200", async () => {
    mockPrisma.siteAbTest.findUnique.mockResolvedValue({
      id: "t1",
      postId: "p1",
      createdAt: new Date("2026-03-01"),
      variants: [
        { id: "a", title: "A" },
        { id: "b", title: "B" },
      ],
    });
    mockPrisma.analytics.findMany.mockResolvedValue([
      { clicks: 5, impressions: 50 },
      { clicks: 3, impressions: 30 },
    ]);
    mockPrisma.siteAbTest.update.mockResolvedValue({});

    const result = await evaluateAbTest("t1");

    expect(result.confidence).toBe("low");
  });

  it("returns medium confidence for 200-999 impressions", async () => {
    mockPrisma.siteAbTest.findUnique.mockResolvedValue({
      id: "t1",
      postId: "p1",
      createdAt: new Date("2026-03-01"),
      variants: [
        { id: "a", title: "A" },
        { id: "b", title: "B" },
      ],
    });
    mockPrisma.analytics.findMany.mockResolvedValue([
      { clicks: 20, impressions: 300 },
      { clicks: 30, impressions: 400 },
    ]);
    mockPrisma.siteAbTest.update.mockResolvedValue({});

    const result = await evaluateAbTest("t1");

    expect(result.confidence).toBe("medium");
  });

  it("returns high confidence for >= 1000 impressions", async () => {
    mockPrisma.siteAbTest.findUnique.mockResolvedValue({
      id: "t1",
      postId: "p1",
      createdAt: new Date("2026-03-01"),
      variants: [
        { id: "a", title: "A" },
        { id: "b", title: "B" },
      ],
    });
    mockPrisma.analytics.findMany.mockResolvedValue([
      { clicks: 50, impressions: 500 },
      { clicks: 60, impressions: 600 },
    ]);
    mockPrisma.siteAbTest.update.mockResolvedValue({});

    const result = await evaluateAbTest("t1");

    expect(result.confidence).toBe("high");
  });
});

// ── generateTitleVariants ───────────────────────────────────

describe("generateTitleVariants", () => {
  it("parses JSON array from AI response", async () => {
    mockChatCompletion.mockResolvedValue(
      '["Mejor título SEO", "Título optimizado"]',
    );

    const result = await generateTitleVariants("Título original", "SEO");

    expect(result).toEqual(["Mejor título SEO", "Título optimizado"]);
  });

  it("validates at least 2 results", async () => {
    mockChatCompletion.mockResolvedValue('["Solo uno"]');

    await expect(
      generateTitleVariants("Título", "keyword"),
    ).rejects.toThrow("Expected at least 2 title variants");
  });

  it("truncates output to 2 variants", async () => {
    mockChatCompletion.mockResolvedValue(
      '["Uno", "Dos", "Tres", "Cuatro"]',
    );

    const result = await generateTitleVariants("Título", "keyword");

    expect(result).toHaveLength(2);
  });

  it("throws when AI does not return JSON array", async () => {
    mockChatCompletion.mockResolvedValue("No es JSON");

    await expect(
      generateTitleVariants("Título", "keyword"),
    ).rejects.toThrow("Failed to parse title variants from AI response");
  });
});
