import { describe, it, expect } from "vitest";
import {
  parseKnowledgeBase,
  composeKnowledgeBase,
  estimateTokens,
  countWords,
  EMPTY_FIELDS,
} from "./knowledge-base";

describe("parseKnowledgeBase", () => {
  it("returns empty fields for null input", () => {
    expect(parseKnowledgeBase(null)).toEqual(EMPTY_FIELDS);
  });

  it("returns empty fields for empty string", () => {
    expect(parseKnowledgeBase("")).toEqual(EMPTY_FIELDS);
  });

  it("parses structured text with known labels", () => {
    const text = `Nombre del negocio: RentaCar Bogotá
Servicios u oferta: Alquiler de carros
Ubicaciones o zonas: Bogotá, Medellín
Precios o rangos: Desde $80.000/día`;

    const result = parseKnowledgeBase(text);
    expect(result.businessName).toBe("RentaCar Bogotá");
    expect(result.services).toBe("Alquiler de carros");
    expect(result.locations).toBe("Bogotá, Medellín");
    expect(result.pricing).toBe("Desde $80.000/día");
  });

  it("puts unmatched lines in extra", () => {
    const text = `Somos una empresa de alquiler de vehículos.
Tenemos 10 años de experiencia.`;

    const result = parseKnowledgeBase(text);
    expect(result.extra).toBe(
      "Somos una empresa de alquiler de vehículos.\nTenemos 10 años de experiencia."
    );
    expect(result.businessName).toBe("");
  });

  it("handles mixed structured and unstructured text", () => {
    const text = `Nombre del negocio: MiEmpresa
Algo que no encaja en ningún campo
Tono de comunicación: Profesional pero cercano`;

    const result = parseKnowledgeBase(text);
    expect(result.businessName).toBe("MiEmpresa");
    expect(result.tone).toBe("Profesional pero cercano");
    expect(result.extra).toBe("Algo que no encaja en ningún campo");
  });

  it("puts continuation lines without labels into extra", () => {
    const text = `Servicios u oferta: Alquiler de carros
SUVs, sedanes, camionetas`;

    const result = parseKnowledgeBase(text);
    expect(result.services).toBe("Alquiler de carros");
    expect(result.extra).toBe("SUVs, sedanes, camionetas");
  });
});

describe("composeKnowledgeBase", () => {
  it("composes fields into labeled text", () => {
    const result = composeKnowledgeBase({
      ...EMPTY_FIELDS,
      businessName: "RentaCar Bogotá",
      services: "Alquiler de carros",
    });

    expect(result).toBe(
      "Nombre del negocio: RentaCar Bogotá\nServicios u oferta: Alquiler de carros"
    );
  });

  it("skips empty fields", () => {
    const result = composeKnowledgeBase({
      ...EMPTY_FIELDS,
      businessName: "MiEmpresa",
    });

    expect(result).toBe("Nombre del negocio: MiEmpresa");
  });

  it("appends extra at the end", () => {
    const result = composeKnowledgeBase({
      ...EMPTY_FIELDS,
      businessName: "Test",
      extra: "Información adicional aquí",
    });

    expect(result).toBe(
      "Nombre del negocio: Test\nInformación adicional aquí"
    );
  });

  it("roundtrips: compose then parse returns same fields", () => {
    const original = {
      ...EMPTY_FIELDS,
      businessName: "RentaCar",
      services: "Alquiler",
      locations: "Bogotá",
      tone: "Profesional",
    };
    const text = composeKnowledgeBase(original);
    const parsed = parseKnowledgeBase(text);

    expect(parsed.businessName).toBe(original.businessName);
    expect(parsed.services).toBe(original.services);
    expect(parsed.locations).toBe(original.locations);
    expect(parsed.tone).toBe(original.tone);
  });
});

describe("estimateTokens", () => {
  it("estimates tokens from word count", () => {
    // 10 words × 1.33 ≈ 13 tokens
    const tokens = estimateTokens("una dos tres cuatro cinco seis siete ocho nueve diez");
    expect(tokens).toBe(13);
  });

  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });
});

describe("countWords", () => {
  it("counts words correctly", () => {
    expect(countWords("Alquiler de carros en Bogotá")).toBe(5);
  });

  it("returns 0 for empty string", () => {
    expect(countWords("")).toBe(0);
  });
});
