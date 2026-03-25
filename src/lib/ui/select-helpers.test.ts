import { describe, it, expect } from "vitest";
import { resolveSiteLabel } from "./select-helpers";

describe("resolveSiteLabel — resolve display label for site selectors", () => {
  const sites = [
    { id: "cmmtaryc80012otu4pkijdirc", name: "Alquila tu Carro" },
    { id: "abc123", name: "Blog Viajes" },
  ];

  it("returns site name when filter matches a site id", () => {
    expect(resolveSiteLabel(sites, "cmmtaryc80012otu4pkijdirc")).toBe(
      "Alquila tu Carro"
    );
  });

  it("returns site name for any matching id", () => {
    expect(resolveSiteLabel(sites, "abc123")).toBe("Blog Viajes");
  });

  it("returns fallback when filter is empty string", () => {
    expect(resolveSiteLabel(sites, "", "Todos los sitios")).toBe(
      "Todos los sitios"
    );
  });

  it("returns fallback when filter is 'all'", () => {
    expect(resolveSiteLabel(sites, "all", "Todos los sitios")).toBe(
      "Todos los sitios"
    );
  });

  it("returns fallback when filter matches no site", () => {
    expect(resolveSiteLabel(sites, "nonexistent", "Fallback")).toBe("Fallback");
  });

  it("returns undefined when no fallback and no match", () => {
    expect(resolveSiteLabel(sites, "nonexistent")).toBeUndefined();
  });

  it("returns undefined when sites array is empty", () => {
    expect(resolveSiteLabel([], "abc123")).toBeUndefined();
  });
});
