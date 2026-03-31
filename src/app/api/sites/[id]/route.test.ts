import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    site: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));

import { GET, PUT } from "./route";

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/sites/[id]", () => {
  it("returns hasApiPassword=true but never exposes the actual password", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({
      id: "s1",
      name: "Test",
      domain: "test.com",
      apiPassword: "secret-password-123",
      _count: { posts: 0, keywords: 0, clusters: 0, tags: 0, categories: 0 },
    });

    const req = new NextRequest("http://localhost/api/sites/s1");
    const res = await GET(req, makeContext("s1"));
    const body = await res.json();

    expect(body.hasApiPassword).toBe(true);
    expect(body.apiPassword).toBeUndefined();
  });

  it("returns hasApiPassword=false when no password is set", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({
      id: "s1",
      name: "Test",
      domain: "test.com",
      apiPassword: null,
      _count: { posts: 0, keywords: 0, clusters: 0, tags: 0, categories: 0 },
    });

    const req = new NextRequest("http://localhost/api/sites/s1");
    const res = await GET(req, makeContext("s1"));
    const body = await res.json();

    expect(body.hasApiPassword).toBe(false);
  });
});

describe("PUT /api/sites/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not overwrite password when apiPassword is empty string", async () => {
    mockPrisma.site.update.mockResolvedValue({ id: "s1", name: "Updated" });

    const req = new NextRequest("http://localhost/api/sites/s1", {
      method: "PUT",
      body: JSON.stringify({ name: "Updated", apiPassword: "" }),
    });
    const res = await PUT(req, makeContext("s1"));

    expect(res.status).toBe(200);
    const updateCall = mockPrisma.site.update.mock.calls[0][0];
    expect(updateCall.data).not.toHaveProperty("apiPassword");
    expect(updateCall.data.name).toBe("Updated");
  });

  it("updates password when apiPassword has a value", async () => {
    mockPrisma.site.update.mockResolvedValue({ id: "s1", name: "Test" });

    const req = new NextRequest("http://localhost/api/sites/s1", {
      method: "PUT",
      body: JSON.stringify({ name: "Test", apiPassword: "new-pass" }),
    });
    await PUT(req, makeContext("s1"));

    const updateCall = mockPrisma.site.update.mock.calls[0][0];
    expect(updateCall.data.apiPassword).toBe("new-pass");
  });
});
