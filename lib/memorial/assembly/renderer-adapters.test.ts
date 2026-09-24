import { describe, expect, it } from "vitest";
import type { MemorialContent } from "@/types/memorial";
import type { Skin } from "@/config/skins";
import type { RendererKey } from "@/config/memorial-section-renderers";
import {
  RENDERER_ADAPTERS,
  adaptCeremonyIntemporel,
  adaptDeathNoticeIntemporel,
  adaptHeroIntemporel,
  adaptRecitDeVieIntemporel,
  type AdapterContext,
} from "./renderer-adapters";
import type { ResolvedMedia } from "./media-resolver";
import {
  FIXTURE_HERO_MEDIA_ID,
  FIXTURE_READ_URL,
  fullAnnouncement,
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
    editorialContext: "announcement",
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
