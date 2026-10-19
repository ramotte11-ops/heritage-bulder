import { describe, expect, it } from "vitest";
import { changedConfigurationMutation, changedMemorialContentMutations } from "./edit-mutations";
import type { MemorialContent } from "@/types/memorial";

describe("changedMemorialContentMutations", () => {
  it("identifies exact business targets without trusting a client-supplied path list", () => {
    const stored = {
      hero: { displayName: "Jeanne", birth: { precision: "year", year: 1940 } },
      deathNotice: { announcementText: "Avant", precisions: { thought: null } },
    } as unknown as MemorialContent;
    const submitted = {
      hero: { displayName: "Jeanne", birth: { precision: "year", year: 1941 } },
      deathNotice: { announcementText: "Après", precisions: { thought: null } },
    } as unknown as MemorialContent;

    expect(changedMemorialContentMutations(stored, submitted)).toEqual([
      { kind: "content", target: "deathNotice.announcementText" },
      { kind: "content", target: "hero.birth" },
    ]);
  });

  it("treats arrays and crops as atomic policy targets", () => {
    const stored = {
      gallery: { items: [{ id: "a" }] },
      hero: { photo: { mediaId: "m1", crop: { x: 0, y: 0, width: 1, height: 1 } } },
    } as unknown as MemorialContent;
    const submitted = {
      gallery: { items: [{ id: "b" }] },
      hero: { photo: { mediaId: "m1", crop: { x: 0.1, y: 0, width: 1, height: 1 } } },
    } as unknown as MemorialContent;

    expect(changedMemorialContentMutations(stored, submitted)).toEqual([
      { kind: "content", target: "gallery.items" },
      { kind: "content", target: "hero.photo.crop" },
    ]);
  });

  it("returns unknown changed JSON paths verbatim so the policy fails closed", () => {
    expect(
      changedMemorialContentMutations({} as MemorialContent, {
        hero: { futureIdentityField: "unexpected" },
        futureSection: { body: "unexpected" },
      } as unknown as MemorialContent),
    ).toEqual([
      { kind: "content", target: "futureSection.body" },
      { kind: "content", target: "hero.futureIdentityField" },
    ]);
  });

  it("maps every leaf when a known section is added for the first time", () => {
    expect(
      changedMemorialContentMutations({} as MemorialContent, {
        personWords: { text: "Un souvenir" },
      } as unknown as MemorialContent),
    ).toEqual([{ kind: "content", target: "personWords.text" }]);
  });

  it("does not invent a mutation for object key order or identical content", () => {
    const stored = { gallery: { items: [{ id: "a", caption: "Une photo" }] } } as unknown as MemorialContent;
    const submitted = { gallery: { items: [{ caption: "Une photo", id: "a" }] } } as unknown as MemorialContent;
    expect(changedMemorialContentMutations(stored, submitted)).toEqual([]);
  });
});

describe("changedConfigurationMutation", () => {
  it("returns one recognized target only when the persisted value changes", () => {
    expect(changedConfigurationMutation("language", "fr", "en")).toEqual([
      { kind: "configuration", target: "language" },
    ]);
    expect(changedConfigurationMutation("skinVariant", "dark", "dark")).toEqual([]);
  });
});
