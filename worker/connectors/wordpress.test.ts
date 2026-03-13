import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { WpPostData, WpSiteConfig } from "./wordpress";

// ── Mocks ────────────────────────────────────────────────────

vi.mock("../../src/lib/seo/sitemap", () => ({
  pingGoogle: vi.fn().mockResolvedValue(true),
}));

const mockSite: WpSiteConfig = {
  apiUrl: "https://example.com/wp-json",
  apiUser: "admin",
  apiPassword: "secret",
  domain: "example.com",
};

const mockPost: WpPostData = {
  title: "Test Post",
  slug: "test-post",
  contentHtml: "<p>Hello world</p>",
  metaTitle: "Test Post | Example",
  metaDescription: "A test post description",
  status: "publish",
  categories: [1],
  tags: [10, 20],
  featuredMediaId: 42,
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function imageResponse(): Response {
  return new Response(Buffer.from("fake-image-bytes"), {
    status: 200,
    headers: { "Content-Type": "image/webp" },
  });
}

// ── Tests ────────────────────────────────────────────────────

describe("wordpress connector", () => {
  let publishToWordPress: typeof import("./wordpress").publishToWordPress;
  let uploadMediaToWordPress: typeof import("./wordpress").uploadMediaToWordPress;
  let updateWordPressPost: typeof import("./wordpress").updateWordPressPost;
  let pingGoogle: typeof import("../../src/lib/seo/sitemap").pingGoogle;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());

    // Fresh import per test to reset module state
    const wpMod = await import("./wordpress");
    publishToWordPress = wpMod.publishToWordPress;
    uploadMediaToWordPress = wpMod.uploadMediaToWordPress;
    updateWordPressPost = wpMod.updateWordPressPost;

    const sitemapMod = await import("../../src/lib/seo/sitemap");
    pingGoogle = sitemapMod.pingGoogle;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ── publishToWordPress ─────────────────────────────────

  describe("publishToWordPress", () => {
    it("sends POST with correct URL, auth, and body", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 123, link: "https://example.com/test-post", status: "publish" }));

      const id = await publishToWordPress(mockPost, mockSite);

      expect(id).toBe("123");
      expect(mockFetch).toHaveBeenCalledOnce();

      const [url, opts] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://example.com/wp-json/wp/v2/posts");
      expect(opts?.method).toBe("POST");

      const body = JSON.parse(opts?.body as string);
      expect(body.title).toBe("Test Post");
      expect(body.slug).toBe("test-post");
      expect(body.status).toBe("publish");
      expect(body.categories).toEqual([1]);
      expect(body.tags).toEqual([10, 20]);
      expect(body.featured_media).toBe(42);
      expect(body.meta._yoast_wpseo_title).toBe("Test Post | Example");
    });

    it("sends Basic auth header", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(jsonResponse({ id: 1 }));
      await publishToWordPress(mockPost, mockSite);

      const headers = vi.mocked(globalThis.fetch).mock.calls[0]![1]?.headers as Record<string, string>;
      const expected = Buffer.from("admin:secret").toString("base64");
      expect(headers.Authorization).toBe(`Basic ${expected}`);
    });

    it("pings Google sitemap after successful publish when domain is set", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(jsonResponse({ id: 1 }));
      await publishToWordPress(mockPost, mockSite);

      expect(pingGoogle).toHaveBeenCalledWith("https://example.com/sitemap.xml");
    });

    it("does NOT ping Google when domain is absent", async () => {
      vi.mocked(pingGoogle).mockClear();
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(jsonResponse({ id: 1 }));
      await publishToWordPress(mockPost, { ...mockSite, domain: undefined });

      expect(pingGoogle).not.toHaveBeenCalled();
    });

    it("normalizes trailing slashes in apiUrl", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(jsonResponse({ id: 1 }));
      await publishToWordPress(mockPost, { ...mockSite, apiUrl: "https://example.com/wp-json///" });

      const url = vi.mocked(globalThis.fetch).mock.calls[0]![0];
      expect(url).toBe("https://example.com/wp-json/wp/v2/posts");
    });

    it("omits optional fields when not provided", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(jsonResponse({ id: 1 }));
      const minimalPost: WpPostData = {
        title: "Min",
        slug: "min",
        contentHtml: "<p>x</p>",
        metaTitle: "Min",
        metaDescription: "d",
        status: "draft",
      };
      await publishToWordPress(minimalPost, mockSite);

      const body = JSON.parse(vi.mocked(globalThis.fetch).mock.calls[0]![1]?.body as string);
      expect(body.categories).toBeUndefined();
      expect(body.tags).toBeUndefined();
      expect(body.featured_media).toBeUndefined();
    });

    it("throws on 4xx client error without retrying", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response("Not Found", { status: 404 }),
      );

      await expect(publishToWordPress(mockPost, mockSite)).rejects.toThrow("WordPress API error 404");
      expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledOnce();
    });

    it("retries on 500 with exponential backoff", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);
      mockFetch
        .mockResolvedValueOnce(new Response("", { status: 500 }))
        .mockResolvedValueOnce(jsonResponse({ id: 99 }));

      const promise = publishToWordPress(mockPost, mockSite);
      // Advance past first backoff (30s)
      await vi.advanceTimersByTimeAsync(30_000);
      const id = await promise;

      expect(id).toBe("99");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("retries on 429 rate limit", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);
      mockFetch
        .mockResolvedValueOnce(new Response("", { status: 429 }))
        .mockResolvedValueOnce(jsonResponse({ id: 7 }));

      const promise = publishToWordPress(mockPost, mockSite);
      await vi.advanceTimersByTimeAsync(30_000);
      const id = await promise;

      expect(id).toBe("7");
    });

    it("fails after MAX_RETRIES exhausted", async () => {
      vi.mocked(globalThis.fetch).mockImplementation(async () => new Response("", { status: 500 }));

      const promise = publishToWordPress(mockPost, { ...mockSite, domain: undefined });
      // Attach rejection handler BEFORE advancing timers to avoid unhandled rejection
      const assertion = expect(promise).rejects.toThrow("failed after 3 retries");
      // Advance past all backoffs: 30s + 60s + 120s (total 210s covers all)
      await vi.advanceTimersByTimeAsync(210_000);

      await assertion;
    });
  });

  // ── uploadMediaToWordPress ─────────────────────────────

  describe("uploadMediaToWordPress", () => {
    it("downloads image then uploads to WP media endpoint", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);
      // 1st call: download image
      mockFetch.mockResolvedValueOnce(imageResponse());
      // 2nd call: upload to WP
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 55, source_url: "https://example.com/img.webp" }));
      // 3rd call: alt text update
      mockFetch.mockResolvedValueOnce(jsonResponse({}));

      const mediaId = await uploadMediaToWordPress(
        "https://images.example.com/photo.webp",
        "Alt text",
        mockSite,
      );

      expect(mediaId).toBe(55);

      // Verify upload call
      const uploadCall = mockFetch.mock.calls[1]!;
      expect(uploadCall[0]).toBe("https://example.com/wp-json/wp/v2/media");
      const uploadHeaders = uploadCall[1]?.headers as Record<string, string>;
      expect(uploadHeaders["Content-Type"]).toBe("image/webp");
      expect(uploadHeaders["Content-Disposition"]).toContain("photo.webp");
    });

    it("throws when image download fails", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response("", { status: 404 }),
      );

      await expect(
        uploadMediaToWordPress("https://bad.url/img.png", "alt", mockSite),
      ).rejects.toThrow("Failed to download image: 404");
    });

    it("sets alt text via separate API call", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);
      mockFetch.mockResolvedValueOnce(imageResponse());
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 10 }));
      mockFetch.mockResolvedValueOnce(jsonResponse({}));

      await uploadMediaToWordPress("https://img.example.com/x.webp", "My alt", mockSite);

      const altCall = mockFetch.mock.calls[2]!;
      expect(altCall[0]).toBe("https://example.com/wp-json/wp/v2/media/10");
      const altBody = JSON.parse(altCall[1]?.body as string);
      expect(altBody.alt_text).toBe("My alt");
    });

    it("skips alt text update when altText is empty", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);
      mockFetch.mockResolvedValueOnce(imageResponse());
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 10 }));

      await uploadMediaToWordPress("https://img.example.com/x.webp", "", mockSite);

      // Only 2 calls: download + upload, no alt text update
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  // ── updateWordPressPost ────────────────────────────────

  describe("updateWordPressPost", () => {
    it("sends PUT to correct endpoint with post ID", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(jsonResponse({ id: 456 }));

      const id = await updateWordPressPost("456", mockPost, mockSite);

      expect(id).toBe("456");
      const [url, opts] = vi.mocked(globalThis.fetch).mock.calls[0]!;
      expect(url).toBe("https://example.com/wp-json/wp/v2/posts/456");
      expect(opts?.method).toBe("PUT");
    });

    it("retries on server error", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);
      mockFetch
        .mockResolvedValueOnce(new Response("", { status: 502 }))
        .mockResolvedValueOnce(jsonResponse({ id: 456 }));

      const promise = updateWordPressPost("456", mockPost, mockSite);
      await vi.advanceTimersByTimeAsync(30_000);
      const id = await promise;

      expect(id).toBe("456");
    });
  });
});
