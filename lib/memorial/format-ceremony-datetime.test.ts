import { describe, expect, it } from "vitest";
import { formatCeremonyDate, formatCeremonyTime } from "./format-ceremony-datetime";

describe("formatCeremonyDate", () => {
  it("renders a capitalized French weekday + date (Studio QA reference)", () => {
    expect(formatCeremonyDate("2023-10-21", "fr")).toBe("Samedi 21 octobre 2023");
  });

  it("renders English", () => {
    expect(formatCeremonyDate("2023-10-21", "en")).toBe("Saturday, October 21, 2023");
  });

  it("renders Spanish, capitalized", () => {
    const result = formatCeremonyDate("2023-10-21", "es");
    expect(result.startsWith("S")).toBe(true);
    expect(result).toContain("21");
    expect(result).toContain("2023");
  });

  it("never shifts the calendar day regardless of the runtime's own timezone (UTC-parsed)", () => {
    expect(formatCeremonyDate("2023-01-01", "fr")).toContain("1 janvier 2023");
    expect(formatCeremonyDate("2023-12-31", "fr")).toContain("31 décembre 2023");
  });
});

describe("formatCeremonyTime", () => {
  it("renders the Studio's own French QA reference exactly", () => {
    expect(formatCeremonyTime("14:00", "fr")).toBe("à 14 h 00");
  });

  it("zero-pads minutes and hours in French", () => {
    expect(formatCeremonyTime("09:05", "fr")).toBe("à 09 h 05");
  });

  it("renders 12h English with AM/PM", () => {
    expect(formatCeremonyTime("14:00", "en")).toBe("at 2:00 PM");
    expect(formatCeremonyTime("00:30", "en")).toBe("at 12:30 AM");
    expect(formatCeremonyTime("12:00", "en")).toBe("at 12:00 PM");
  });

  it("renders Spanish 24h", () => {
    expect(formatCeremonyTime("14:00", "es")).toBe("a las 14:00");
  });
});
