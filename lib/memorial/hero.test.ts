import { describe, expect, it } from "vitest";
import {
  isHeroComplete,
  isHeroContentComplete,
  isHeroPhotoMediaUsable,
  parseHeroContent,
  readHero,
  setHeroBirth,
  setHeroCrop,
  setHeroDeath,
  setHeroDisplayName,
  setHeroPhotoMedia,
  setHeroShortPhrase,
  updateHero,
  validateHero,
  HERO_CROP_NEUTRAL_ZOOM,
} from "./hero";
import { EMPTY_HERO_CONTENT, type HeroContent } from "@/types/hero";
import type { MemorialContent } from "@/types/memorial";
import type { Media } from "@/types/media";

const MEDIA_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_MEDIA_ID = "22222222-2222-4222-8222-222222222222";

function readyMedia(overrides: Partial<Media> = {}): Media {
  return {
    id: MEDIA_ID,
    memorialId: "memorial-1",
    ownerId: "owner-1",
    storagePath: "memorial-1/media-1/original.jpg",
    mediaType: "photo",
    purpose: "hero",
    status: "ready",
    mimeType: "image/jpeg",
    originalFilename: null,
    sizeBytes: 12345,
    width: 800,
    height: 600,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const VALID_CROP = { focalX: 0.5, focalY: 0.4, zoom: 1.2 };

describe("parseHeroContent — displayName (T03)", () => {
  it("absent hero.displayName parses to null (incomplete, not invalid)", () => {
    const result = parseHeroContent({});
    expect(result).toEqual({ ok: true, hero: EMPTY_HERO_CONTENT });
  });

  it("blanks-only displayName normalizes to absent", () => {
    const result = parseHeroContent({ displayName: "   " });
    expect(result.ok && result.hero.displayName).toBe(null);
  });

  it("preserves accents, apostrophes, hyphens and composed names exactly", () => {
    const name = "Jean-Baptiste d'Aubigné-Château";
    const result = parseHeroContent({ displayName: name });
    expect(result.ok && result.hero.displayName).toBe(name);
  });

  it("trims only peripheral whitespace, not internal formatting", () => {
    const result = parseHeroContent({ displayName: "  Marie   Curie  " });
    expect(result.ok && result.hero.displayName).toBe("Marie   Curie");
  });

  it("never splits into first/last — the model has one displayName field only", () => {
    const result = parseHeroContent({ displayName: "Marcel Onésime" });
    expect(result.ok && result.hero).not.toHaveProperty("firstName");
    expect(result.ok && result.hero).not.toHaveProperty("lastName");
  });

  it("rejects a non-string displayName rather than casting it", () => {
    const result = parseHeroContent({ displayName: 42 });
    expect(result).toEqual({ ok: false, reason: "displayName" });
  });
});

describe("parseHeroContent — dates (T04)", () => {
  it("no dates at all is valid", () => {
    const result = parseHeroContent({});
    expect(result.ok && result.hero.birth).toBe(null);
    expect(result.ok && result.hero.death).toBe(null);
  });

  it("birth only is valid", () => {
    const result = parseHeroContent({ birth: { precision: "year", year: 1948 } });
    expect(result).toEqual({
      ok: true,
      hero: { ...EMPTY_HERO_CONTENT, birth: { precision: "year", year: 1948 } },
    });
  });

  it("death only is valid", () => {
    const result = parseHeroContent({ death: { precision: "year", year: 2026 } });
    expect(result.ok && result.hero.death).toEqual({ precision: "year", year: 2026 });
  });

  it("two bare years is valid", () => {
    const result = parseHeroContent({
      birth: { precision: "year", year: 1948 },
      death: { precision: "year", year: 2026 },
    });
    expect(result.ok).toBe(true);
  });

  it("a year plus a full date is valid", () => {
    const result = parseHeroContent({
      birth: { precision: "year", year: 1948 },
      death: { precision: "date", date: "2026-03-17" },
    });
    expect(result.ok).toBe(true);
  });

  it("two full dates is valid", () => {
    const result = parseHeroContent({
      birth: { precision: "date", date: "1948-03-17" },
      death: { precision: "date", date: "2026-01-05" },
    });
    expect(result.ok).toBe(true);
  });

  it("a real leap day is valid", () => {
    const result = parseHeroContent({ birth: { precision: "date", date: "2024-02-29" } });
    expect(result.ok).toBe(true);
  });

  it("2025-02-29 is invalid — 2025 is not a leap year", () => {
    const result = parseHeroContent({ birth: { precision: "date", date: "2025-02-29" } });
    expect(result).toEqual({ ok: false, reason: "birth" });
  });

  it("a bare year is never upgraded to a fabricated full date", () => {
    const result = parseHeroContent({ birth: { precision: "year", year: 1948 } });
    expect(result.ok && result.hero.birth).toEqual({ precision: "year", year: 1948 });
  });

  it("a localized date string is invalid in the canonical model", () => {
    const result = parseHeroContent({ birth: "17 mars 1948" });
    expect(result).toEqual({ ok: false, reason: "birth" });
  });

  it("a certainly-impossible chronology (birth strictly after death) is invalid", () => {
    const result = parseHeroContent({
      birth: { precision: "year", year: 1960 },
      death: { precision: "year", year: 1950 },
    });
    expect(result).toEqual({ ok: false, reason: "chronology" });
  });

  it("an exact-date chronology that is impossible is invalid", () => {
    const result = parseHeroContent({
      birth: { precision: "date", date: "1950-06-01" },
      death: { precision: "date", date: "1950-01-01" },
    });
    expect(result).toEqual({ ok: false, reason: "chronology" });
  });

  it("a merely ambiguous chronology (year vs. same-year date) is never rejected", () => {
    const result = parseHeroContent({
      birth: { precision: "year", year: 1950 },
      death: { precision: "date", date: "1950-02-03" },
    });
    expect(result.ok).toBe(true);
  });
});

describe("parseHeroContent — shortPhrase (T05)", () => {
  it("absence is valid", () => {
    const result = parseHeroContent({});
    expect(result.ok && result.hero.shortPhrase).toBe(null);
  });

  it("blanks normalize to absence", () => {
    const result = parseHeroContent({ shortPhrase: "   " });
    expect(result.ok && result.hero.shortPhrase).toBe(null);
  });

  it("preserves the family's text exactly, with no generation or translation", () => {
    const phrase = "Toujours dans nos cœurs";
    const result = parseHeroContent({ shortPhrase: phrase });
    expect(result.ok && result.hero.shortPhrase).toBe(phrase);
  });
});

describe("parseHeroContent — photo (T06)", () => {
  it("no photo is valid (incomplete Hero)", () => {
    const result = parseHeroContent({});
    expect(result.ok && result.hero.photo).toBe(null);
  });

  it("a structured media reference is valid", () => {
    const result = parseHeroContent({ photo: { mediaId: MEDIA_ID, crop: null } });
    expect(result).toEqual({
      ok: true,
      hero: { ...EMPTY_HERO_CONTENT, photo: { mediaId: MEDIA_ID, crop: null } },
    });
  });

  it("the parsed photo never carries a url/storagePath field — mediaId is the only reference", () => {
    const result = parseHeroContent({
      photo: { mediaId: MEDIA_ID, crop: null, url: "https://x.supabase.co/signed", storagePath: "a/b/c" },
    });
    expect(result.ok).toBe(true);
    expect(result.ok && result.hero.photo).toEqual({ mediaId: MEDIA_ID, crop: null });
  });
});

describe("parseHeroContent — crop (T07)", () => {
  it("crop absent after a photo is set is valid (incomplete Hero)", () => {
    const result = parseHeroContent({ photo: { mediaId: MEDIA_ID, crop: null } });
    expect(result.ok && result.hero.photo?.crop).toBe(null);
  });

  it("accepts focalX/focalY within [0, 1] and a positive zoom", () => {
    const result = parseHeroContent({
      photo: { mediaId: MEDIA_ID, crop: { focalX: 0, focalY: 1, zoom: HERO_CROP_NEUTRAL_ZOOM } },
    });
    expect(result.ok).toBe(true);
  });

  it("rejects focalX/focalY outside [0, 1]", () => {
    const result = parseHeroContent({
      photo: { mediaId: MEDIA_ID, crop: { focalX: 47, focalY: 0.5, zoom: 1 } },
    });
    expect(result).toEqual({ ok: false, reason: "photo" });
  });

  it("rejects NaN/Infinity in focal coordinates", () => {
    const nan = parseHeroContent({
      photo: { mediaId: MEDIA_ID, crop: { focalX: NaN, focalY: 0.5, zoom: 1 } },
    });
    expect(nan).toEqual({ ok: false, reason: "photo" });

    const infinite = parseHeroContent({
      photo: { mediaId: MEDIA_ID, crop: { focalX: 0.5, focalY: Infinity, zoom: 1 } },
    });
    expect(infinite).toEqual({ ok: false, reason: "photo" });
  });

  it("rejects an invalid zoom (zero, negative, NaN, Infinity)", () => {
    for (const zoom of [0, -1, NaN, Infinity]) {
      const result = parseHeroContent({
        photo: { mediaId: MEDIA_ID, crop: { focalX: 0.5, focalY: 0.5, zoom } },
      });
      expect(result).toEqual({ ok: false, reason: "photo" });
    }
  });

  it("a crop is always attributed to the photo that carries it", () => {
    const result = parseHeroContent({ photo: { mediaId: MEDIA_ID, crop: VALID_CROP } });
    expect(result.ok && result.hero.photo).toEqual({ mediaId: MEDIA_ID, crop: VALID_CROP });
  });
});

describe("setHeroPhotoMedia — the mediaId/crop binding guarantee (T06/T07/section 8)", () => {
  it("changing mediaId never silently keeps the old photo's crop", () => {
    const withCrop: HeroContent = {
      ...EMPTY_HERO_CONTENT,
      photo: { mediaId: MEDIA_ID, crop: VALID_CROP },
    };

    const result = setHeroPhotoMedia(withCrop, OTHER_MEDIA_ID);

    expect(result).toEqual({
      ok: true,
      hero: { ...withCrop, photo: { mediaId: OTHER_MEDIA_ID, crop: null } },
    });
  });

  it("re-setting the same mediaId keeps its existing crop (idempotent autosave)", () => {
    const withCrop: HeroContent = {
      ...EMPTY_HERO_CONTENT,
      photo: { mediaId: MEDIA_ID, crop: VALID_CROP },
    };

    const result = setHeroPhotoMedia(withCrop, MEDIA_ID);

    expect(result).toEqual({ ok: true, hero: withCrop });
  });

  it("clearing the photo (mediaId: null) clears its crop too", () => {
    const withCrop: HeroContent = {
      ...EMPTY_HERO_CONTENT,
      photo: { mediaId: MEDIA_ID, crop: VALID_CROP },
    };

    const result = setHeroPhotoMedia(withCrop, null);

    expect(result).toEqual({ ok: true, hero: { ...withCrop, photo: null } });
  });
});

describe("setHeroCrop", () => {
  it("is a no-op when there is no photo yet — a crop cannot exist without one", () => {
    const result = setHeroCrop(EMPTY_HERO_CONTENT, VALID_CROP);
    expect(result).toEqual({ ok: true, hero: EMPTY_HERO_CONTENT });
  });

  it("sets the crop on the currently referenced photo", () => {
    const withPhoto: HeroContent = { ...EMPTY_HERO_CONTENT, photo: { mediaId: MEDIA_ID, crop: null } };
    const result = setHeroCrop(withPhoto, VALID_CROP);
    expect(result).toEqual({
      ok: true,
      hero: { ...withPhoto, photo: { mediaId: MEDIA_ID, crop: VALID_CROP } },
    });
  });

  it("rejects an out-of-bounds crop", () => {
    const withPhoto: HeroContent = { ...EMPTY_HERO_CONTENT, photo: { mediaId: MEDIA_ID, crop: null } };
    const result = setHeroCrop(withPhoto, { focalX: 2, focalY: 0.5, zoom: 1 });
    expect(result).toEqual({ ok: false, reason: "photo" });
  });
});

describe("setHeroBirth / setHeroDeath — chronology re-checked on update", () => {
  it("rejects a birth update that would make chronology certainly impossible", () => {
    const withDeath: HeroContent = {
      ...EMPTY_HERO_CONTENT,
      death: { precision: "year", year: 1950 },
    };
    const result = setHeroBirth(withDeath, { precision: "year", year: 1960 });
    expect(result).toEqual({ ok: false, reason: "chronology" });
  });

  it("rejects a death update that would make chronology certainly impossible", () => {
    const withBirth: HeroContent = {
      ...EMPTY_HERO_CONTENT,
      birth: { precision: "year", year: 1960 },
    };
    const result = setHeroDeath(withBirth, { precision: "year", year: 1950 });
    expect(result).toEqual({ ok: false, reason: "chronology" });
  });

  it("accepts an ambiguous-but-not-impossible pair", () => {
    const withBirth: HeroContent = {
      ...EMPTY_HERO_CONTENT,
      birth: { precision: "year", year: 1950 },
    };
    const result = setHeroDeath(withBirth, { precision: "date", date: "1950-02-03" });
    expect(result.ok).toBe(true);
  });
});

describe("setHeroDisplayName / setHeroShortPhrase", () => {
  it("normalizes blanks to null without touching the rest of the Hero", () => {
    const hero: HeroContent = { ...EMPTY_HERO_CONTENT, shortPhrase: "existing" };
    expect(setHeroDisplayName(hero, "   ").displayName).toBe(null);
    expect(setHeroShortPhrase(hero, "   ").shortPhrase).toBe(null);
  });

  it("preserves exact family text", () => {
    const hero = EMPTY_HERO_CONTENT;
    expect(setHeroDisplayName(hero, "Éléonore Vasseur").displayName).toBe("Éléonore Vasseur");
  });
});

describe("completeness (section 10)", () => {
  const complete: HeroContent = {
    displayName: "Marcel Onésime",
    birth: null,
    death: null,
    shortPhrase: null,
    photo: { mediaId: MEDIA_ID, crop: VALID_CROP },
  };

  it("name + a referenced/cropped photo is structurally complete", () => {
    expect(isHeroContentComplete(complete)).toBe(true);
  });

  it("absent dates never prevent completeness", () => {
    expect(isHeroContentComplete({ ...complete, birth: null, death: null })).toBe(true);
  });

  it("absent shortPhrase never prevents completeness", () => {
    expect(isHeroContentComplete({ ...complete, shortPhrase: null })).toBe(true);
  });

  it("an absent name is incomplete", () => {
    expect(isHeroContentComplete({ ...complete, displayName: null })).toBe(false);
  });

  it("an absent photo is incomplete", () => {
    expect(isHeroContentComplete({ ...complete, photo: null })).toBe(false);
  });

  it("an absent crop is incomplete", () => {
    expect(
      isHeroContentComplete({ ...complete, photo: { mediaId: MEDIA_ID, crop: null } }),
    ).toBe(false);
  });

  it("isHeroPhotoMediaUsable requires the media to be ready, this mediaId, and hero purpose", () => {
    expect(isHeroPhotoMediaUsable(complete, readyMedia())).toBe(true);
    expect(isHeroPhotoMediaUsable(complete, readyMedia({ status: "pending" }))).toBe(false);
    expect(isHeroPhotoMediaUsable(complete, readyMedia({ purpose: "gallery" }))).toBe(false);
    expect(isHeroPhotoMediaUsable(complete, readyMedia({ id: OTHER_MEDIA_ID }))).toBe(false);
    expect(isHeroPhotoMediaUsable(complete, null)).toBe(false);
  });

  it("a pending media never counts as the final Hero photo", () => {
    expect(isHeroComplete(complete, readyMedia({ status: "pending" }))).toBe(false);
  });

  it("isHeroComplete is true only once both halves hold", () => {
    expect(isHeroComplete(complete, readyMedia())).toBe(true);
    expect(isHeroComplete({ ...complete, displayName: null }, readyMedia())).toBe(false);
  });
});

describe("draft JSON integration (section 13)", () => {
  it("an old draft with no hero key at all reads as an empty, incomplete Hero", () => {
    const content: MemorialContent = { story: { title: "x" } };
    expect(readHero(content)).toEqual(EMPTY_HERO_CONTENT);
  });

  it("a valid Hero round-trips through readHero/updateHero without loss", () => {
    const hero: HeroContent = {
      displayName: "Éléonore Vasseur",
      birth: { precision: "year", year: 1938 },
      death: { precision: "date", date: "2026-01-05" },
      shortPhrase: "Toujours dans nos cœurs",
      photo: { mediaId: MEDIA_ID, crop: VALID_CROP },
    };

    const content = updateHero({}, hero);
    expect(readHero(content)).toEqual(hero);
  });

  it("updating the Hero preserves every other content key untouched", () => {
    const content: MemorialContent = {
      story: { title: "Son histoire", body: "..." },
      gallery: { title: "Galerie" },
    };

    const next = updateHero(content, { ...EMPTY_HERO_CONTENT, displayName: "Marcel" });

    expect(next.story).toEqual(content.story);
    expect(next.gallery).toEqual(content.gallery);
    expect(readHero(next).displayName).toBe("Marcel");
  });

  it("a malformed hero value never casts blindly — it fails safe on read", () => {
    const content = { hero: "not an object" } as unknown as MemorialContent;
    expect(readHero(content)).toEqual(EMPTY_HERO_CONTENT);
    expect(parseHeroContent((content as { hero: unknown }).hero)).toEqual({
      ok: false,
      reason: "not_an_object",
    });
  });

  it("validateHero applies the same rules to an already-typed HeroContent", () => {
    const invalid: HeroContent = {
      ...EMPTY_HERO_CONTENT,
      birth: { precision: "date", date: "2026-02-31" },
    };
    expect(validateHero(invalid)).toEqual({ ok: false, reason: "birth" });
  });
});
