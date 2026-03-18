import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("freepik-client", () => {
  let generateImageWithFreepik: typeof import("./freepik-client").generateImageWithFreepik;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn());
    process.env.FREEPIK_API_KEY = "FPSXtest123";
    const mod = await import("./freepik-client");
    generateImageWithFreepik = mod.generateImageWithFreepik;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.FREEPIK_API_KEY;
  });

  // S1: Happy path — POST creates task, poll returns completed, download returns image
  it("generates image via Mystic: create task → poll → download", async () => {
    const mockFetch = vi.mocked(globalThis.fetch);

    // 1. POST /v1/ai/mystic → task_id
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { task_id: "task-abc" } }), { status: 200 }),
    );
    // 2. GET /v1/ai/mystic/task-abc → completed with image URL
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({
        data: { status: "COMPLETED", generated: ["https://cdn.freepik.com/img.jpg"] },
      }), { status: 200 }),
    );
    // 3. Download image
    mockFetch.mockResolvedValueOnce(
      new Response(Buffer.from("fake-image-bytes"), { status: 200 }),
    );

    const buffer = await generateImageWithFreepik("A photo of a car in Cartagena", "16:9");

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.toString()).toBe("fake-image-bytes");

    // Verify POST call
    const [postUrl, postOpts] = mockFetch.mock.calls[0]!;
    expect(postUrl).toBe("https://api.freepik.com/v1/ai/mystic");
    expect((postOpts?.headers as Record<string, string>)["x-freepik-api-key"]).toBe("FPSXtest123");
    const postBody = JSON.parse(postOpts?.body as string);
    expect(postBody.prompt).toContain("car in Cartagena");
    expect(postBody.resolution).toBe("2K");

    // Verify poll call
    const [pollUrl] = mockFetch.mock.calls[1]!;
    expect(pollUrl).toBe("https://api.freepik.com/v1/ai/mystic/task-abc");
  });

  // S2: Freepik API error → throws (caller handles fallback)
  it("throws when Freepik API returns error", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response("Internal Server Error", { status: 500 }),
    );

    await expect(generateImageWithFreepik("prompt", "16:9"))
      .rejects.toThrow(/Freepik API error/);
  });

  // S3: Polling timeout → throws after max attempts
  it("throws on polling timeout when task never completes", async () => {
    const mockFetch = vi.mocked(globalThis.fetch);

    // POST succeeds
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { task_id: "task-slow" } }), { status: 200 }),
    );
    // All polls return IN_PROGRESS
    for (let i = 0; i < 30; i++) {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { status: "IN_PROGRESS" } }), { status: 200 }),
      );
    }

    await expect(generateImageWithFreepik("prompt", "16:9", { maxPollAttempts: 3, pollIntervalMs: 0 }))
      .rejects.toThrow(/timed out/i);
  });

  // S5: No API key → throws immediately
  it("throws when FREEPIK_API_KEY is not set", async () => {
    delete process.env.FREEPIK_API_KEY;
    vi.resetModules();
    const mod = await import("./freepik-client");

    await expect(mod.generateImageWithFreepik("prompt", "16:9"))
      .rejects.toThrow(/FREEPIK_API_KEY/);
  });

  // Poll retries on PROCESSING status before completing
  it("polls multiple times until task completes", async () => {
    const mockFetch = vi.mocked(globalThis.fetch);

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { task_id: "task-retry" } }), { status: 200 }),
    );
    // First poll: processing
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { status: "IN_PROGRESS" } }), { status: 200 }),
    );
    // Second poll: completed
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({
        data: { status: "COMPLETED", generated: ["https://cdn.freepik.com/img2.jpg"] },
      }), { status: 200 }),
    );
    // Download
    mockFetch.mockResolvedValueOnce(
      new Response(Buffer.from("image-data"), { status: 200 }),
    );

    const buffer = await generateImageWithFreepik("prompt", "16:9", { pollIntervalMs: 0 });

    expect(buffer).toBeInstanceOf(Buffer);
    expect(mockFetch).toHaveBeenCalledTimes(4); // POST + 2 polls + download
  });

  // Task fails → throws
  it("throws when task status is FAILED", async () => {
    const mockFetch = vi.mocked(globalThis.fetch);

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { task_id: "task-fail" } }), { status: 200 }),
    );
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { status: "FAILED", error: "Content policy" } }), { status: 200 }),
    );

    await expect(generateImageWithFreepik("prompt", "16:9", { pollIntervalMs: 0 }))
      .rejects.toThrow(/failed.*Content policy/i);
  });
});
