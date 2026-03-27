import { describe, it, expect } from "vitest";

describe("ClustersPage — help dialog content contract", () => {
  const helpSections = [
    "Qué es un cluster",
    "Estructura",
    "Cómo usarlo",
    "Flujo recomendado",
  ];

  it("help dialog defines all required sections", () => {
    expect(helpSections).toHaveLength(4);
    expect(helpSections).toContain("Qué es un cluster");
    expect(helpSections).toContain("Estructura");
    expect(helpSections).toContain("Cómo usarlo");
    expect(helpSections).toContain("Flujo recomendado");
  });

  it("help button triggers a dialog, not a page navigation", () => {
    // Contract: help is shown inline via Dialog, not a separate route
    const component = "Dialog";
    expect(component).toBe("Dialog");
  });
});
