import { describe, expect, it } from "vitest";
import type { MemorialContent } from "@/types/memorial";
import { EMPTY_HERO_CONTENT } from "@/types/hero";
import { commitAuthenticatedWelcome, commitWelcome, needsWelcome } from "./welcome-step";
import { writeDisplayName, writeHeroCrop, writeHeroPhotoMedia, writeShortPhrase } from "./hero-step";
import { authorizeMemorialEdit, type MemorialEditContext } from "@/lib/memorial/edit-authorization";
import { changedMemorialContentMutations } from "@/lib/memorial/edit-mutations";
import { inspectHero, isHeroComplete, isHeroContentComplete } from "@/lib/memorial/hero";
import { projectMemorialPublication } from "@/lib/memorial/publication-policy";

/**
 * QG 008 Lot 2 — the authenticated Builder's Welcome (Phase A, preexisting
 * on main): its CTA wrote `welcome.status`, which no edit policy target
 * covers, so the save was refused and the family stayed on the Welcome.
 * It now records the canonical empty Hero, an already-authorized
 * pre-publication edit, through the same policy — nothing widened.
 */

const DRAFT: MemorialEditContext = { actor: "owner", status: "draft", firstPublicationExists: false, locks: { ceremony: "unknown" } };
const c = (value: unknown) => value as MemorialContent;
const decide = (stored: MemorialContent, submitted: MemorialContent) =>
  authorizeMemorialEdit(DRAFT, changedMemorialContentMutations(stored, submitted));
function written(result: ReturnType<typeof writeDisplayName>): MemorialContent {
  if (!result.ok) throw new Error(`Builder write refused: ${result.reason}`);
  return result.content;
}

describe("commitAuthenticatedWelcome — the authenticated CTA's write", () => {
  it("reproduces the defect it replaces: the guest marker is refused on a durable draft", () => {
    expect(decide(c({}), commitWelcome(c({}))))
      .toMatchObject({ decision: "DENY", reason: "unknown_mutation_target", mutation: { target: "welcome.status" } });
  });

  it("records the canonical empty Hero, accepted by the SAME server policy", () => {
    const next = commitAuthenticatedWelcome(c({}));
    expect(next).toEqual({ hero: EMPTY_HERO_CONTENT });
    expect(next).not.toHaveProperty("welcome");
    expect(changedMemorialContentMutations(c({}), next).map(({ target }) => target)).toEqual([
      "hero.birth", "hero.death", "hero.displayName", "hero.photo.mediaId", "hero.shortPhrase",
    ]);
    expect(decide(c({}), next)).toMatchObject({ decision: "ALLOW" });
  });

  it("the Welcome is not shown again once it is saved (no loop)", () => {
    expect(needsWelcome(null, c({}))).toBe(true);
    expect(needsWelcome(null, commitAuthenticatedWelcome(c({})))).toBe(false);
  });

  it("fills only an absent or null Hero; any other content is returned untouched (existing drafts never rewritten)", () => {
    expect(commitAuthenticatedWelcome(c({ hero: null }))).toEqual({ hero: EMPTY_HERO_CONTENT });
    for (const existing of [
      { hero: { ...EMPTY_HERO_CONTENT, displayName: "Jeanne" } },
      { hero: { ...EMPTY_HERO_CONTENT, displayName: "Jeanne" }, guidedFlow: { T04: { status: "completed" } } },
    ]) {
      const content = c(structuredClone(existing));
      expect(commitAuthenticatedWelcome(content)).toBe(content);
      expect(changedMemorialContentMutations(content, commitAuthenticatedWelcome(content))).toEqual([]);
    }
  });

  it("never mutates its input, and its Hero is a fresh copy", () => {
    const input = c({});
    const next = commitAuthenticatedWelcome(input) as Record<string, unknown>;
    expect(input).toEqual({});
    expect(next.hero).not.toBe(EMPTY_HERO_CONTENT);
  });

  it("leaves the guest Builder's write unchanged (marker only)", () => {
    expect(commitWelcome(c({}))).toEqual({ welcome: { status: "completed" } });
  });
});

describe("after the authenticated Welcome — the Builder carries on", () => {
  it("name, then phrase, WITHOUT a photo: every save authorized", () => {
    const welcomed = commitAuthenticatedWelcome(c({}));
    const named = written(writeDisplayName(welcomed, "Jeanne Martin"));
    expect(changedMemorialContentMutations(welcomed, named).map(({ target }) => target)).toEqual(["hero.displayName"]);
    expect(decide(welcomed, named)).toMatchObject({ decision: "ALLOW" });
    const phrased = written(writeShortPhrase(named, "Toujours souriante"));
    expect(decide(named, phrased)).toMatchObject({ decision: "ALLOW" });
  });

  it("name, phrase, then a photo and its crop: every save authorized", () => {
    const phrased = written(writeShortPhrase(written(writeDisplayName(commitAuthenticatedWelcome(c({})), "Jeanne")), "Phrase"));
    const withPhoto = written(writeHeroPhotoMedia(phrased, "media-hero-1"));
    expect(changedMemorialContentMutations(phrased, withPhoto).map(({ target }) => target)).toEqual(["hero.photo.crop", "hero.photo.mediaId"]);
    expect(decide(phrased, withPhoto)).toMatchObject({ decision: "ALLOW" });
    const cropped = written(writeHeroCrop(withPhoto, { focalX: 0.5, focalY: 0.4, zoom: 1.2 }));
    expect(changedMemorialContentMutations(withPhoto, cropped).map(({ target }) => target)).toEqual(["hero.photo.crop"]);
    expect(decide(withPhoto, cropped)).toMatchObject({ decision: "ALLOW" });
  });
});

describe("the empty Hero is never a complete tribute", () => {
  const welcomed = commitAuthenticatedWelcome(c({}));

  it("is a valid but incomplete Hero: no name, no photo, no crop", () => {
    const read = inspectHero(welcomed);
    expect(read.status).toBe("valid");
    if (read.status !== "valid") return;
    expect(isHeroContentComplete(read.hero)).toBe(false);
    expect(isHeroComplete(read.hero, null)).toBe(false);
  });

  it("stays incomplete with a name and a phrase but no photo", () => {
    const read = inspectHero(written(writeShortPhrase(written(writeDisplayName(welcomed, "Jeanne")), "Phrase")));
    expect(read.status === "valid" && isHeroContentComplete(read.hero)).toBe(false);
  });

  it("publication rules are unchanged: the projection copies the empty fields as they are, nothing filled in", () => {
    const projected = projectMemorialPublication({ draft: welcomed, accessLevel: "complet", skin: "intemporel" });
    expect(projected.ok).toBe(true);
    if (!projected.ok) return;
    const hero = (projected.projection.content as Record<string, unknown>).hero;
    expect(hero).toEqual(EMPTY_HERO_CONTENT);
    // The Hero renderer requires `isHeroContentComplete` (lib/memorial/assembly/renderer-adapters.ts):
    // this Hero is never rendered as a complete tribute.
    expect(isHeroContentComplete(hero as typeof EMPTY_HERO_CONTENT)).toBe(false);
  });
});
