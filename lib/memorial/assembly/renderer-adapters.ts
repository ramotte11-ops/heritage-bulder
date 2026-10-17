import type { Language } from "@/config/languages";
import type { SectionId } from "@/config/sections";
import type { Skin, SkinVariant } from "@/config/skins";
import type { RendererKey } from "@/config/memorial-section-renderers";
import type { MemorialContent } from "@/types/memorial";
import type { HeroIntemporelProps } from "@/components/memorial/hero/HeroIntemporel";
import type { DeathNoticeIntemporelProps } from "@/components/memorial/death-notice/DeathNoticeIntemporel";
import type { CeremonyIntemporelProps } from "@/components/memorial/ceremony/CeremonyIntemporel";
import type { CeremonyV2Props } from "@/components/memorial/ceremony/v2/CeremonyV2";
import type { RecitDeVieIntemporelProps } from "@/components/memorial/life-story/RecitDeVieIntemporel";
import type { RecitDeVieV2Props } from "@/components/memorial/life-story/v2/RecitDeVieV2";
import type { TraditionsV2Props } from "@/components/memorial/traditions/v2/TraditionsV2";
import type { GalleryIntemporelProps } from "@/components/memorial/gallery/GalleryIntemporel";
import { inspectHero, isHeroContentComplete } from "@/lib/memorial/hero";
import { inspectDeathNotice } from "@/lib/memorial/death-notice";
import { inspectCeremony } from "@/lib/memorial/ceremony";
import { inspectPersonWords } from "@/lib/memorial/person-words";
import { inspectLovedThings } from "@/lib/memorial/loved-things";
import { inspectLegacy } from "@/lib/memorial/legacy";
import { inspectTraditions } from "@/lib/memorial/traditions";
import { inspectGallery } from "@/lib/memorial/gallery-content";
import { translateWith } from "@/lib/i18n/translate";
import type { A13FamilyMedia } from "@/lib/memorial/gallery/gallery-desktop-runtime";
import type { MediaResolver } from "./media-resolver";

/**
 * Étape 2 — Assembleur du Memorial: one adapter per real renderer.
 *
 * An adapter turns the memorial's content into the exact props its
 * renderer expects — or refuses (fail closed). Pure except for the
 * injected `resolveMedia`; no React, no Next, no Supabase: the renderer
 * types are imported as types only.
 *
 * Every adapter re-checks its own invariants through the `inspect*`
 * readers, even though `composeMemorial` already judged the section
 * `renderable`. The `read*` convenience readers the renderers use
 * collapse a corrupted value to an empty one, so without this re-check a
 * corrupted matter would silently render as an empty Ceremony, or as
 * the Récit's HERITAGE fallback standing in for the family's own text —
 * a false rendering. A refusal is never softened: no placeholder, no
 * `photo={null}`, no other skin.
 *
 * Every renderer hard-codes `SkinScope skin="intemporel"`, so each
 * adapter also refuses any other skin.
 */

export interface RendererPropsMap {
  HeroIntemporel: HeroIntemporelProps;
  DeathNoticeIntemporel: DeathNoticeIntemporelProps;
  CeremonyIntemporel: CeremonyIntemporelProps;
  CeremonyV2: CeremonyV2Props;
  RecitDeVieIntemporel: RecitDeVieIntemporelProps;
  RecitDeVieV2: RecitDeVieV2Props;
  TraditionsV2: TraditionsV2Props;
  GalleryIntemporel: GalleryIntemporelProps;
}

/** One assembled section: a renderer key and the props for exactly
 * that renderer (discriminated on `rendererKey`). */
export type AssembledSection = {
  [K in RendererKey]: { sectionId: SectionId; rendererKey: K; props: RendererPropsMap[K] };
}[RendererKey];

export type AssemblyFailureReason =
  /** The composition's skin is not the one this renderer draws. */
  | "skinMismatch"
  /** The matter is corrupted, absent, or breaks the renderer's invariants. */
  | "contentUnreadable"
  /** A required media could not be resolved to a displayable URL. */
  | "mediaUnavailable"
  /** No adapter exists for this renderer key. */
  | "noAdapter"
  /** The adapter threw unexpectedly. */
  | "adapterError"
  /** A HERITAGE text the renderer needs has no validated wording for the memorial's language. */
  | "textUnavailable";

export interface AdapterContext {
  content: MemorialContent;
  skin: Skin | null;
  skinVariant: SkinVariant;
  language: Language;
  resolveMedia: MediaResolver;
}

export type AdapterResult<K extends RendererKey> =
  | { ok: true; props: RendererPropsMap[K] }
  | { ok: false; reason: AssemblyFailureReason };

export type RendererAdapter<K extends RendererKey> = (context: AdapterContext) => Promise<AdapterResult<K>>;

function refuse(reason: AssemblyFailureReason): { ok: false; reason: AssemblyFailureReason } {
  return { ok: false, reason };
}

