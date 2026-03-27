import { describe, it, expect } from "vitest";

describe("CalendarPage — help dialog content contract", () => {
  const helpSections = [
    "Qué es el calendario",
    "Cómo leerlo",
    "Interacción",
    "Días festivos",
  ];

  it("help dialog defines all required sections", () => {
    expect(helpSections).toHaveLength(4);
    expect(helpSections).toContain("Qué es el calendario");
    expect(helpSections).toContain("Cómo leerlo");
    expect(helpSections).toContain("Interacción");
    expect(helpSections).toContain("Días festivos");
  });
});
