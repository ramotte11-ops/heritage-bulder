import { afterEach, describe, expect, it } from "vitest";
import type { MemorialContent } from "@/types/memorial";
import type { SectionId } from "@/config/sections";
import { RENDERER_KEYS } from "@/config/memorial-section-renderers";
import { readHero } from "@/lib/memorial/hero";
import { readDeathNotice } from "@/lib/memorial/death-notice";
import { composeMemorial } from "@/lib/memorial/composition/compose-memorial";
import { assembleMemorial, type AssembleMemorialInput } from "./assemble-memorial";
import { RENDERER_ADAPTERS } from "./renderer-adapters";
import {
  FIXTURE_HERO_MEDIA_ID,
  FIXTURE_READ_URL,
  fullAnnouncement,
  fullAnnouncementEmptyRecit,
  recordingResolver,
  throughA02,
  throughA03,
} from "./test-fixtures";

/**
 * Étape 2 — contract tests for the Memorial assembler: it consumes
 * `composeMemorial` without re-deciding it, resolves media only through
 * the injected resolver, and fails closed (QG D1).
 */

function input(content: MemorialContent, overrides: Partial<AssembleMemorialInput> = {}): AssembleMemorialInput {
  return {
    editorialContext: "announcement",
    skin: "intemporel",
    skinVariant: "light",
    language: "fr",
    content,
    ...overrides,
  };
}

function ids(sections: { sectionId: SectionId }[]): SectionId[] {
  return sections.map((section) => section.sectionId);
}

/** Temporarily replaces one adapter — restored after each test. */
const adapters = RENDERER_ADAPTERS as unknown as Record<string, unknown>;
const originalAdapters = { ...adapters };
afterEach(() => {
  for (const key of Object.keys(adapters)) delete adapters[key];
  Object.assign(adapters, originalAdapters);
});

// ---------------------------------------------------------------------
// 1. Consumes the composition — never re-decides it
// ---------------------------------------------------------------------

describe("consumes composeMemorial", () => {
  it("assembles exactly composition.renderable, in order, with the composition's renderer keys", async () => {
    const content = fullAnnouncement();
    const assembled = await assembleMemorial(input(content), { resolveMedia: recordingResolver().resolve });

    expect(assembled.status).toBe("assembled");
    expect(ids(assembled.sections)).toEqual(["hero", "deathNotice", "story", "ceremony"]);
    expect(ids(assembled.sections)).toEqual(assembled.composition.renderable);
    for (const section of assembled.sections) {
      const composed = assembled.composition.sections.find((s) => s.sectionId === section.sectionId);
      expect(section.rendererKey).toBe(composed?.rendererKey);
    }
    expect(assembled.failures).toEqual([]);
  });

  it("returns the composition computed from the very content it assembled", async () => {
    const content = fullAnnouncement();
    const assembled = await assembleMemorial(input(content), { resolveMedia: recordingResolver().resolve });
    expect(assembled.composition).toEqual(
      composeMemorial({ editorialContext: "announcement", skin: "intemporel", skinVariant: "light", content }),
    );
  });

  it("never assembles a pending, optional, noRenderer or notRelevant section", async () => {
    const content = throughA03(); // ceremony pending, story optional, gallery… optional/noRenderer
    const assembled = await assembleMemorial(input(content), { resolveMedia: recordingResolver().resolve });

    const nonRenderable = assembled.composition.sections
      .filter((s) => s.state !== "renderable")
      .map((s) => s.sectionId);
    expect(nonRenderable).toContain("ceremony");
    expect(ids(assembled.sections)).toEqual(["hero", "deathNotice"]);
    for (const id of nonRenderable) expect(ids(assembled.sections)).not.toContain(id);
  });

  it("follows the composition's order, whatever it is (provisional order untouched)", async () => {
    const order: SectionId[] = ["ceremony", "story", "deathNotice", "hero", "traditions", "gallery", "testimonials", "condolences", "video"];
    const assembled = await assembleMemorial(input(fullAnnouncement(), { order }), {
      resolveMedia: recordingResolver().resolve,
    });
    expect(ids(assembled.sections)).toEqual(["ceremony", "story", "deathNotice", "hero"]);
  });

  it("remembrance: never the Avis or the Cérémonie, even with stray announcement data", async () => {
    const assembled = await assembleMemorial(input(fullAnnouncement(), { editorialContext: "remembrance" }), {
      resolveMedia: recordingResolver().resolve,
    });
    expect(assembled.status).toBe("assembled");
    expect(ids(assembled.sections)).toEqual(["hero", "story"]);

    const heroOnly = await assembleMemorial(input(throughA02(), { editorialContext: "remembrance" }), {
      resolveMedia: recordingResolver().resolve,
    });
    expect(ids(heroOnly.sections)).toEqual(["hero"]);
  });

  it("QG decision: a resolved Récit with all three matters empty is assembled", async () => {
    const content = fullAnnouncementEmptyRecit();
    const assembled = await assembleMemorial(input(content), { resolveMedia: recordingResolver().resolve });
    const story = assembled.sections.find((s) => s.sectionId === "story");
    expect(story?.rendererKey).toBe("RecitDeVieIntemporel");
  });
});

