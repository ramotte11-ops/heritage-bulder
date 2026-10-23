import { describe, expect, it } from "vitest";
import type { MemorialContent } from "@/types/memorial";
import type { Skin } from "@/config/skins";
import type { RendererKey } from "@/config/memorial-section-renderers";
import {
  RENDERER_ADAPTERS,
  adaptCeremonyIntemporel,
  adaptCeremonyV2,
  adaptDeathNoticeIntemporel,
  adaptDeathNoticeV2,
  adaptHeroIntemporel,
  adaptRecitDeVieIntemporel,
  adaptRecitDeVieV2,
  adaptTraditionsV2,
  adaptSymbolicOfferingsV1Section,
  type AdapterContext,
} from "./renderer-adapters";
import type { ResolvedMedia } from "./media-resolver";
import {
  FIXTURE_HERO_MEDIA_ID,
  FIXTURE_READ_URL,
  FIXTURE_TRADITION_ENTRIES,
  fullAnnouncement,
  fullAnnouncementWithTraditions,
  fullAnnouncementEmptyRecit,
  recordingResolver,
} from "./test-fixtures";

/**
 * Étape 2 — each adapter, called directly with content the composition
 * would never have judged `renderable`: the adapter's own re-check is
 * the last line before a renderer, and must refuse on its own.
 */

function context(content: MemorialContent, overrides: Partial<AdapterContext> = {}): AdapterContext {
  return {
    content,
    skin: "intemporel",
    skinVariant: "light",
    language: "fr",
    resolveMedia: recordingResolver().resolve,
    ...overrides,
  };
}

function withHero(content: MemorialContent, patch: Record<string, unknown>): MemorialContent {
  return { ...content, hero: { ...(content.hero as object), ...patch } } as MemorialContent;
}

describe("skin — every adapter refuses a skin it does not draw", () => {
  it.each<[Skin | null]>([["musulman"], ["juif"], [null]])("%s → skinMismatch", async (skin) => {
    for (const key of Object.keys(RENDERER_ADAPTERS) as RendererKey[]) {
      const result = await RENDERER_ADAPTERS[key](context(fullAnnouncement(), { skin }));
      expect(result).toEqual({ ok: false, reason: "skinMismatch" });
    }
  });
});

