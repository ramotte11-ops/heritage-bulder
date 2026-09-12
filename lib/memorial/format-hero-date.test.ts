import { describe, expect, it } from "vitest";
import { formatHeroDate, formatHeroDateRange } from "./format-hero-date";

describe("formatHeroDate", () => {
  it("renders a year-precision date as the bare year, in every language", () => {
    expect(formatHeroDate({ precision: "year", year: 1948 }, "fr")).toBe("1948");
    expect(formatHeroDate({ precision: "year", year: 1948 }, "en")).toBe("1948");
    expect(formatHeroDate({ precision: "year", year: 1948 }, "es")).toBe("1948");
  });

  it("renders a full date, localized per language", () => {
    expect(formatHeroDate({ precision: "date", date: "1948-03-17" }, "fr")).toBe("17 mars 1948");
    expect(formatHeroDate({ precision: "date", date: "1948-03-17" }, "en")).toBe("March 17, 1948");
  });

  it("never shifts the calendar day due to a viewer's own timezone (parses at UTC)", () => {
    // A naive `new Date("1948-03-17")` interpreted in a negative-offset
    // local timezone can read back as March 16 — this must not happen.
    const formatted = formatHeroDate({ precision: "date", date: "2023-01-01" }, "en");
    expect(formatted).toContain("January 1, 2023");
  });
});

describe("formatHeroDateRange — section 11's exact display rule", () => {
  it("joins two dates with an en dash separator", () => {
    expect(
      formatHeroDateRange(
        { precision: "year", year: 1948 },
        { precision: "year", year: 2023 },
        "fr",
      ),
    ).toBe("1948 – 2023");
  });

  it("renders the single date alone when only one is present", () => {
    expect(formatHeroDateRange({ precision: "year", year: 1948 }, null, "fr")).toBe("1948");
    expect(formatHeroDateRange(null, { precision: "year", year: 2023 }, "fr")).toBe("2023");
  });

  it("returns null (no component, no reserved space) when neither date is present", () => {
    expect(formatHeroDateRange(null, null, "fr")).toBeNull();
  });
});
