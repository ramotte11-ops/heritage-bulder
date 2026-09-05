import { describe, expect, it } from "vitest";
import { DEFAULT_RETURN_PATH, sanitizeReturnPath } from "./return-path";

describe("sanitizeReturnPath", () => {
  it.each([null, undefined, ""])("defaults to /owner for %j", (value) => {
    expect(sanitizeReturnPath(value)).toBe(DEFAULT_RETURN_PATH);
  });

  it("accepts an ordinary internal path", () => {
    expect(sanitizeReturnPath("/activate")).toBe("/activate");
  });

  it("accepts a nested internal path", () => {
    expect(sanitizeReturnPath("/builder/some-demo")).toBe("/builder/some-demo");
  });

  it.each([
    ["a protocol-relative URL", "//evil.example.com"],
    ["an absolute URL with a scheme", "https://evil.example.com/activate"],
    ["a path missing its leading slash", "activate"],
    ["a path carrying a query string", "/activate?x=1"],
    ["a path carrying a fragment", "/activate#hash"],
    ["a javascript: pseudo-scheme", "javascript:alert(1)"],
    ["a path with a space", "/acti vate"],
  ])("falls back to /owner for %s", (_label, value) => {
    expect(sanitizeReturnPath(value)).toBe(DEFAULT_RETURN_PATH);
  });
});