describe("adaptHeroIntemporel", () => {
  it("hands the renderer only the resolved URL — never extra resolver fields", async () => {
    const resolver = recordingResolver(
      (request) =>
        ({
          mediaId: request.mediaId,
          readUrl: FIXTURE_READ_URL,
          storagePath: "leak/original.jpg",
          ownerId: "leak",
        }) as ResolvedMedia,
    );
    const result = await adaptHeroIntemporel(context(fullAnnouncement(), { resolveMedia: resolver.resolve }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.props.photo).toEqual({ readUrl: FIXTURE_READ_URL });
    expect(Object.keys(result.props.photo ?? {})).toEqual(["readUrl"]);
    expect(resolver.calls).toEqual([{ mediaId: FIXTURE_HERO_MEDIA_ID, purpose: "hero" }]);
  });

  it.each<[string, (c: MemorialContent) => MemorialContent]>([
    ["a corrupted Hero", (c) => ({ ...c, hero: "garbage" }) as unknown as MemorialContent],
    ["an absent Hero", (c) => ({ ...c, hero: undefined })],
    ["no display name", (c) => withHero(c, { displayName: null })],
    ["no photo", (c) => withHero(c, { photo: null })],
    ["a photo without crop", (c) => withHero(c, { photo: { mediaId: FIXTURE_HERO_MEDIA_ID, crop: null } })],
  ])("%s → contentUnreadable, the resolver never asked, never photo={null}", async (_label, corrupt) => {
    const resolver = recordingResolver();
    const result = await adaptHeroIntemporel(context(corrupt(fullAnnouncement()), { resolveMedia: resolver.resolve }));
    expect(result).toEqual({ ok: false, reason: "contentUnreadable" });
    expect(resolver.calls).toEqual([]);
  });
});

describe("adaptDeathNoticeIntemporel", () => {
  it("renders at section level (QG D3)", async () => {
    const result = await adaptDeathNoticeIntemporel(context(fullAnnouncement()));
    expect(result.ok && result.props.headingLevel).toBe("section");
  });

  it.each<[string, (c: MemorialContent) => MemorialContent]>([
    ["a corrupted Avis", (c) => ({ ...c, deathNotice: { announcementText: 42 } }) as unknown as MemorialContent],
    ["an absent Avis", (c) => ({ ...c, deathNotice: undefined })],
    [
      "no announcement text",
      (c) => ({ ...c, deathNotice: { ...(c.deathNotice as object), announcementText: null } }) as MemorialContent,
    ],
    ["a corrupted Hero", (c) => ({ ...c, hero: "garbage" }) as unknown as MemorialContent],
    ["no display name", (c) => withHero(c, { displayName: null })],
  ])("%s → contentUnreadable", async (_label, corrupt) => {
    expect(await adaptDeathNoticeIntemporel(context(corrupt(fullAnnouncement())))).toEqual({
      ok: false,
      reason: "contentUnreadable",
    });
  });
});

describe("adaptDeathNoticeV2 — the V1 contract, unchanged", () => {
  it("hands V2 exactly the props V1 receives: Hero name and dates, Avis, language, variant, section level", async () => {
    for (const skinVariant of ["light", "dark"] as const) {
      for (const language of ["fr", "en", "es"] as const) {
        const ctx = { ...context(fullAnnouncement()), skinVariant, language };
        const v2 = await adaptDeathNoticeV2(ctx);
        expect(v2).toEqual(await adaptDeathNoticeIntemporel(ctx));
        expect(v2.ok && v2.props.headingLevel).toBe("section");
        expect(v2.ok && v2.props.skinVariant).toBe(skinVariant);
        expect(v2.ok && v2.props.language).toBe(language);
      }
    }
  });

  it.each<[string, (c: MemorialContent) => MemorialContent]>([
    ["a corrupted Avis", (c) => ({ ...c, deathNotice: { announcementText: 42 } }) as unknown as MemorialContent],
    ["an absent Avis", (c) => ({ ...c, deathNotice: undefined })],
    [
      "no announcement text",
      (c) => ({ ...c, deathNotice: { ...(c.deathNotice as object), announcementText: null } }) as MemorialContent,
    ],
    ["a corrupted Hero", (c) => ({ ...c, hero: "garbage" }) as unknown as MemorialContent],
    ["no display name", (c) => withHero(c, { displayName: null })],
  ])("%s → contentUnreadable", async (_label, corrupt) => {
    expect(await adaptDeathNoticeV2(context(corrupt(fullAnnouncement())))).toEqual({
      ok: false,
      reason: "contentUnreadable",
    });
  });

  it("refuses any skin other than Intemporel", async () => {
    for (const skin of ["musulman", "juif", "hindou", null] as const) {
      expect(await adaptDeathNoticeV2({ ...context(fullAnnouncement()), skin })).toEqual({
        ok: false,
        reason: "skinMismatch",
      });
    }
  });
});

describe("adaptCeremonyIntemporel", () => {
  it("passes the content itself through, unchanged", async () => {
    const content = fullAnnouncement();
    const result = await adaptCeremonyIntemporel(context(content));
    expect(result.ok && result.props.content).toBe(content);
  });

  it.each<[string, (c: MemorialContent) => MemorialContent]>([
    ["a corrupted Cérémonie (would otherwise render empty)", (c) => ({ ...c, ceremony: "garbage" }) as unknown as MemorialContent],
    ["an absent Cérémonie", (c) => ({ ...c, ceremony: undefined })],
  ])("%s → contentUnreadable", async (_label, corrupt) => {
    expect(await adaptCeremonyIntemporel(context(corrupt(fullAnnouncement())))).toEqual({
      ok: false,
      reason: "contentUnreadable",
    });
  });
});

describe("adaptCeremonyV2", () => {
  it("passes the inspected ceremony directly with section heading semantics", async () => {
    const content = fullAnnouncement();
    const result = await adaptCeremonyV2(context(content));
    expect(result).toEqual({
      ok: true,
      props: {
        ceremony: content.ceremony,
        language: "fr",
        skinVariant: "light",
        headingLevel: "section",
      },
    });
  });

  it("refuses corrupted or absent ceremony data", async () => {
    expect(await adaptCeremonyV2(context({ ...fullAnnouncement(), ceremony: "garbage" } as unknown as MemorialContent))).toEqual({ ok: false, reason: "contentUnreadable" });
    expect(await adaptCeremonyV2(context({ ...fullAnnouncement(), ceremony: undefined }))).toEqual({ ok: false, reason: "contentUnreadable" });
  });
});

describe("adaptRecitDeVieIntemporel", () => {
  it("QG decision: three empty matters are accepted (HERITAGE fallbacks)", async () => {
    const content = fullAnnouncementEmptyRecit();
    const result = await adaptRecitDeVieIntemporel(context(content));
    expect(result.ok && result.props.content).toBe(content);
  });

  it.each(["personWords", "lovedThings", "legacy"])(
    "a corrupted %s → contentUnreadable (a fallback must never stand in for the family's text)",
    async (key) => {
      const content = { ...fullAnnouncement(), [key]: { text: 42 } } as unknown as MemorialContent;
      expect(await adaptRecitDeVieIntemporel(context(content))).toEqual({ ok: false, reason: "contentUnreadable" });
    },
  );
});

describe("adaptRecitDeVieV2", () => {
  it("passes exactly the V1 props: content, language, variant", async () => {
    const content = fullAnnouncement();
    expect(await adaptRecitDeVieV2(context(content))).toEqual({
      ok: true,
      props: { content, language: context(content).language, skinVariant: context(content).skinVariant },
    });
  });

  it("refuses any other skin", async () => {
    expect(await adaptRecitDeVieV2({ ...context(fullAnnouncement()), skin: "musulman" })).toEqual({ ok: false, reason: "skinMismatch" });
  });

  it("QG decision: three empty matters are accepted (HERITAGE fallbacks)", async () => {
    const content = fullAnnouncementEmptyRecit();
    const result = await adaptRecitDeVieV2(context(content));
    expect(result.ok && result.props.content).toBe(content);
  });

  it.each(["personWords", "lovedThings", "legacy"])(
    "a corrupted %s → contentUnreadable (a fallback must never stand in for the family's text)",
    async (key) => {
      const content = { ...fullAnnouncement(), [key]: { text: 42 } } as unknown as MemorialContent;
      expect(await adaptRecitDeVieV2(context(content))).toEqual({ ok: false, reason: "contentUnreadable" });
    },
  );
});

describe("adaptTraditionsV2", () => {
  it("hands the renderer the family's repères as is, at section level (QG D3)", async () => {
    const result = await adaptTraditionsV2(context(fullAnnouncementWithTraditions()));
    expect(result).toEqual({
      ok: true,
      props: {
        traditions: { entries: FIXTURE_TRADITION_ENTRIES.map((entry) => ({ ...entry })) },
        language: "fr",
        skinVariant: "light",
        headingLevel: "section",
      },
    });
  });

  it.each([
    ["light", "fr"],
    ["light", "en"],
    ["dark", "es"],
    ["dark", "fr"],
  ] as const)("%s / %s: the memorial's own variant and language, never another", async (skinVariant, language) => {
    const result = await adaptTraditionsV2(context(fullAnnouncementWithTraditions(), { skinVariant, language }));
    expect(result.ok && result.props).toMatchObject({ skinVariant, language });
  });

  it("only the four renderer props — never the rest of the memorial's content", async () => {
    const result = await adaptTraditionsV2(context(fullAnnouncementWithTraditions()));
    expect(result.ok && Object.keys(result.props).sort()).toEqual(["headingLevel", "language", "skinVariant", "traditions"]);
  });

  it("refuses any other skin", async () => {
    expect(await adaptTraditionsV2(context(fullAnnouncementWithTraditions(), { skin: "juif" }))).toEqual({
      ok: false,
      reason: "skinMismatch",
    });
  });

  it.each<[string, (c: MemorialContent) => MemorialContent]>([
    ["no traditions at all", (c) => ({ ...c, traditions: undefined })],
    ["an empty list", (c) => ({ ...c, traditions: { entries: [] } })],
    ["a corrupted list", (c) => ({ ...c, traditions: { entries: "garbage" } }) as unknown as MemorialContent],
    ["an unknown key", (c) => ({ ...c, traditions: { entries: [], extra: 1 } })],
    [
      "a blank repère",
      (c) => ({ ...c, traditions: { entries: [{ id: "x", origin: "custom", suggestionId: null, title: null, text: "  " }] } }),
    ],
  ])("%s → contentUnreadable (never the HERITAGE frame alone)", async (_label, patch) => {
    expect(await adaptTraditionsV2(context(patch(fullAnnouncementWithTraditions())))).toEqual({
      ok: false,
      reason: "contentUnreadable",
    });
  });
});

describe("adaptSymbolicOfferingsV1Section (M3, F1)", () => {
  it("passes the skin variant and the language only — no family content, no media", async () => {
    const resolver = recordingResolver();
    for (const skinVariant of ["light", "dark"] as const) {
      for (const language of ["fr", "en", "es"] as const) {
        const result = await adaptSymbolicOfferingsV1Section(
          context(fullAnnouncement(), { skinVariant, language, resolveMedia: resolver.resolve }),
        );
        expect(result).toEqual({ ok: true, props: { skinVariant, language } });
      }
    }
    expect(resolver.calls).toEqual([]);
  });

  it("a language without validated wording gets no rubrique (textUnavailable)", async () => {
    const unknown = "de" as unknown as AdapterContext["language"];
    expect(await adaptSymbolicOfferingsV1Section(context(fullAnnouncement(), { language: unknown }))).toEqual({
      ok: false,
      reason: "textUnavailable",
    });
  });

  it("refuses any other skin", async () => {
    expect(await adaptSymbolicOfferingsV1Section(context(fullAnnouncement(), { skin: null }))).toEqual({
      ok: false,
      reason: "skinMismatch",
    });
  });
});
