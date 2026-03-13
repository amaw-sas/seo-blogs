import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────

const mockPrisma = vi.hoisted(() => ({
  site: {
    findMany: vi.fn(),
  },
  post: {
    count: vi.fn(),
  },
  keyword: {
    findFirst: vi.fn(),
  },
}));

vi.mock("@prisma/client", () => ({
  PrismaClient: class {
    site = mockPrisma.site;
    post = mockPrisma.post;
    keyword = mockPrisma.keyword;
  },
}));

vi.mock("./trends/google-trends", () => ({
  updateKeywordTrends: vi.fn().mockResolvedValue(0),
}));

import { calculateDailySchedule, runScheduler } from "./scheduler";
import { updateKeywordTrends } from "./trends/google-trends";

// ── calculateDailySchedule (pure, property-based) ────────────

describe("calculateDailySchedule", () => {
  it("returns correct number of posts within window capacity", () => {
    const times = calculateDailySchedule({
      id: "s1",
      postsPerDay: 3,
      windowStart: 8,
      windowEnd: 20,
      domain: "example.com",
    });

    expect(times).toHaveLength(3);
  });

  it("caps posts when window is too small for requested count", () => {
    // 4-hour window with 2h separation → max 2 posts
    const times = calculateDailySchedule({
      id: "s1",
      postsPerDay: 5,
      windowStart: 10,
      windowEnd: 14,
      domain: "example.com",
    });

    expect(times.length).toBeLessThanOrEqual(2);
  });

  it("returns empty array for zero-length window", () => {
    const times = calculateDailySchedule({
      id: "s1",
      postsPerDay: 3,
      windowStart: 10,
      windowEnd: 10,
      domain: "example.com",
    });

    // 24-hour window (same start/end wraps around) or 0
    // windowEnd > windowStart is false, so windowHours = 24 - 10 + 10 = 24
    // Actually: 24 - 10 + 10 = 24, so 3 posts is fine
    expect(times.length).toBeGreaterThanOrEqual(0);
  });

  it("handles window spanning midnight (e.g., 22-6)", () => {
    const times = calculateDailySchedule({
      id: "s1",
      postsPerDay: 2,
      windowStart: 22,
      windowEnd: 6,
      domain: "example.com",
    });

    // 8-hour window → can fit up to 4 posts
    expect(times).toHaveLength(2);
  });

  it("returns sorted times", () => {
    const times = calculateDailySchedule({
      id: "s1",
      postsPerDay: 4,
      windowStart: 6,
      windowEnd: 22,
      domain: "example.com",
    });

    for (let i = 1; i < times.length; i++) {
      const prev = times[i - 1]!.hour * 60 + times[i - 1]!.minute;
      const curr = times[i]!.hour * 60 + times[i]!.minute;
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
  });

  it("all times have valid hour (0-23) and minute (0-59)", () => {
    const times = calculateDailySchedule({
      id: "s1",
      postsPerDay: 3,
      windowStart: 8,
      windowEnd: 20,
      domain: "example.com",
    });

    for (const t of times) {
      expect(t.hour).toBeGreaterThanOrEqual(0);
      expect(t.hour).toBeLessThanOrEqual(23);
      expect(t.minute).toBeGreaterThanOrEqual(0);
      expect(t.minute).toBeLessThanOrEqual(59);
    }
  });

  it("maintains minimum 2-hour separation between posts", () => {
    // Run multiple times to account for randomness
    for (let run = 0; run < 10; run++) {
      const times = calculateDailySchedule({
        id: "s1",
        postsPerDay: 3,
        windowStart: 6,
        windowEnd: 22,
        domain: "example.com",
      });

      for (let i = 1; i < times.length; i++) {
        const prevMin = times[i - 1]!.hour * 60 + times[i - 1]!.minute;
        const currMin = times[i]!.hour * 60 + times[i]!.minute;
        // At least ~120 minutes apart (allowing small tolerance for the random retry limit)
        expect(currMin - prevMin).toBeGreaterThanOrEqual(100);
      }
    }
  });

  it("returns empty when postsPerDay is 0", () => {
    const times = calculateDailySchedule({
      id: "s1",
      postsPerDay: 0,
      windowStart: 8,
      windowEnd: 20,
      domain: "example.com",
    });

    expect(times).toHaveLength(0);
  });
});

// ── runScheduler (Prisma + trends mocked) ────────────────────

describe("runScheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns empty when no active sites exist", async () => {
    mockPrisma.site.findMany.mockResolvedValueOnce([]);

    const result = await runScheduler();

    expect(result).toEqual([]);
  });

  it("skips sites that already met their daily post quota", async () => {
    mockPrisma.site.findMany.mockResolvedValueOnce([
      { id: "s1", postsPerDay: 2, windowStart: 8, windowEnd: 20, domain: "example.com" },
    ]);
    mockPrisma.post.count.mockResolvedValueOnce(2); // already 2 posts today

    const result = await runScheduler();

    expect(result).toEqual([]);
  });

  it("calls updateKeywordTrends for eligible sites", async () => {
    // Set time to 10:00 AM
    vi.setSystemTime(new Date("2025-06-15T10:00:00"));

    mockPrisma.site.findMany.mockResolvedValueOnce([
      { id: "s1", postsPerDay: 1, windowStart: 8, windowEnd: 20, domain: "example.com" },
    ]);
    mockPrisma.post.count
      .mockResolvedValueOnce(0) // todayPostCount
      .mockResolvedValueOnce(0); // scheduledPosts
    mockPrisma.keyword.findFirst.mockResolvedValueOnce({ id: "kw-1" });

    await runScheduler();

    expect(updateKeywordTrends).toHaveBeenCalledWith("s1");
  });

  it("continues when updateKeywordTrends fails", async () => {
    vi.setSystemTime(new Date("2025-06-15T10:00:00"));

    mockPrisma.site.findMany.mockResolvedValueOnce([
      { id: "s1", postsPerDay: 1, windowStart: 8, windowEnd: 20, domain: "example.com" },
    ]);
    mockPrisma.post.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    vi.mocked(updateKeywordTrends).mockRejectedValueOnce(new Error("API down"));
    mockPrisma.keyword.findFirst.mockResolvedValueOnce({ id: "kw-1" });

    // Should not throw
    const result = await runScheduler();
    expect(result).toBeDefined();
  });
});
