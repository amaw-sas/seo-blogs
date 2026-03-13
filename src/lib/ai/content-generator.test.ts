import { describe, it, expect } from "vitest";
import { extractJson } from "./content-generator";

describe("extractJson", () => {
  it("extracts plain JSON object", () => {
    const input = '{"key": "value"}';
    expect(JSON.parse(extractJson(input))).toEqual({ key: "value" });
  });

  it("extracts JSON from markdown code fences", () => {
    const input = '```json\n{"key": "value"}\n```';
    expect(JSON.parse(extractJson(input))).toEqual({ key: "value" });
  });

  it("extracts JSON from code fences without language", () => {
    const input = '```\n{"key": "value"}\n```';
    expect(JSON.parse(extractJson(input))).toEqual({ key: "value" });
  });

  it("handles surrounding text before JSON", () => {
    const input = 'Here is the result:\n{"key": "value"}';
    expect(JSON.parse(extractJson(input))).toEqual({ key: "value" });
  });

  it("handles nested braces", () => {
    const input = '{"outer": {"inner": "value"}}';
    expect(JSON.parse(extractJson(input))).toEqual({ outer: { inner: "value" } });
  });

  it("handles braces inside string values (HTML/CSS)", () => {
    const input = '{"html": "<div style=\\"color: red\\">text</div>"}';
    const parsed = JSON.parse(extractJson(input));
    expect(parsed.html).toContain("<div");
  });

  it("throws on input with no JSON object", () => {
    expect(() => extractJson("no json here")).toThrow("No JSON object found");
  });

  it("throws on unbalanced braces", () => {
    expect(() => extractJson('{"key": "value"')).toThrow("Unbalanced JSON braces");
  });
});
