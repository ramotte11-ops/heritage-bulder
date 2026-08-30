import { describe, expect, it } from "vitest";
import { isValidEmail } from "./validate-email";

describe("isValidEmail", () => {
  it("accepts a plausible email address", () => {
    expect(isValidEmail("rany@example.com")).toBe(true);
  });

  it("accepts an address with surrounding whitespace", () => {
    expect(isValidEmail("  rany@example.com  ")).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(isValidEmail("")).toBe(false);
  });

  it("rejects a string with no @", () => {
    expect(isValidEmail("rany.example.com")).toBe(false);
  });

  it("rejects a string with no domain extension", () => {
    expect(isValidEmail("rany@example")).toBe(false);
  });

  it("rejects a string containing spaces", () => {
    expect(isValidEmail("rany doe@example.com")).toBe(false);
  });
});
