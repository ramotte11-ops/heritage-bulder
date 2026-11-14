import { describe, expect, it } from "vitest";
import { isAcceptableNewEmail, isValidEmail } from "./validate-email";

describe("isAcceptableNewEmail (QG 004-G — same rule as the browser, plus a dot)", () => {
  it("accepts ordinary addresses, aliases, sub-domains and surrounding spaces", () => {
    for (const ok of ["famille@example.com", "Marie.Dupont+hommage@mail.example.fr", "a_b-c@sub.example.co.uk", "  famille@example.com  "]) {
      expect(isAcceptableNewEmail(ok), ok).toBe(true);
    }
  });

  it("refuses everything the browser refused, and an address without a dot in the domain", () => {
    for (const bad of [
      "", "famille", "famille@example", "famille dupont@example.com", "marié@example.com", "famille@exämple.com",
      "famille,dupont@example.com", "famille@example.com.", "famille@@example.com", "famille@example..com",
      "famille@-example.com", "famille@example.com;", "famille@example.com​", "’famille@example.com",
    ]) {
      expect(isAcceptableNewEmail(bad), JSON.stringify(bad)).toBe(false);
    }
  });
});

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
