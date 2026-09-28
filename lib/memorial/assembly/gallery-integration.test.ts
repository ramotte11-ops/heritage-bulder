import { describe, expect, it } from "vitest";
import type { MemorialContent } from "@/types/memorial";
import type { SkinVariant } from "@/config/skins";
import type { Language } from "@/config/languages";
import { selectGalleryState } from "@/config/gallery-a13-multi-state-manifests";
import { A13_PILOT_TITLE } from "@/lib/memorial/gallery/a13-pilot-fixtures";
import { composeMemorial } from "@/lib/memorial/composition/compose-memorial";
import { updateGallery } from "@/lib/memorial/gallery-content";
import { assembleMemorial } from "./assemble-memorial";
import { GALLERY_HERITAGE_TEXTS, adaptGalleryIntemporel, type AdapterContext } from "./renderer-adapters";
import type { MediaRequest, ResolvedMedia } from "./media-resolver";
import { FIXTURE_READ_URL, fullAnnouncement, recordingResolver } from "./test-fixtures";

/**
 * Dettes D2–D4 — the Gallery as a REAL Memorial section: content.gallery →
 * composeMemorial (readiness + content signal, never enabled_sections) →
 * assembleMemorial → adaptGalleryIntemporel (media resolved server-side,
 * purpose "gallery", fail closed per photograph) → GalleryIntemporel props.
 */

