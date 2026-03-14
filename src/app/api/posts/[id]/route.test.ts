import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    post: {
      findUnique: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
    postVersion: { create: vi.fn() },
    publishLog: { create: vi.fn() },
  },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));

const { mockDeleteFromWordPress } = vi.hoisted(() => ({
  mockDeleteFromWordPress: vi.fn(),
}));
vi.mock("../../../../../worker/connectors/wordpress", () => ({
  deleteFromWordPress: mockDeleteFromWordPress,
}));

import { DELETE } from "./route";

// ── Helpers ──────────────────────────────────────────────────

function makeRequest(id: string, deleteExternal?: boolean): [NextRequest, { params: Promise<{ id: string }> }] {
  const url = deleteExternal
    ? `http://localhost/api/posts/${id}?deleteExternal=true`
    : `http://localhost/api/posts/${id}`;
  const req = new NextRequest(url, { method: "DELETE" });
  const ctx = { params: Promise.resolve({ id }) };
  return [req, ctx];
}

const publishedPost = {
  id: "post-1",
  title: "Test Post",
  externalPostId: "42",
  siteId: "site-1",
  site: {
    id: "site-1",
    platform: "wordpress",
    apiUrl: "https://blog.example.com/wp-json",
    apiUser: "admin",
    apiPassword: "pass",
  },
};

const draftPost = {
  id: "post-2",
  title: "Draft Post",
  externalPostId: null,
  siteId: "site-1",
  site: {
    id: "site-1",
    platform: "wordpress",
    apiUrl: "https://blog.example.com/wp-json",
    apiUser: "admin",
    apiPassword: "pass",
  },
};

const customPlatformPost = {
  id: "post-3",
  title: "Custom Post",
  externalPostId: "99",
  siteId: "site-2",
  site: {
    id: "site-2",
    platform: "custom",
    apiUrl: null,
    apiUser: null,
    apiPassword: null,
  },
};

// ── Tests ────────────────────────────────────────────────────

describe("DELETE /api/posts/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes post from DB without external call when deleteExternal is absent", async () => {
    mockPrisma.post.findUnique.mockResolvedValue(publishedPost);
    mockPrisma.post.delete.mockResolvedValue(publishedPost);

    const [req, ctx] = makeRequest("post-1");
    const res = await DELETE(req, ctx);
    const body = await res.json();

    expect(body.deleted).toBe(true);
    expect(body.externalDeleted).toBeNull();
    expect(mockDeleteFromWordPress).not.toHaveBeenCalled();
    expect(mockPrisma.post.delete).toHaveBeenCalledWith({ where: { id: "post-1" } });
  });

  it("deletes DB first, then WordPress when deleteExternal=true", async () => {
    const callOrder: string[] = [];
    mockPrisma.post.findUnique.mockResolvedValue(publishedPost);
    mockPrisma.post.delete.mockImplementation(async () => {
      callOrder.push("db_delete");
      return publishedPost;
    });
    mockPrisma.publishLog.create.mockResolvedValue({});
    mockDeleteFromWordPress.mockImplementation(async () => {
      callOrder.push("wp_delete");
    });

    const [req, ctx] = makeRequest("post-1", true);
    const res = await DELETE(req, ctx);
    const body = await res.json();

    expect(body.deleted).toBe(true);
    expect(body.externalDeleted).toBe(true);
    expect(callOrder).toEqual(["db_delete", "wp_delete"]);
    expect(mockDeleteFromWordPress).toHaveBeenCalledWith("42", {
      apiUrl: "https://blog.example.com/wp-json",
      apiUser: "admin",
      apiPassword: "pass",
    });
    // postId is null because post was already deleted from DB
    expect(mockPrisma.publishLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        siteId: "site-1",
        postId: null,
        eventType: "external_delete",
        status: "success",
      }),
    });
  });

  it("deletes from DB even when WordPress delete fails, logs error", async () => {
    mockPrisma.post.findUnique.mockResolvedValue(publishedPost);
    mockPrisma.post.delete.mockResolvedValue(publishedPost);
    mockPrisma.publishLog.create.mockResolvedValue({});
    mockDeleteFromWordPress.mockRejectedValue(new Error("WordPress API error 403: Forbidden"));

    const [req, ctx] = makeRequest("post-1", true);
    const res = await DELETE(req, ctx);
    const body = await res.json();

    expect(body.deleted).toBe(true);
    expect(body.externalDeleted).toBe(false);
    expect(body.externalError).toContain("403");
    expect(mockPrisma.post.delete).toHaveBeenCalledWith({ where: { id: "post-1" } });
    expect(mockPrisma.publishLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        postId: null,
        eventType: "external_delete",
        status: "failed",
        errorMessage: expect.stringContaining("403"),
      }),
    });
  });

  it("skips external delete for post without externalPostId", async () => {
    mockPrisma.post.findUnique.mockResolvedValue(draftPost);
    mockPrisma.post.delete.mockResolvedValue(draftPost);

    const [req, ctx] = makeRequest("post-2", true);
    const res = await DELETE(req, ctx);
    const body = await res.json();

    expect(body.deleted).toBe(true);
    expect(body.externalDeleted).toBeNull();
    expect(mockDeleteFromWordPress).not.toHaveBeenCalled();
  });

  it("logs 'skipped' for custom platform with externalPostId", async () => {
    mockPrisma.post.findUnique.mockResolvedValue(customPlatformPost);
    mockPrisma.post.delete.mockResolvedValue(customPlatformPost);
    mockPrisma.publishLog.create.mockResolvedValue({});

    const [req, ctx] = makeRequest("post-3", true);
    const res = await DELETE(req, ctx);
    const body = await res.json();

    expect(body.deleted).toBe(true);
    expect(body.externalDeleted).toBe(false);
    expect(mockDeleteFromWordPress).not.toHaveBeenCalled();
    expect(mockPrisma.publishLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "external_delete",
        status: "skipped",
      }),
    });
  });

  it("returns 404 when post does not exist", async () => {
    mockPrisma.post.findUnique.mockResolvedValue(null);

    const [req, ctx] = makeRequest("nonexistent");
    const res = await DELETE(req, ctx);

    expect(res.status).toBe(404);
  });
});
