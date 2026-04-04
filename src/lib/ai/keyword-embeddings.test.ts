import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  cosineSimilarity,
  agglomerativeCluster,
  findSemanticDuplicates,
} from "./keyword-embeddings";

// ─── Pure math functions (no mocks needed) ────────────────────────────

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    const v = [1, 2, 3];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 10);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 10);
  });

  it("returns -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 10);
  });

  it("returns 0 when a vector is all zeros", () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });

  it("computes correctly for known values", () => {
    // cos([1,2,3], [4,5,6]) = 32 / (sqrt(14) * sqrt(77)) ≈ 0.9746
    const sim = cosineSimilarity([1, 2, 3], [4, 5, 6]);
    expect(sim).toBeCloseTo(0.9746, 3);
  });
});

// ─── Agglomerative clustering ─────────────────────────────────────────

describe("agglomerativeCluster", () => {
  it("groups two obvious clusters with synthetic embeddings", () => {
    // Group A: vectors near [1, 0, 0]
    // Group B: vectors near [0, 1, 0]
    const embeddings = [
      [1, 0.05, 0], // A
      [1, 0.1, 0], // A
      [0.95, 0.08, 0], // A
      [0.05, 1, 0], // B
      [0.1, 1, 0], // B
      [0.08, 0.95, 0], // B
    ];
    const labels = ["a1", "a2", "a3", "b1", "b2", "b3"];

    const clusters = agglomerativeCluster(embeddings, labels, 0.75);

    // Should produce exactly 2 clusters
    expect(clusters).toHaveLength(2);

    // Sort clusters so the one containing index 0 comes first
    clusters.sort((a, b) => Math.min(...a.indices) - Math.min(...b.indices));

    expect(clusters[0].indices.sort()).toEqual([0, 1, 2]);
    expect(clusters[0].keywords.sort()).toEqual(["a1", "a2", "a3"]);
    expect(clusters[1].indices.sort()).toEqual([3, 4, 5]);
    expect(clusters[1].keywords.sort()).toEqual(["b1", "b2", "b3"]);
  });

  it("returns a single cluster when all vectors are very similar", () => {
    const embeddings = [
      [1, 0.01, 0],
      [1, 0.02, 0],
      [1, 0.03, 0],
    ];
    const labels = ["x", "y", "z"];

    const clusters = agglomerativeCluster(embeddings, labels, 0.75);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].indices.sort()).toEqual([0, 1, 2]);
  });

  it("merges small clusters (<3) into the nearest larger cluster", () => {
    // 4 similar items + 1 outlier that's slightly closer to the group
    const embeddings = [
      [1, 0, 0],
      [0.99, 0.05, 0],
      [0.98, 0.1, 0],
      [0.97, 0.08, 0],
      [0.6, 0.5, 0], // outlier — won't cluster with the main group at threshold, but is closest
    ];
    const labels = ["a", "b", "c", "d", "outlier"];

    // High threshold so outlier doesn't merge during clustering
    const clusters = agglomerativeCluster(embeddings, labels, 0.98);

    // The outlier should be merged into the main cluster (small-cluster rule)
    expect(clusters).toHaveLength(1);
    expect(clusters[0].indices.sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it("handles empty input", () => {
    const clusters = agglomerativeCluster([], [], 0.75);
    expect(clusters).toEqual([]);
  });
});

// ─── Semantic duplicates ──────────────────────────────────────────────

describe("findSemanticDuplicates", () => {
  it("finds near-identical vectors as duplicates", () => {
    const embeddings = [
      [1, 0, 0],
      [0.999, 0.001, 0], // near-duplicate of index 0
      [0, 1, 0], // different
    ];
    const labels = ["alquiler carro", "alquiler de carro", "marketing digital"];

    const duplicates = findSemanticDuplicates(embeddings, labels, 0.9);

    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].phrase1).toBe("alquiler carro");
    expect(duplicates[0].phrase2).toBe("alquiler de carro");
    expect(duplicates[0].similarity).toBeGreaterThan(0.9);
  });

  it("returns empty array when no duplicates exist", () => {
    const embeddings = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    const labels = ["a", "b", "c"];

    const duplicates = findSemanticDuplicates(embeddings, labels, 0.9);
    expect(duplicates).toHaveLength(0);
  });

  it("rounds similarity to 2 decimal places", () => {
    const embeddings = [
      [1, 0, 0],
      [0.999, 0.001, 0],
    ];
    const labels = ["a", "b"];

    const duplicates = findSemanticDuplicates(embeddings, labels, 0.9);

    expect(duplicates).toHaveLength(1);
    const simStr = duplicates[0].similarity.toString();
    const decimals = simStr.split(".")[1] ?? "";
    expect(decimals.length).toBeLessThanOrEqual(2);
  });
});

// ─── generateEmbeddings (OpenAI mock) ─────────────────────────────────

describe("generateEmbeddings", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.OPENAI_API_KEY = "test-key";
  });

  it("calls OpenAI embeddings API and returns vectors", async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      data: [
        { embedding: [0.1, 0.2, 0.3] },
        { embedding: [0.4, 0.5, 0.6] },
      ],
    });

    vi.doMock("openai", () => ({
      default: class {
        embeddings = { create: mockCreate };
      },
    }));

    const { generateEmbeddings } = await import("./keyword-embeddings");
    const result = await generateEmbeddings(["hello", "world"]);

    expect(mockCreate).toHaveBeenCalledWith({
      model: "text-embedding-3-small",
      input: ["hello", "world"],
    });
    expect(result).toEqual([
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
    ]);
  });

  it("batches requests in groups of 100", async () => {
    const mockCreate = vi.fn().mockImplementation(({ input }) => ({
      data: input.map((_: string, i: number) => ({
        embedding: [i],
      })),
    }));

    vi.doMock("openai", () => ({
      default: class {
        embeddings = { create: mockCreate };
      },
    }));

    const { generateEmbeddings } = await import("./keyword-embeddings");
    const texts = Array.from({ length: 250 }, (_, i) => `text-${i}`);
    const result = await generateEmbeddings(texts);

    // Should make 3 batches: 100 + 100 + 50
    expect(mockCreate).toHaveBeenCalledTimes(3);
    expect(result).toHaveLength(250);
  });

  it("throws when OPENAI_API_KEY is missing", async () => {
    delete process.env.OPENAI_API_KEY;

    vi.doMock("openai", () => ({
      default: class {
        embeddings = { create: vi.fn() };
      },
    }));

    const { generateEmbeddings } = await import("./keyword-embeddings");
    await expect(generateEmbeddings(["test"])).rejects.toThrow(
      "OPENAI_API_KEY is not set",
    );
  });
});