const id = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-8000-00000000000${n % 10}`;

interface FakeMedia {
  purpose: "hero" | "gallery";
  width: number | null;
  height: number | null;
}

/** A resolver shaped like the Owner/draft one: purpose-checked, dimensions from the row, nothing else. */
function mediaResolver(rows: Record<string, FakeMedia>) {
  return recordingResolver((request: MediaRequest): ResolvedMedia | null => {
    const row = rows[request.mediaId];
    if (!row || row.purpose !== request.purpose) return null;
    return { mediaId: request.mediaId, readUrl: `${FIXTURE_READ_URL}/${request.mediaId}`, width: row.width, height: row.height };
  });
}

function galleryRows(n: number, overrides: Record<number, Partial<FakeMedia>> = {}): Record<string, FakeMedia> {
  const rows: Record<string, FakeMedia> = {};
  for (let i = 1; i <= n; i += 1) rows[id(i)] = { purpose: "gallery", width: 1200 + i, height: 1600, ...overrides[i] };
  return rows;
}

function withGallery(content: MemorialContent, items: { mediaId: string; caption?: string | null }[]): MemorialContent {
  const written = updateGallery(content, { items: items.map((item) => ({ mediaId: item.mediaId, caption: item.caption ?? null })) });
  if (!written.ok) throw new Error(written.reason);
  return written.content;
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => id(i + 1));
const items = (n: number) => ids(n).map((mediaId) => ({ mediaId }));

function context(content: MemorialContent, rows: Record<string, FakeMedia>, overrides: Partial<AdapterContext> = {}) {
  const resolver = mediaResolver(rows);
  const ctx: AdapterContext = { content, editorialContext: "announcement", skin: "intemporel", skinVariant: "light", language: "fr", resolveMedia: resolver.resolve, ...overrides };
  return { ctx, resolver };
}

describe("composition — presence from content only (never enabled_sections)", () => {
  const base = fullAnnouncement();
  const stateOf = (content: MemorialContent) => composeMemorial({ editorialContext: "announcement", skin: "intemporel", skinVariant: "light", content }).sections.find((s) => s.sectionId === "gallery")!;

  it("no gallery / 0 / 1 photograph → not renderable (optional)", () => {
    for (const content of [base, withGallery(base, []), withGallery(base, items(1))]) expect(stateOf(content).state).toBe("optional");
  });

  it("2…7+ photographs → renderable, rendered by GalleryIntemporel", () => {
    for (const n of [2, 3, 4, 5, 6, 7, 12]) {
      const section = stateOf(withGallery(base, items(n)));
      expect(section).toMatchObject({ selection: "applicable", ready: true, rendererKey: "GalleryIntemporel", state: "renderable" });
    }
  });

  it("a corrupted gallery never renders; the rule is the A13 runtime's own (selectGalleryState)", () => {
    expect(stateOf({ ...base, gallery: { items: [{ mediaId: "https://x" }, { mediaId: "https://y" }] } } as MemorialContent).state).toBe("optional");
    for (let n = 0; n <= 8; n += 1) expect(stateOf(withGallery(base, items(n))).state === "renderable").toBe(selectGalleryState(n) !== null);
  });

  it("remembrance too: the Gallery is a section of both contexts", () => {
    const composition = composeMemorial({ editorialContext: "remembrance", skin: "intemporel", skinVariant: "dark", content: withGallery(base, items(3)) });
    expect(composition.sections.find((s) => s.sectionId === "gallery")?.state).toBe("renderable");
  });

  it("the composition input has no enabled_sections at all — the source says so, and never reads it", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const code = (f: string) => readFileSync(path.resolve(import.meta.dirname, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const f of ["../composition/compose-memorial.ts", "../gallery-content.ts", "./renderer-adapters.ts", "./assemble-memorial.ts"]) {
      expect(code(f), f).not.toMatch(/enabled_?[sS]ections|enabledSections/);
    }
  });
});

describe("adaptGalleryIntemporel — media resolved server-side, fail closed per photograph", () => {
  it("resolves every item with purpose 'gallery', in the family's order, and keeps that order", async () => {
    const order = [id(5), id(2), id(7), id(1)];
    const rows = galleryRows(7);
    const { ctx, resolver } = context(withGallery({}, order.map((mediaId) => ({ mediaId }))), rows);
    const result = await adaptGalleryIntemporel(ctx);
    expect(resolver.calls).toEqual(order.map((mediaId) => ({ mediaId, purpose: "gallery" })));
    expect(result.ok && result.props.media.map((m) => m.mediaId)).toEqual(order);
  });

  it("hands the runtime exactly { mediaId, src, alt, width, height, focal, caption } — no storage path, no internal column", async () => {
    const { ctx } = context(withGallery({}, [{ mediaId: id(1), caption: "Maman" }, { mediaId: id(2) }]), galleryRows(2));
    const result = await adaptGalleryIntemporel(ctx);
    if (!result.ok) throw new Error(result.reason);
    for (const m of result.props.media) expect(Object.keys(m).sort()).toEqual(["alt", "caption", "focal", "height", "mediaId", "src", "width"]);
    expect(result.props.media[0]).toEqual({ mediaId: id(1), src: `${FIXTURE_READ_URL}/${id(1)}`, alt: "Maman", width: 1201, height: 1600, focal: null, caption: "Maman" });
    expect(Object.keys(result.props).sort()).toEqual(["language", "media", "subtitle", "theme", "title"]);
  });

  it("leaves out a missing, wrong-purpose or dimensionless media — order of the rest kept, count recomputed", async () => {
    const rows = galleryRows(6, { 2: { purpose: "hero" }, 4: { width: null, height: null } });
    delete rows[id(5)];
    const { ctx } = context(withGallery({}, items(6)), rows);
    const result = await adaptGalleryIntemporel(ctx);
    expect(result.ok && result.props.media.map((m) => m.mediaId)).toEqual([id(1), id(3), id(6)]);
    // the alt fallback counts the USABLE photographs
    expect(result.ok && result.props.media.map((m) => m.alt)).toEqual(["Souvenir 1 sur 3", "Souvenir 2 sur 3", "Souvenir 3 sur 3"]);
  });

  it("a resolver that throws or answers another id is treated like an unusable media", async () => {
    const rows = galleryRows(4);
    const resolver = recordingResolver((request) => {
      if (request.mediaId === id(1)) throw new Error("storage down");
      if (request.mediaId === id(2)) return { mediaId: id(9), readUrl: "x", width: 1, height: 1 };
      const row = rows[request.mediaId];
      return { mediaId: request.mediaId, readUrl: `u/${request.mediaId}`, width: row.width, height: row.height };
    });
    const result = await adaptGalleryIntemporel({ ...context(withGallery({}, items(4)), rows).ctx, resolveMedia: resolver.resolve });
    expect(result.ok && result.props.media.map((m) => m.mediaId)).toEqual([id(3), id(4)]);
  });

  it("fewer than two usable photographs → no Gallery (mediaUnavailable); 0–1 never renders", async () => {
    const rows = galleryRows(3, { 2: { purpose: "hero" }, 3: { width: null } });
    expect(await adaptGalleryIntemporel(context(withGallery({}, items(3)), rows).ctx)).toEqual({ ok: false, reason: "mediaUnavailable" });
  });

  it("2…12 usable photographs → all handed to the runtime (the runtime picks G2…G6 / Signature and the CTA)", async () => {
    for (const n of [2, 3, 4, 5, 6, 7, 12]) {
      const result = await adaptGalleryIntemporel(context(withGallery({}, items(n)), galleryRows(n)).ctx);
      expect(result.ok && result.props.media).toHaveLength(n);
    }
  });

  it("alt: the family caption as is (never translated), otherwise the validated position label in the memorial's language", async () => {
    const content = withGallery({}, [{ mediaId: id(1), caption: "Mamie à Mimizan, 1966" }, { mediaId: id(2) }]);
    const fr = await adaptGalleryIntemporel(context(content, galleryRows(2)).ctx);
    expect(fr.ok && fr.props.media.map((m) => [m.alt, m.caption])).toEqual([["Mamie à Mimizan, 1966", "Mamie à Mimizan, 1966"], ["Souvenir 2 sur 2", null]]);
  });

  it("theme = skinVariant (light / dark), same media, same order", async () => {
    const content = withGallery({}, items(7));
    const out: Record<SkinVariant, unknown> = { light: null, dark: null };
    for (const skinVariant of ["light", "dark"] as const) {
      const result = await adaptGalleryIntemporel(context(content, galleryRows(7), { skinVariant }).ctx);
      if (!result.ok) throw new Error(result.reason);
      expect(result.props.theme).toBe(skinVariant);
      out[skinVariant] = result.props.media;
    }
    expect(out.dark).toEqual(out.light);
  });

  it("title/subtitle: HERITAGE text owned by the adapter — FR = the wording the G2–G5 geometry was validated with", async () => {
    expect(GALLERY_HERITAGE_TEXTS.fr).toEqual({ title: A13_PILOT_TITLE.title, subtitle: A13_PILOT_TITLE.subtitle });
    const result = await adaptGalleryIntemporel(context(withGallery({}, items(3)), galleryRows(3)).ctx);
    expect(result.ok && [result.props.title, result.props.subtitle]).toEqual(["Souvenirs de famille", "Les instants que nous gardons près de nous"]);
  });

  it("EN / ES: the geometry-validated HERITAGE wording; captions and media unchanged; alt fallback localized", async () => {
    const content = withGallery({}, [{ mediaId: id(1), caption: "Mamie à Mimizan, 1966" }, { mediaId: id(2) }, { mediaId: id(3) }]);
    const expected = {
      en: ["Family Memories", "The moments we hold close", "Memory 2 of 3"],
      es: ["Recuerdos de familia", "Los instantes que guardamos cerca del corazón", "Recuerdo 2 de 3"],
    } as const;
    const fr = await adaptGalleryIntemporel(context(content, galleryRows(3)).ctx);
    for (const language of ["en", "es"] as const) {
      const result = await adaptGalleryIntemporel(context(content, galleryRows(3), { language }).ctx);
      if (!result.ok || !fr.ok) throw new Error("refused");
      expect([result.props.title, result.props.subtitle, result.props.media[1].alt]).toEqual(expected[language]);
      expect(result.props.language).toBe(language);
      // the family caption is never translated; same photographs, same order, same sizes
      expect(result.props.media[0].caption).toBe("Mamie à Mimizan, 1966");
      expect(result.props.media[0].alt).toBe("Mamie à Mimizan, 1966");
      expect(result.props.media.map((m) => [m.mediaId, m.src, m.width, m.height])).toEqual(fr.props.media.map((m) => [m.mediaId, m.src, m.width, m.height]));
    }
  });

  it("the HERITAGE texts cover exactly FR / EN / ES; FR is unchanged", () => {
    expect(Object.keys(GALLERY_HERITAGE_TEXTS).sort()).toEqual(["en", "es", "fr"]);
    expect(GALLERY_HERITAGE_TEXTS.fr).toEqual({ title: "Souvenirs de famille", subtitle: "Les instants que nous gardons près de nous" });
  });

  it("a language without a validated wording gets no Gallery (textUnavailable), no media even resolved", async () => {
    const { ctx, resolver } = context(withGallery({}, items(3)), galleryRows(3), { language: "de" as unknown as Language });
    expect(await adaptGalleryIntemporel(ctx)).toEqual({ ok: false, reason: "textUnavailable" });
    expect(resolver.calls).toEqual([]);
  });

  it("refuses another skin and an unreadable gallery", async () => {
    expect(await adaptGalleryIntemporel(context(withGallery({}, items(3)), galleryRows(3), { skin: null }).ctx)).toEqual({ ok: false, reason: "skinMismatch" });
    expect(await adaptGalleryIntemporel(context({ gallery: { items: "x" } } as unknown as MemorialContent, {}).ctx)).toEqual({ ok: false, reason: "contentUnreadable" });
  });
});

describe("assembleMemorial — the Gallery is one more section of the one pipeline", () => {
  const heroRow = (content: MemorialContent) => {
    const hero = content.hero as { photo: { mediaId: string } };
    return { [hero.photo.mediaId]: { purpose: "hero" as const, width: null, height: null } };
  };

  async function assemble(content: MemorialContent, rows: Record<string, FakeMedia>) {
    const resolver = mediaResolver({ ...heroRow(content), ...rows });
    return assembleMemorial({ editorialContext: "announcement", skin: "intemporel", skinVariant: "light", language: "fr", content }, { resolveMedia: resolver.resolve });
  }

  it("a draft with 7 photographs: Gallery assembled in canonical order, other sections byte-identical", async () => {
    const base = fullAnnouncement();
    const without = await assemble(base, {});
    const withIt = await assemble(withGallery(base, items(7)), galleryRows(7));
    expect(withIt.status).toBe("assembled");
    expect(withIt.sections.map((s) => s.sectionId)).toEqual(["hero", "deathNotice", "story", "ceremony", "gallery"]);
    const gallery = withIt.sections.find((s) => s.sectionId === "gallery")!;
    expect(gallery.rendererKey).toBe("GalleryIntemporel");
    // every other section: same renderer, same props as without a Gallery. The Récit receives the
    // whole draft `content` as a prop (its own contract) — it then carries a `gallery` key it never
    // reads; only that key is neutralized for the comparison.
    const dropGalleryKey = (sections: typeof without.sections) =>
      JSON.stringify(sections, (key, value) => (key === "content" && value && typeof value === "object" ? { ...value, gallery: undefined } : value));
    expect(dropGalleryKey(withIt.sections.filter((s) => s.sectionId !== "gallery"))).toBe(dropGalleryKey(without.sections));
    expect(without.failures).toEqual(withIt.failures);
  });

  it("unusable media: the Gallery is omitted and recorded, the Memorial (Hero, Récit…) stays assembled", async () => {
    const base = fullAnnouncement();
    const result = await assemble(withGallery(base, items(3)), galleryRows(3, { 1: { width: null }, 2: { purpose: "hero" } }));
    expect(result.status).toBe("assembled");
    expect(result.sections.map((s) => s.sectionId)).toEqual(["hero", "deathNotice", "story", "ceremony"]);
    expect(result.failures).toContainEqual({ sectionId: "gallery", rendererKey: "GalleryIntemporel", reason: "mediaUnavailable" });
  });
});