export const adaptHeroIntemporel: RendererAdapter<"HeroIntemporel"> = async (context) => {
  if (context.skin !== "intemporel") return refuse("skinMismatch");

  const read = inspectHero(context.content);
  if (read.status !== "valid") return refuse("contentUnreadable");
  const hero = read.hero;
  if (!isHeroContentComplete(hero) || hero.photo === null) return refuse("contentUnreadable");

  const mediaId = hero.photo.mediaId;
  let resolved: Awaited<ReturnType<MediaResolver>>;
  try {
    resolved = await context.resolveMedia({ mediaId, purpose: "hero" });
  } catch {
    return refuse("mediaUnavailable");
  }
  if (resolved === null || resolved.mediaId !== mediaId) return refuse("mediaUnavailable");
  if (typeof resolved.readUrl !== "string" || resolved.readUrl === "") return refuse("mediaUnavailable");

  return {
    ok: true,
    props: {
      hero,
      // Only the URL — never whatever else a resolver might have attached.
      photo: { readUrl: resolved.readUrl },
      skinVariant: context.skinVariant,
      language: context.language,
    },
  };
};

export const adaptDeathNoticeIntemporel: RendererAdapter<"DeathNoticeIntemporel"> = async (context) => {
  if (context.skin !== "intemporel") return refuse("skinMismatch");

  const hero = inspectHero(context.content);
  if (hero.status !== "valid" || hero.hero.displayName === null) return refuse("contentUnreadable");

  const deathNotice = inspectDeathNotice(context.content);
  if (deathNotice.status !== "valid" || deathNotice.deathNotice.announcementText === null) {
    return refuse("contentUnreadable");
  }

  return {
    ok: true,
    props: {
      hero: hero.hero,
      deathNotice: deathNotice.deathNotice,
      language: context.language,
      skinVariant: context.skinVariant,
      // QG D3: the Hero's name is the Memorial's only <h1>.
      headingLevel: "section",
    },
  };
};

export const adaptCeremonyIntemporel: RendererAdapter<"CeremonyIntemporel"> = async (context) => {
  if (context.skin !== "intemporel") return refuse("skinMismatch");
  if (inspectCeremony(context.content).status !== "valid") return refuse("contentUnreadable");

  return {
    ok: true,
    props: { content: context.content, language: context.language, skinVariant: context.skinVariant },
  };
};

/** C5 — the same fail-closed Ceremony read, adapted to V2's direct
 * `ceremony` contract. Desktop Dark remains identifiable as provisional
 * through the renderer's unchanged token status. */
export const adaptCeremonyV2: RendererAdapter<"CeremonyV2"> = async (context) => {
  if (context.skin !== "intemporel") return refuse("skinMismatch");
  const inspected = inspectCeremony(context.content);
  if (inspected.status !== "valid") return refuse("contentUnreadable");

  return {
    ok: true,
    props: {
      ceremony: inspected.ceremony,
      language: context.language,
      skinVariant: context.skinVariant,
      headingLevel: "section",
    },
  };
};

/** QG decision: a resolved sheet with all three matters empty stays
 * renderable (the renderer's HERITAGE fallbacks). Only a CORRUPTED
 * matter is refused — its fallback would stand in for the family's own
 * text. */
function adaptLifeStory(context: AdapterContext): AdapterResult<"RecitDeVieIntemporel" | "RecitDeVieV2"> {
  if (context.skin !== "intemporel") return refuse("skinMismatch");
  if (
    inspectPersonWords(context.content).status === "corrupted" ||
    inspectLovedThings(context.content).status === "corrupted" ||
    inspectLegacy(context.content).status === "corrupted"
  ) {
    return refuse("contentUnreadable");
  }

  return {
    ok: true,
    props: { content: context.content, language: context.language, skinVariant: context.skinVariant },
  };
}

export const adaptRecitDeVieIntemporel: RendererAdapter<"RecitDeVieIntemporel"> = async (context) => adaptLifeStory(context);

/** Récit de vie V2 — exactly the same contract as the V1 adapter (same
 * matters, same refusals, same props): only the renderer differs. */
export const adaptRecitDeVieV2: RendererAdapter<"RecitDeVieV2"> = async (context) => adaptLifeStory(context);

/**
 * Traditions & repères V2 (M1) — the family's confirmed repères
 * (`content.traditions`, written at A09), handed to the validated
 * renderer as is: their order, titles and texts are never touched.
 *
 * Re-checked through `inspectTraditions`, never `readTraditions` (which
 * collapses a corrupted value to an empty list): a corrupted value is
 * refused, and so is a list with no repère — the section would then be
 * the HERITAGE header and footer alone, never a validated rendering.
 * The Hero's name is the Memorial's only <h1> (QG D3): `section` level.
 */