// ---------------------------------------------------------------------
// 2. Props handed to each renderer
// ---------------------------------------------------------------------

describe("renderer props", () => {
  it("Hero: the stored Hero, only the resolved URL as photo, and the memorial's own context", async () => {
    const content = fullAnnouncement();
    const assembled = await assembleMemorial(input(content, { skinVariant: "dark", language: "en" }), {
      resolveMedia: recordingResolver().resolve,
    });
    const hero = assembled.sections.find((s) => s.rendererKey === "HeroIntemporel");
    expect(hero?.props).toEqual({
      hero: readHero(content),
      photo: { readUrl: FIXTURE_READ_URL },
      skinVariant: "dark",
      editorialContext: "announcement",
      language: "en",
    });
  });

  it("Avis: section heading level (QG D3), stored Hero and Avis", async () => {
    const content = fullAnnouncement();
    const assembled = await assembleMemorial(input(content), { resolveMedia: recordingResolver().resolve });
    const notice = assembled.sections.find((s) => s.rendererKey === "DeathNoticeIntemporel");
    expect(notice?.props).toEqual({
      hero: readHero(content),
      deathNotice: readDeathNotice(content),
      editorialContext: "announcement",
      language: "fr",
      skinVariant: "light",
      headingLevel: "section",
    });
  });

  it("Cérémonie and Récit: the content itself, language and variant", async () => {
    const content = fullAnnouncement();
    const assembled = await assembleMemorial(input(content), { resolveMedia: recordingResolver().resolve });
    for (const key of ["CeremonyIntemporel", "RecitDeVieIntemporel"] as const) {
      const section = assembled.sections.find((s) => s.rendererKey === key);
      expect(section?.props).toEqual({ content, language: "fr", skinVariant: "light" });
    }
  });
});

// ---------------------------------------------------------------------
// 3. Media — only through the injected resolver
// ---------------------------------------------------------------------

