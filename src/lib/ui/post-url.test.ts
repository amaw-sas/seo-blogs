import { describe, it, expect } from "vitest";
import { buildPostUrl } from "./post-url";

describe("buildPostUrl — construct published post URL from domain and slug", () => {
  it("returns https URL with domain and slug", () => {
    expect(buildPostUrl("alquilatucarro.com", "mejores-carros-2026")).toBe(
      "https://alquilatucarro.com/mejores-carros-2026"
    );
  });

  it("strips trailing slash from domain", () => {
    expect(buildPostUrl("example.com/", "my-post")).toBe(
      "https://example.com/my-post"
    );
  });

  it("strips leading slash from slug", () => {
    expect(buildPostUrl("example.com", "/my-post")).toBe(
      "https://example.com/my-post"
    );
  });

  it("handles domain with protocol — strips and re-adds https", () => {
    expect(buildPostUrl("http://example.com", "my-post")).toBe(
      "https://example.com/my-post"
    );
  });

  it("returns null when domain is empty", () => {
    expect(buildPostUrl("", "my-post")).toBeNull();
  });

  it("returns null when slug is empty", () => {
    expect(buildPostUrl("example.com", "")).toBeNull();
  });
});
