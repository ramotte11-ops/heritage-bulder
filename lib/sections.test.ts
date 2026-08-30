import { describe, expect, it } from "vitest";
import { getOrderedSections } from "./sections";

describe("getOrderedSections", () => {
  it("always includes core sections for the announcement context", () => {
    const result = getOrderedSections("announcement", []);
    const ids = result.map((s) => s.id);

    expect(ids).toContain("hero");
    expect(ids).toContain("deathNotice");
  });

  it("always includes the core hero section for the remembrance context", () => {
    const result = getOrderedSections("remembrance", []);
    expect(result.map((s) => s.id)).toEqual(["hero"]);
  });

  it("includes an optional section only when enabled", () => {
    const withoutGallery = getOrderedSections("announcement", []);
    const withGallery = getOrderedSections("announcement", ["gallery"]);

    expect(withoutGallery.map((s) => s.id)).not.toContain("gallery");
    expect(withGallery.map((s) => s.id)).toContain("gallery");
  });

  it("never includes an optional section id from the other editorial context", () => {
    // "ceremony" only exists for announcement; asking for it under
    // remembrance must not leak it in.
    const result = getOrderedSections("remembrance", ["ceremony"]);
    expect(result.map((s) => s.id)).not.toContain("ceremony");
  });

  it("returns sections in the canonical configuration order, not the order enabledSectionIds were given", () => {
    const result = getOrderedSections("announcement", ["video", "story", "gallery"]);
    expect(result.map((s) => s.id)).toEqual(["hero", "deathNotice", "story", "gallery", "video"]);
  });

  it("never returns the Footer — it is not part of this list", () => {
    const result = getOrderedSections("announcement", [
      "story",
      "ceremony",
      "traditions",
      "gallery",
      "testimonials",
      "condolences",
      "video",
    ]);
    expect(result.map((s) => s.id)).not.toContain("footer");
  });
});
