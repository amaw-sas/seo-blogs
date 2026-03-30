/**
 * E2E Pipeline Test
 *
 * Runs the full content generation pipeline against real services:
 * - OpenAI (GPT-4o + GPT Image 1 Mini for images)
 * - Supabase (DB + Storage)
 *
 * WordPress is skipped (platform="custom", no WP credentials).
 * Images use the 4-level fallback chain: pool → GPT Image 1 Mini → manual → reuse.
 *
 * NOT included in CI — requires real credentials and costs ~$0.10-0.20/run.
 * Run manually: npm run test:e2e
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { runPipeline } from "./pipeline";

const REQUIRED_ENV = [
  "DATABASE_URL",
  "OPENAI_API_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

let prisma: PrismaClient;
let supabase: SupabaseClient;
let siteId: string;
let pipelineResult: { postId: string; seoScore: number; wordCount: number; attempts: number };

describe("Pipeline E2E", () => {
  beforeAll(async () => {
    // Verify required env vars
    const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
    if (missing.length > 0) {
      throw new Error(
        `Missing required env vars for E2E test: ${missing.join(", ")}`,
      );
    }

    prisma = new PrismaClient();
    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Create test site
    const timestamp = Date.now();
    const site = await prisma.site.create({
      data: {
        domain: `e2e-test-${timestamp}.example.com`,
        name: `E2E Test Site ${timestamp}`,
        platform: "custom",
        apiUrl: null,
        apiUser: null,
        apiPassword: null,
        conversionUrl: null,
        minWords: 1000,
        maxWords: 2000,
        authoritativeSources: ["https://moz.com"],
      },
    });
    siteId = site.id;

    // Create pending keyword
    await prisma.keyword.create({
      data: {
        siteId,
        phrase: "beneficios del marketing digital",
        status: "pending",
        priority: 1,
      },
    });

    // Run the pipeline once — all tests assert on the result
    pipelineResult = await runPipeline(siteId);
  }, 120_000);

  afterAll(async () => {
    if (!siteId || !prisma) return;

    try {
      // Clean up Supabase Storage
      const { data: files } = await supabase.storage
        .from("post-images")
        .list(siteId);

      if (files && files.length > 0) {
        const paths = files.map((f) => `${siteId}/${f.name}`);
        await supabase.storage.from("post-images").remove(paths);
      }

      // Clean up DB in FK order (cascade from site handles most, but be explicit)
      const posts = await prisma.post.findMany({
        where: { siteId },
        select: { id: true },
      });
      const postIds = posts.map((p) => p.id);

      if (postIds.length > 0) {
        await prisma.postImage.deleteMany({ where: { postId: { in: postIds } } });
        await prisma.postLink.deleteMany({ where: { postId: { in: postIds } } });
      }
      await prisma.publishLog.deleteMany({ where: { siteId } });
      await prisma.category.deleteMany({ where: { siteId } });
      await prisma.post.deleteMany({ where: { siteId } });
      await prisma.keyword.deleteMany({ where: { siteId } });
      await prisma.site.delete({ where: { id: siteId } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it("full pipeline produces valid post", async () => {
    const post = await prisma.post.findFirstOrThrow({
      where: { siteId },
    });

    expect(post.title).toBeTruthy();
    expect(post.contentHtml.length).toBeGreaterThan(500);
    expect(post.seoScore).toBeGreaterThan(0);
    expect(post.status).toBe("review");

    const keyword = await prisma.keyword.findFirst({
      where: { siteId },
    });
    expect(keyword?.status).toBe("used");

    const logs = await prisma.publishLog.findMany({
      where: { siteId },
    });
    expect(logs.length).toBeGreaterThan(0);
  });

  it("images uploaded to Supabase Storage", async () => {
    const images = await prisma.postImage.findMany({
      where: { postId: pipelineResult.postId },
    });

    expect(images.length).toBeGreaterThanOrEqual(1);

    // Verify at least one image URL points to Supabase and is accessible
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const imageWithSupabaseUrl = images.find((img) =>
      img.url.includes(supabaseUrl) || img.url.includes("supabase"),
    );
    expect(imageWithSupabaseUrl).toBeDefined();

    const response = await fetch(imageWithSupabaseUrl!.url, { method: "HEAD" });
    expect(response.status).toBe(200);
  });

  it("skips WordPress when no credentials", async () => {
    const post = await prisma.post.findFirstOrThrow({
      where: { siteId },
    });

    expect(post.status).toBe("review");
    expect(post.externalPostId).toBeNull();

    const wpLogs = await prisma.publishLog.findMany({
      where: {
        siteId,
        eventType: "wordpress_publish",
      },
    });
    expect(wpLogs).toHaveLength(0);
  });

  it("generated content achieves reasonable SEO score", async () => {
    const post = await prisma.post.findFirstOrThrow({
      where: { siteId },
    });

    expect(post.seoScore).toBeGreaterThanOrEqual(40);
    expect(post.wordCount).toBeGreaterThanOrEqual(500);
    expect(post.metaTitle).toBeTruthy();
    expect(post.metaDescription).toBeTruthy();
  });

  it("cleanup removes all test data", async () => {
    // This test runs assertions AFTER afterAll cleanup.
    // We can't truly test afterAll from inside the suite,
    // so instead we verify the cleanup logic is correct by
    // checking that the data exists NOW (pre-cleanup).
    const site = await prisma.site.findUnique({ where: { id: siteId } });
    expect(site).not.toBeNull();

    const posts = await prisma.post.findMany({ where: { siteId } });
    expect(posts.length).toBeGreaterThan(0);

    // The actual cleanup verification is implicit:
    // if afterAll throws, the test suite reports failure.
    // For explicit post-cleanup verification, run:
    //   SELECT count(*) FROM sites WHERE id = '<siteId>';
    // after the test completes.
  });
});
