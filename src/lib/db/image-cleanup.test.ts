import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanupPostImages, extractStoragePath } from "./image-cleanup";

// ── Helpers ──────────────────────────────────────────────────

function makeMockSupabase(removeFn = vi.fn().mockResolvedValue({ error: null })) {
  return {
    storage: {
      from: vi.fn().mockReturnValue({ remove: removeFn }),
    },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function makeMockPrisma(updateManyFn = vi.fn().mockResolvedValue({ count: 0 })) {
  return {
    imagePool: { updateMany: updateManyFn },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const SUPABASE_BASE = "https://abc123.supabase.co/storage/v1/object/public/post-images";

// ── extractStoragePath ───────────────────────────────────────

describe("extractStoragePath", () => {
  it("extracts path from standard Supabase URL", () => {
    const url = `${SUPABASE_BASE}/sites/site-1/posts/hero.webp`;
    expect(extractStoragePath(url)).toBe("sites/site-1/posts/hero.webp");
  });

  it("returns null for non-Supabase URL", () => {
    expect(extractStoragePath("https://example.com/image.png")).toBeNull();
  });

  it("handles URL with query parameters", () => {
    const url = `${SUPABASE_BASE}/img.webp?t=123`;
    expect(extractStoragePath(url)).toBe("img.webp?t=123");
  });
});

// ── cleanupPostImages ────────────────────────────────────────

describe("cleanupPostImages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("deletes non-pool images from Supabase Storage", async () => {
    const removeFn = vi.fn().mockResolvedValue({ error: null });
    const supabase = makeMockSupabase(removeFn);
    const prisma = makeMockPrisma();

    const images = [
      { id: "img-1", url: `${SUPABASE_BASE}/sites/s1/hero.webp` },
      { id: "img-2", url: `${SUPABASE_BASE}/sites/s1/content.webp` },
    ];

    await cleanupPostImages("post-1", images, [], supabase, prisma);

    expect(supabase.storage.from).toHaveBeenCalledWith("post-images");
    expect(removeFn).toHaveBeenCalledWith([
      "sites/s1/hero.webp",
      "sites/s1/content.webp",
    ]);
  });

  it("does NOT delete pool images from storage — recycles them instead", async () => {
    const removeFn = vi.fn().mockResolvedValue({ error: null });
    const supabase = makeMockSupabase(removeFn);
    const updateManyFn = vi.fn().mockResolvedValue({ count: 2 });
    const prisma = makeMockPrisma(updateManyFn);

    const poolUrl = `${SUPABASE_BASE}/pool/img-pool.webp`;
    const images = [{ id: "img-1", url: poolUrl }];
    const imagePool = [{ id: "pool-1", url: poolUrl }];

    await cleanupPostImages("post-1", images, imagePool, supabase, prisma);

    // No storage deletion for pool images
    expect(removeFn).not.toHaveBeenCalled();

    // Pool images recycled
    expect(updateManyFn).toHaveBeenCalledWith({
      where: { postId: "post-1" },
      data: { status: "available", postId: null },
    });
  });

  it("handles mixed pool and non-pool images correctly", async () => {
    const removeFn = vi.fn().mockResolvedValue({ error: null });
    const supabase = makeMockSupabase(removeFn);
    const updateManyFn = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = makeMockPrisma(updateManyFn);

    const poolUrl = `${SUPABASE_BASE}/pool/reusable.webp`;
    const directUrl = `${SUPABASE_BASE}/sites/s1/generated.webp`;

    const images = [
      { id: "img-1", url: poolUrl },
      { id: "img-2", url: directUrl },
    ];
    const imagePool = [{ id: "pool-1", url: poolUrl }];

    await cleanupPostImages("post-1", images, imagePool, supabase, prisma);

    // Only non-pool image deleted from storage
    expect(removeFn).toHaveBeenCalledWith(["sites/s1/generated.webp"]);

    // Pool images recycled
    expect(updateManyFn).toHaveBeenCalledWith({
      where: { postId: "post-1" },
      data: { status: "available", postId: null },
    });
  });

  it("does not throw when storage delete fails (best-effort)", async () => {
    const removeFn = vi.fn().mockResolvedValue({
      error: { message: "Bucket not found" },
    });
    const supabase = makeMockSupabase(removeFn);
    const prisma = makeMockPrisma();

    const images = [{ id: "img-1", url: `${SUPABASE_BASE}/sites/s1/img.webp` }];

    // Should not throw
    await expect(
      cleanupPostImages("post-1", images, [], supabase, prisma),
    ).resolves.toBeUndefined();

    expect(console.error).toHaveBeenCalledWith(
      "[image-cleanup] Storage delete error:",
      "Bucket not found",
    );
  });

  it("does not throw when prisma updateMany fails (best-effort)", async () => {
    const supabase = makeMockSupabase();
    const updateManyFn = vi.fn().mockRejectedValue(new Error("DB connection lost"));
    const prisma = makeMockPrisma(updateManyFn);

    const poolUrl = `${SUPABASE_BASE}/pool/img.webp`;
    const images = [{ id: "img-1", url: poolUrl }];
    const imagePool = [{ id: "pool-1", url: poolUrl }];

    await expect(
      cleanupPostImages("post-1", images, imagePool, supabase, prisma),
    ).resolves.toBeUndefined();

    expect(console.error).toHaveBeenCalledWith(
      "[image-cleanup] Cleanup failed:",
      "DB connection lost",
    );
  });

  it("skips storage call when all images are from pool", async () => {
    const removeFn = vi.fn().mockResolvedValue({ error: null });
    const supabase = makeMockSupabase(removeFn);
    const prisma = makeMockPrisma();

    const poolUrl = `${SUPABASE_BASE}/pool/img.webp`;
    const images = [{ id: "img-1", url: poolUrl }];
    const imagePool = [{ id: "pool-1", url: poolUrl }];

    await cleanupPostImages("post-1", images, imagePool, supabase, prisma);

    expect(removeFn).not.toHaveBeenCalled();
  });

  it("skips everything when post has no images and no pool entries", async () => {
    const removeFn = vi.fn().mockResolvedValue({ error: null });
    const supabase = makeMockSupabase(removeFn);
    const updateManyFn = vi.fn().mockResolvedValue({ count: 0 });
    const prisma = makeMockPrisma(updateManyFn);

    await cleanupPostImages("post-1", [], [], supabase, prisma);

    expect(removeFn).not.toHaveBeenCalled();
    expect(updateManyFn).not.toHaveBeenCalled();
  });
});
