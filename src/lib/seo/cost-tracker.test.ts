import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Prisma mock ─────────────────────────────────────────────
const mockPrisma = vi.hoisted(() => ({
  publishLog: { findMany: vi.fn() },
  analytics: { findMany: vi.fn() },
}));
vi.mock("../db/prisma", () => ({ prisma: mockPrisma }));

import {
  calculatePostCost,
  calculateDailyCost,
  calculateMonthlyCost,
  estimateRoi,
} from "./cost-tracker";

beforeEach(() => {
  vi.resetAllMocks();
});

// ── calculatePostCost ───────────────────────────────────────

describe("calculatePostCost", () => {
  it("sums token and image costs from logs", async () => {
    mockPrisma.publishLog.findMany.mockResolvedValue([
      { costTokens: 0.05, costImages: 0.10 },
      { costTokens: 0.03, costImages: 0.08 },
    ]);

    const result = await calculatePostCost("post-1");

    expect(result.tokenCost).toBeCloseTo(0.08);
    expect(result.imageCost).toBeCloseTo(0.18);
    expect(result.totalCost).toBeCloseTo(0.26);
    expect(result.logCount).toBe(2);
    expect(result.postId).toBe("post-1");
  });

  it("returns 0 for empty logs", async () => {
    mockPrisma.publishLog.findMany.mockResolvedValue([]);

    const result = await calculatePostCost("post-empty");

    expect(result.totalCost).toBe(0);
    expect(result.logCount).toBe(0);
  });

  it("handles null costs gracefully", async () => {
    mockPrisma.publishLog.findMany.mockResolvedValue([
      { costTokens: null, costImages: 0.10 },
      { costTokens: 0.05, costImages: null },
    ]);

    const result = await calculatePostCost("post-null");

    expect(result.tokenCost).toBeCloseTo(0.05);
    expect(result.imageCost).toBeCloseTo(0.10);
    expect(result.totalCost).toBeCloseTo(0.15);
  });
});

// ── calculateDailyCost ──────────────────────────────────────

describe("calculateDailyCost", () => {
  it("filters by date range and counts unique posts", async () => {
    mockPrisma.publishLog.findMany.mockResolvedValue([
      { costTokens: 0.10, costImages: 0.20, postId: "p1" },
      { costTokens: 0.05, costImages: 0.05, postId: "p1" },
      { costTokens: 0.15, costImages: 0.10, postId: "p2" },
    ]);

    const date = new Date(2026, 2, 10); // March 10, 2026 in local time
    const result = await calculateDailyCost("site-1", date);

    expect(result.tokenCost).toBeCloseTo(0.30);
    expect(result.imageCost).toBeCloseTo(0.35);
    expect(result.totalCost).toBeCloseTo(0.65);
    expect(result.postCount).toBe(2);
    expect(result.date).toBe("2026-03-10");
    expect(mockPrisma.publishLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ siteId: "site-1" }),
      }),
    );
  });
});

// ── calculateMonthlyCost ────────────────────────────────────

describe("calculateMonthlyCost", () => {
  it("generates dailyBreakdown sorted by date", async () => {
    mockPrisma.publishLog.findMany.mockResolvedValue([
      { costTokens: 0.10, costImages: 0.05, postId: "p1", createdAt: new Date("2026-03-15T10:00:00Z") },
      { costTokens: 0.20, costImages: 0.10, postId: "p2", createdAt: new Date("2026-03-10T08:00:00Z") },
    ]);

    const result = await calculateMonthlyCost("site-1", new Date(2026, 2, 1));

    expect(result.month).toBe("2026-03");
    expect(result.postCount).toBe(2);
    expect(result.dailyBreakdown).toHaveLength(2);
    expect(result.dailyBreakdown[0].date).toBe("2026-03-10");
    expect(result.dailyBreakdown[1].date).toBe("2026-03-15");
  });

  it("formats month as YYYY-MM", async () => {
    mockPrisma.publishLog.findMany.mockResolvedValue([]);

    const result = await calculateMonthlyCost("site-1", new Date(2026, 0, 15));

    expect(result.month).toBe("2026-01");
    expect(result.dailyBreakdown).toHaveLength(0);
  });
});

// ── estimateRoi ─────────────────────────────────────────────

describe("estimateRoi", () => {
  it("calculates positive ROI when value exceeds cost", async () => {
    mockPrisma.publishLog.findMany.mockResolvedValue([
      { costTokens: 0.10, costImages: 0.10 },
    ]);
    mockPrisma.analytics.findMany.mockResolvedValue([
      { clicks: 100, impressions: 5000 },
    ]);

    const result = await estimateRoi("post-1");

    // value = 100 * 0.5 = 50, cost = 0.20, ROI = ((50-0.20)/0.20)*100
    expect(result.totalCost).toBeCloseTo(0.20);
    expect(result.estimatedValue).toBe(50);
    expect(result.roi).toBeGreaterThan(0);
    expect(result.totalClicks).toBe(100);
    expect(result.totalImpressions).toBe(5000);
  });

  it("calculates negative ROI when cost exceeds value", async () => {
    mockPrisma.publishLog.findMany.mockResolvedValue([
      { costTokens: 50, costImages: 50 },
    ]);
    mockPrisma.analytics.findMany.mockResolvedValue([
      { clicks: 2, impressions: 100 },
    ]);

    const result = await estimateRoi("post-2");

    // value = 2*0.5 = 1, cost = 100, ROI = ((1-100)/100)*100 = -99
    expect(result.roi).toBeLessThan(0);
  });

  it("returns roi=0 when cost is 0", async () => {
    mockPrisma.publishLog.findMany.mockResolvedValue([]);
    mockPrisma.analytics.findMany.mockResolvedValue([
      { clicks: 10, impressions: 500 },
    ]);

    const result = await estimateRoi("post-free");

    expect(result.roi).toBe(0);
  });

  it("returns costPerClick=0 when clicks is 0", async () => {
    mockPrisma.publishLog.findMany.mockResolvedValue([
      { costTokens: 0.50, costImages: 0.50 },
    ]);
    mockPrisma.analytics.findMany.mockResolvedValue([
      { clicks: 0, impressions: 1000 },
    ]);

    const result = await estimateRoi("post-no-clicks");

    expect(result.costPerClick).toBe(0);
  });

  it("uses custom valuePerClick", async () => {
    mockPrisma.publishLog.findMany.mockResolvedValue([
      { costTokens: 0.10, costImages: 0.10 },
    ]);
    mockPrisma.analytics.findMany.mockResolvedValue([
      { clicks: 10, impressions: 500 },
    ]);

    const result = await estimateRoi("post-custom", 2.0);

    expect(result.estimatedValue).toBe(20); // 10 * 2.0
  });
});