describe("media resolution", () => {
  it("asks the resolver once, for the Hero's own media and purpose — nothing about mode or actor", async () => {
    const resolver = recordingResolver();
    await assembleMemorial(input(fullAnnouncement()), { resolveMedia: resolver.resolve });
    expect(resolver.calls).toEqual([{ mediaId: FIXTURE_HERO_MEDIA_ID, purpose: "hero" }]);
  });

  it("never asks when the Hero is not renderable", async () => {
    const resolver = recordingResolver();
    await assembleMemorial(input({}), { resolveMedia: resolver.resolve });
    await assembleMemorial(input(throughA02(), { skin: "musulman" }), { resolveMedia: resolver.resolve });
    expect(resolver.calls).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// 4. Fail closed — QG D1
// ---------------------------------------------------------------------

describe("fail closed — the Hero is structural (QG D1)", () => {
  const heroFailures: [string, () => ReturnType<typeof recordingResolver>][] = [
    ["the resolver returns null", () => recordingResolver(() => null)],
    [
      "the resolver throws",
      () =>
        recordingResolver(() => {
          throw new Error("storage down");
        }),
    ],
    ["the resolver rejects", () => recordingResolver(() => Promise.reject(new Error("storage down")))],
    ["the resolver answers another media", () => recordingResolver(() => ({ mediaId: "other", readUrl: FIXTURE_READ_URL }))],
    ["the resolver answers an empty URL", () => recordingResolver((request) => ({ mediaId: request.mediaId, readUrl: "" }))],
  ];

  it.each(heroFailures)("%s → unavailable, no section at all", async (_label, makeResolver) => {
    const assembled = await assembleMemorial(input(fullAnnouncement()), { resolveMedia: makeResolver().resolve });
    expect(assembled.status).toBe("unavailable");
    expect(assembled.sections).toEqual([]);
    expect(assembled.failures).toContainEqual({
      sectionId: "hero",
      rendererKey: "HeroIntemporel",
      reason: "mediaUnavailable",
    });
  });

  it("nothing renderable yet (before T08) → unavailable, no failure invented", async () => {
    const assembled = await assembleMemorial(input({}), { resolveMedia: recordingResolver().resolve });
    expect(assembled.status).toBe("unavailable");
    expect(assembled.sections).toEqual([]);
    expect(assembled.failures).toEqual([]);
  });

  it.each(["musulman", null, "occidental"])("a skin with no renderer (%s) → unavailable", async (skin) => {
    const assembled = await assembleMemorial(input(fullAnnouncement(), { skin }), {
      resolveMedia: recordingResolver().resolve,
    });
    expect(assembled.status).toBe("unavailable");
    expect(assembled.sections).toEqual([]);
  });
});

describe("fail closed — a non-Hero section is omitted and recorded", () => {
  it("an adapter refusal omits that section only", async () => {
    adapters.CeremonyIntemporel = async () => ({ ok: false, reason: "contentUnreadable" });
    const assembled = await assembleMemorial(input(fullAnnouncement()), { resolveMedia: recordingResolver().resolve });

    expect(assembled.status).toBe("assembled");
    expect(ids(assembled.sections)).toEqual(["hero", "deathNotice", "story"]);
    expect(assembled.failures).toEqual([
      { sectionId: "ceremony", rendererKey: "CeremonyIntemporel", reason: "contentUnreadable" },
    ]);
  });

  it("a throwing adapter is a failure, never an exception", async () => {
    adapters.RecitDeVieIntemporel = async () => {
      throw new Error("boom");
    };
    const assembled = await assembleMemorial(input(fullAnnouncement()), { resolveMedia: recordingResolver().resolve });
    expect(ids(assembled.sections)).toEqual(["hero", "deathNotice", "ceremony"]);
    expect(assembled.failures).toEqual([{ sectionId: "story", rendererKey: "RecitDeVieIntemporel", reason: "adapterError" }]);
  });

  it("a renderer key with no adapter is a failure (noAdapter), never another renderer", async () => {
    delete adapters.DeathNoticeIntemporel;
    const assembled = await assembleMemorial(input(fullAnnouncement()), { resolveMedia: recordingResolver().resolve });
    expect(ids(assembled.sections)).toEqual(["hero", "story", "ceremony"]);
    expect(assembled.failures).toEqual([{ sectionId: "deathNotice", rendererKey: "DeathNoticeIntemporel", reason: "noAdapter" }]);
  });

  it("a non-Hero failure alongside a Hero failure still leaves the Memorial unavailable", async () => {
    adapters.CeremonyIntemporel = async () => ({ ok: false, reason: "contentUnreadable" });
    const assembled = await assembleMemorial(input(fullAnnouncement()), {
      resolveMedia: recordingResolver(() => null).resolve,
    });
    expect(assembled.status).toBe("unavailable");
    expect(assembled.sections).toEqual([]);
    expect(assembled.failures.map((f) => f.sectionId)).toEqual(["hero", "ceremony"]);
  });
});

// ---------------------------------------------------------------------
// 5. Total, pure
// ---------------------------------------------------------------------

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe("total and pure", () => {
  it("never mutates its input", async () => {
    const content = deepFreeze(fullAnnouncement());
    const snapshot = JSON.stringify(content);
    await expect(
      assembleMemorial(input(content), { resolveMedia: recordingResolver().resolve }),
    ).resolves.toBeDefined();
    expect(JSON.stringify(content)).toBe(snapshot);
  });

  it.each([
    ["corrupted guidedFlow", { guidedFlow: "garbage" }],
    ["corrupted hero", { ...throughA02(), hero: "garbage" }],
    ["corrupted everything", { hero: 1, deathNotice: 2, ceremony: 3, personWords: 4, guidedFlow: 5 }],
  ])("never throws on %s", async (_label, content) => {
    const assembled = await assembleMemorial(input(content as unknown as MemorialContent), {
      resolveMedia: recordingResolver().resolve,
    });
    expect(assembled.status).toBe("unavailable");
    expect(assembled.sections).toEqual([]);
  });

  it("has exactly one adapter per renderer key", () => {
    expect(Object.keys(RENDERER_ADAPTERS).sort()).toEqual([...RENDERER_KEYS].sort());
  });
});