export const adaptTraditionsV2: RendererAdapter<"TraditionsV2"> = async (context) => {
  if (context.skin !== "intemporel") return refuse("skinMismatch");

  const traditions = inspectTraditions(context.content);
  if (traditions.status !== "valid" || traditions.traditions.entries.length === 0) {
    return refuse("contentUnreadable");
  }

  return {
    ok: true,
    props: {
      traditions: traditions.traditions,
      language: context.language,
      skinVariant: context.skinVariant,
      headingLevel: "section",
    },
  };
};

/**
 * Dettes D2–D4 — the Gallery's HERITAGE title and subtitle, owned by the
 * Gallery adapter (QG decision: HERITAGE text, never family content,
 * never stored in `content.gallery`).
 *
 * FR is the wording the A13 G2–G5 geometry was validated with (the title
 * glyph mask is measured from it — `A13_PILOT_TITLE`, asserted equal in
 * the tests). EN and ES are HERITAGE editorial proposals submitted to the
 * QG, each validated in the REAL geometry before being wired: real glyph
 * mask with the loaded font, the unchanged `solveV2` on G2–G5 (Master
 * self-check + the 96-case fixture matrix, all PASS, no STOP) and the
 * product path `runDesktopGallery` — no engine, constraint or geometry
 * changed to fit them. A language absent from this table gets no Gallery
 * (`textUnavailable`, fail closed) — never an unvalidated translation.
 */
export const GALLERY_HERITAGE_TEXTS: Readonly<Partial<Record<Language, { title: string; subtitle: string }>>> = {
  fr: { title: "Souvenirs de famille", subtitle: "Les instants que nous gardons près de nous" },
  en: { title: "Family Memories", subtitle: "The moments we hold close" },
  es: { title: "Recuerdos de familia", subtitle: "Los instantes que guardamos cerca del corazón" },
};

function isNaturalSide(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/**
 * The Gallery (A13 Desktop). Reads `content.gallery` (mediaId + caption,
 * the family's order), resolves each media server-side through the
 * injected resolver (`purpose: "gallery"`) and keeps, IN ORDER, only the
 * usable ones: resolved, same id, a signed URL, and natural dimensions
 * measured at finalization. A missing, foreign, wrong-purpose, pending or
 * dimensionless media is simply left out (fail closed per photograph) —
 * never replaced, never re-ordered. Fewer than two usable photographs →
 * no Gallery (`mediaUnavailable`); the state (G2…G6, Signature 7+) is then
 * the A13 runtime's own decision on that count.
 *
 * Alt text (QG decision): the family's caption as is when present,
 * otherwise the validated HERITAGE position label ("Souvenir 3 sur 12",
 * i18n `memory.position`). The caption is never translated.
 *
 * Only `{ mediaId, src, alt, width, height, focal, caption }` reaches the
 * renderer — never a storage path or any other internal column.
 */
export const adaptGalleryIntemporel: RendererAdapter<"GalleryIntemporel"> = async (context) => {
  if (context.skin !== "intemporel") return refuse("skinMismatch");

  const gallery = inspectGallery(context.content);
  if (gallery.status !== "valid") return refuse("contentUnreadable");

  const texts = GALLERY_HERITAGE_TEXTS[context.language];
  if (texts === undefined) return refuse("textUnavailable");

  const resolved = await Promise.all(
    gallery.gallery.items.map(async (item) => {
      try {
        const media = await context.resolveMedia({ mediaId: item.mediaId, purpose: "gallery" });
        if (media === null || media.mediaId !== item.mediaId) return null;
        if (typeof media.readUrl !== "string" || media.readUrl === "") return null;
        if (!isNaturalSide(media.width) || !isNaturalSide(media.height)) return null;
        return { item, readUrl: media.readUrl, width: media.width, height: media.height };
      } catch {
        return null;
      }
    }),
  );
  const usable = resolved.filter((entry) => entry !== null);
  if (usable.length < 2) return refuse("mediaUnavailable");

  const media: A13FamilyMedia[] = usable.map(({ item, readUrl, width, height }, index) => ({
    mediaId: item.mediaId,
    src: readUrl,
    alt: item.caption ?? translateWith(context.language, "memory.position", { index: index + 1, total: usable.length }),
    width,
    height,
    focal: null,
    caption: item.caption,
  }));

  return {
    ok: true,
    props: { media, theme: context.skinVariant, title: texts.title, subtitle: texts.subtitle, language: context.language },
  };
};

/** Exhaustive over `RendererKey`: a key added to `RENDERER_KEYS` without
 * an adapter fails to typecheck. */
export const RENDERER_ADAPTERS: { readonly [K in RendererKey]: RendererAdapter<K> } = {
  HeroIntemporel: adaptHeroIntemporel,
  DeathNoticeIntemporel: adaptDeathNoticeIntemporel,
  CeremonyIntemporel: adaptCeremonyIntemporel,
  CeremonyV2: adaptCeremonyV2,
  RecitDeVieIntemporel: adaptRecitDeVieIntemporel,
  RecitDeVieV2: adaptRecitDeVieV2,
  TraditionsV2: adaptTraditionsV2,
  GalleryIntemporel: adaptGalleryIntemporel,
};
