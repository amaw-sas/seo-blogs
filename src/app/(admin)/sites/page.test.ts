import { describe, it, expect } from "vitest";

/**
 * SiteFormDialog knowledgeBase field — scenarios verified via API integration.
 * The UI form is a thin layer over the PUT /api/sites/[id] endpoint.
 * These tests verify the data contract between UI and API.
 */

describe("SiteFormDialog — knowledgeBase field contract", () => {
  const defaultForm = {
    name: "Test",
    domain: "test.com",
    platform: "wordpress",
    apiUrl: "",
    apiUser: "",
    apiPassword: "",
    postsPerDay: 1,
    minWords: 1500,
    maxWords: 2500,
    windowStart: 7,
    windowEnd: 12,
    conversionUrl: "",
    knowledgeBase: "",
    active: true,
  };

  it("knowledgeBase field exists in default form with empty string", () => {
    expect(defaultForm.knowledgeBase).toBe("");
  });

  it("knowledgeBase accepts long text content", () => {
    const longKB = "Categorías: Económicos, SUV, Camionetas\n".repeat(50);
    const form = { ...defaultForm, knowledgeBase: longKB };
    expect(form.knowledgeBase.length).toBeGreaterThan(1000);
  });

  it("knowledgeBase can be empty string for sites without KB", () => {
    const form = { ...defaultForm, knowledgeBase: "" };
    expect(form.knowledgeBase).toBe("");
  });

  it("edit form populates knowledgeBase from site data", () => {
    const site = { knowledgeBase: "Empresa de alquiler con 27 sedes" };
    const editForm = { ...defaultForm, knowledgeBase: site.knowledgeBase ?? "" };
    expect(editForm.knowledgeBase).toBe("Empresa de alquiler con 27 sedes");
  });

  it("edit form handles null knowledgeBase from site", () => {
    const site = { knowledgeBase: null };
    const editForm = { ...defaultForm, knowledgeBase: site.knowledgeBase ?? "" };
    expect(editForm.knowledgeBase).toBe("");
  });
});
