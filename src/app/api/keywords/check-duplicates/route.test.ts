import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    keyword: {
      findMany: vi.fn(),
    },
  },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));

import { POST } from "./route";
import { NextRequest } from "next/server";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/keywords/check-duplicates", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/keywords/check-duplicates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when siteId is missing", async () => {
    const res = await POST(makeRequest({ phrases: ["test"] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when phrases is empty", async () => {
    const res = await POST(makeRequest({ siteId: "s1", phrases: [] }));
    expect(res.status).toBe(400);
  });

  it("detects exact duplicate", async () => {
    mockPrisma.keyword.findMany.mockResolvedValue([
      { phrase: "alquiler de carros en Bogota" },
    ]);

    const res = await POST(
      makeRequest({
        siteId: "s1",
        phrases: ["alquiler de carros en Bogota"],
      }),
    );
    const body = await res.json();

    expect(body.results).toHaveLength(1);
    expect(body.results[0]).toEqual({
      phrase: "alquiler de carros en Bogota",
      status: "exact_dup",
      matchedPhrase: "alquiler de carros en Bogota",
    });
  });

  it("detects normalized duplicate (diacritics + stopwords + case)", async () => {
    mockPrisma.keyword.findMany.mockResolvedValue([
      { phrase: "alquiler de carros en Bogotá" },
    ]);

    const res = await POST(
      makeRequest({
        siteId: "s1",
        phrases: ["Alquiler Carros Bogota"],
      }),
    );
    const body = await res.json();

    expect(body.results).toHaveLength(1);
    expect(body.results[0]).toEqual({
      phrase: "Alquiler Carros Bogota",
      status: "normalized_dup",
      matchedPhrase: "alquiler de carros en Bogotá",
    });
  });

  it("marks genuinely new phrases as new", async () => {
    mockPrisma.keyword.findMany.mockResolvedValue([
      { phrase: "alquiler de carros en Bogotá" },
    ]);

    const res = await POST(
      makeRequest({
        siteId: "s1",
        phrases: ["mejores hoteles Cartagena"],
      }),
    );
    const body = await res.json();

    expect(body.results).toHaveLength(1);
    expect(body.results[0]).toEqual({
      phrase: "mejores hoteles Cartagena",
      status: "new",
    });
  });

  it("handles mixed results in a single request", async () => {
    mockPrisma.keyword.findMany.mockResolvedValue([
      { phrase: "seguro para carro" },
      { phrase: "alquiler de motos" },
    ]);

    const res = await POST(
      makeRequest({
        siteId: "s1",
        phrases: [
          "seguro para carro",      // exact dup
          "Seguro Carro",           // normalized dup
          "renta de bicicletas",    // new
        ],
      }),
    );
    const body = await res.json();

    expect(body.results).toHaveLength(3);
    expect(body.results[0].status).toBe("exact_dup");
    expect(body.results[1].status).toBe("normalized_dup");
    expect(body.results[1].matchedPhrase).toBe("seguro para carro");
    expect(body.results[2].status).toBe("new");
  });

  it("returns empty results for empty existing keywords", async () => {
    mockPrisma.keyword.findMany.mockResolvedValue([]);

    const res = await POST(
      makeRequest({
        siteId: "s1",
        phrases: ["anything new"],
      }),
    );
    const body = await res.json();

    expect(body.results).toHaveLength(1);
    expect(body.results[0].status).toBe("new");
  });
});
