import { describe, expect, it } from "vitest";
import {
  buildFamilyTributes,
  canCreateTribute,
  selectTribute,
  tributeState,
  tributeYears,
  type FamilyTribute,
} from "./family-space";

describe("tributeYears — years only, nothing invented", () => {
  it("joins the two years, whatever each date's precision", () => {
    expect(tributeYears({ precision: "date", date: "1948-03-02" }, { precision: "year", year: 2023 })).toBe("1948 – 2023");
  });

  it("shows the single known year, and nothing when none is entered", () => {
    expect(tributeYears({ precision: "year", year: 1939 }, null)).toBe("1939");
    expect(tributeYears(null, { precision: "date", date: "2022-01-09" })).toBe("2022");
    expect(tributeYears(null, null)).toBeNull();
  });

  it("ignores an unreadable stored date", () => {
    expect(tributeYears({ precision: "date", date: "bad" }, null)).toBeNull();
  });
});

describe("tributeState — the real status, fail closed", () => {
  it("is « published » only when the server decided the public page answers", () => {
    expect(tributeState("published", "abc123")).toBe("published");
    expect(tributeState("published", null)).toBe("no_longer_visible");
  });

  it("names why an unpublished tribute is not consultable", () => {
    expect(tributeState("draft", null)).toBe("in_preparation");
    expect(tributeState("ready", null)).toBe("in_preparation");
    expect(tributeState("editing", null)).toBe("editing");
    expect(tributeState("archived", null)).toBe("archived");
  });

  it("reads an unknown or missing status as a preparation", () => {
    expect(tributeState(null, null)).toBe("in_preparation");
    expect(tributeState(undefined, null)).toBe("in_preparation");
  });
});

const SUMMARY = { id: "a", displayName: "Jeanne", createdAt: "2026-01-01T00:00:00.000Z", language: "fr" as const, publicSlug: null };

describe("buildFamilyTributes", () => {
  it("keeps the list's order and enriches each tribute from ITS OWN details", () => {
    const tributes = buildFamilyTributes(
      [SUMMARY, { ...SUMMARY, id: "b", displayName: null, publicSlug: "slug-b" }],
      new Map([
        ["b", { memorialId: "b", status: "published", birth: { precision: "year", year: 1939 }, death: null, photo: { mediaId: "m", crop: null } }],
      ]),
    );

    expect(tributes.map((tribute) => tribute.id)).toEqual(["a", "b"]);
    expect(tributes[0]).toMatchObject({ state: "in_preparation", years: null, photo: null, publicSlug: null });
    expect(tributes[1]).toMatchObject({ state: "published", years: "1939", photo: { mediaId: "m", crop: null }, publicSlug: "slug-b" });
  });
});

function tribute(id: string, state: FamilyTribute["state"]): FamilyTribute {
  return { id, displayName: id, language: null, state, years: null, photo: null, publicSlug: null, freeDeadlines: null };
}

describe("selectTribute — a URL claim, never trusted", () => {
  const list = [tribute("a", "published"), tribute("b", "published"), tribute("c", "in_preparation")];

  it("honours a requested id only when it is one of the family's tributes", () => {
    expect(selectTribute(list, "c")?.id).toBe("c");
    expect(selectTribute(list, "someone-else")?.id).toBe("b");
  });

  it("defaults to the most recent tribute that has been published, else the most recent", () => {
    expect(selectTribute(list, null)?.id).toBe("b");
    expect(selectTribute([tribute("x", "in_preparation"), tribute("y", "in_preparation")], null)?.id).toBe("y");
    expect(selectTribute([], null)).toBeNull();
  });
});

describe("canCreateTribute — the account's official counter", () => {
  it("is open below the limit and closed at it", () => {
    expect(canCreateTribute({ status: "opens_on_next_save", activeFreeDrafts: 2, maxFreeDrafts: 3 })).toBe(true);
    expect(canCreateTribute({ status: "used", renewsAt: null, activeFreeDrafts: 3, maxFreeDrafts: 3 })).toBe(false);
  });

  it("stays open when the counter is unavailable", () => {
    expect(canCreateTribute({ status: "unknown" })).toBe(true);
  });
});
