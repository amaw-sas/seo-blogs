import { describe, it, expect, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    site: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));

import { GET } from "./route";

describe("GET /api/sites", () => {
  it("includes _count.keywords for pending keywords", async () => {
    const fakeSites = [
      { id: "s1", name: "Test", domain: "test.com", _count: { keywords: 5 } },
      { id: "s2", name: "Empty", domain: "empty.com", _count: { keywords: 0 } },
    ];
    mockPrisma.site.findMany.mockResolvedValue(fakeSites);

    const res = await GET();
    const body = await res.json();

    expect(body.data).toHaveLength(2);
    expect(body.data[0]._count.keywords).toBe(5);
    expect(body.data[1]._count.keywords).toBe(0);

    // Verify the query includes the _count with pending filter
    expect(mockPrisma.site.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          _count: {
            select: { keywords: { where: { status: "pending" } } },
          },
        },
      }),
    );
  });
});
