import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma, mockRunPipeline, mockAfter } = vi.hoisted(() => {
  const txPublishLog = {
    findFirst: vi.fn(),
    create: vi.fn(),
  };
  return {
    mockPrisma: {
      site: { findUnique: vi.fn() },
      publishLog: { findFirst: vi.fn(), create: vi.fn() },
      $transaction: vi.fn((fn: (tx: unknown) => unknown) =>
        fn({ publishLog: txPublishLog }),
      ),
      _tx: txPublishLog,
    },
    mockRunPipeline: vi.fn(),
    mockAfter: vi.fn((fn: () => void) => fn()),
  };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("../../../../../../worker/pipeline", () => ({
  runPipeline: (...args: unknown[]) => mockRunPipeline(...args),
}));
vi.mock("next/server", async () => {
  const actual = await vi.importActual("next/server");
  return { ...actual, after: mockAfter };
});

import { POST } from "./route";
import { NextRequest } from "next/server";

function makeRequest(id: string) {
  const url = `http://localhost:3000/api/sites/${id}/generate`;
  const req = new NextRequest(url, { method: "POST" });
  const ctx = { params: Promise.resolve({ id }) };
  return { req, ctx };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset $transaction to execute callback with tx mock
  mockPrisma.$transaction.mockImplementation(
    (fn: (tx: unknown) => unknown) => fn({ publishLog: mockPrisma._tx }),
  );
  mockRunPipeline.mockResolvedValue({
    postId: "post-1",
    seoScore: 85,
    wordCount: 1800,
    attempts: 1,
  });
});

describe("POST /api/sites/[id]/generate", () => {
  it("returns 404 when site does not exist", async () => {
    mockPrisma.site.findUnique.mockResolvedValue(null);

    const { req, ctx } = makeRequest("nonexistent");
    const res = await POST(req, ctx);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/no encontrado|not found/i);
  });

  it("returns 400 when site is inactive", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({
      id: "site-1",
      active: false,
      _count: { keywords: 5 },
    });

    const { req, ctx } = makeRequest("site-1");
    const res = await POST(req, ctx);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/inactivo/i);
  });

  it("returns 400 when site has no pending keywords", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({
      id: "site-1",
      active: true,
      _count: { keywords: 0 },
    });

    const { req, ctx } = makeRequest("site-1");
    const res = await POST(req, ctx);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/keyword/i);
  });

  it("returns 409 when pipeline is already running", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({
      id: "site-1",
      active: true,
      _count: { keywords: 3 },
    });
    // tx.publishLog.findFirst returns active run, no terminal log
    mockPrisma._tx.findFirst
      .mockResolvedValueOnce({
        id: "log-1",
        eventType: "pipeline_run",
        status: "started",
        createdAt: new Date(),
      })
      .mockResolvedValueOnce(null); // no terminal log

    const { req, ctx } = makeRequest("site-1");
    const res = await POST(req, ctx);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/progreso/i);
  });

  it("allows new run when previous run has terminal log", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({
      id: "site-1",
      active: true,
      _count: { keywords: 3 },
    });
    // tx.publishLog.findFirst: active run exists, AND terminal log exists
    mockPrisma._tx.findFirst
      .mockResolvedValueOnce({
        id: "log-1",
        eventType: "pipeline_run",
        status: "started",
        createdAt: new Date(),
      })
      .mockResolvedValueOnce({
        id: "log-2",
        eventType: "pipeline_run",
        status: "success",
        createdAt: new Date(),
      });
    mockPrisma._tx.create.mockResolvedValue({ id: "log-run-new" });

    const { req, ctx } = makeRequest("site-1");
    const res = await POST(req, ctx);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.runId).toBe("log-run-new");
  });

  it("returns 200 with runId and triggers pipeline in background", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({
      id: "site-1",
      active: true,
      _count: { keywords: 3 },
    });
    // No active run in transaction
    mockPrisma._tx.findFirst.mockResolvedValue(null);
    mockPrisma._tx.create.mockResolvedValue({ id: "log-run-1" });
    mockPrisma.publishLog.create.mockResolvedValue({ id: "log-success" });

    const { req, ctx } = makeRequest("site-1");
    const res = await POST(req, ctx);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.runId).toBe("log-run-1");
    expect(body.siteId).toBe("site-1");

    // Verify $transaction was called
    expect(mockPrisma.$transaction).toHaveBeenCalled();

    // Verify after() was called
    expect(mockAfter).toHaveBeenCalled();
  });

  it("logs pipeline_run/failed when runPipeline throws", async () => {
    mockPrisma.site.findUnique.mockResolvedValue({
      id: "site-1",
      active: true,
      _count: { keywords: 3 },
    });
    mockPrisma._tx.findFirst.mockResolvedValue(null);
    mockPrisma._tx.create.mockResolvedValue({ id: "log-run-1" });
    mockPrisma.publishLog.create.mockResolvedValue({ id: "log-fail" });
    mockRunPipeline.mockRejectedValue(new Error("No valid pending keywords"));

    const { req, ctx } = makeRequest("site-1");
    const res = await POST(req, ctx);

    expect(res.status).toBe(200);

    await vi.waitFor(() => {
      expect(mockPrisma.publishLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: "pipeline_run",
            status: "failed",
          }),
        }),
      );
    });
  });
});
