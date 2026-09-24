import type { Language } from "@/config/languages";
import type { EditorialContext } from "@/config/memorial";
import type { SectionId } from "@/config/sections";
import type { Skin, SkinVariant } from "@/config/skins";
import type { RendererKey } from "@/config/memorial-section-renderers";
import type { MemorialContent } from "@/types/memorial";
import type { HeroIntemporelProps } from "@/components/memorial/hero/HeroIntemporel";
import type { DeathNoticeIntemporelProps } from "@/components/memorial/death-notice/DeathNoticeIntemporel";
import type { CeremonyIntemporelProps } from "@/components/memorial/ceremony/CeremonyIntemporel";
import type { RecitDeVieIntemporelProps } from "@/components/memorial/life-story/RecitDeVieIntemporel";
import { inspectHero, isHeroContentComplete } from "@/lib/memorial/hero";
import { inspectDeathNotice } from "@/lib/memorial/death-notice";
import { inspectCeremony } from "@/lib/memorial/ceremony";
import { inspectPersonWords } from "@/lib/memorial/person-words";
import { inspectLovedThings } from "@/lib/memorial/loved-things";
import { inspectLegacy } from "@/lib/memorial/legacy";
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
 * The four renderers hard-code `SkinScope skin="intemporel"`, so each
 * adapter also refuses any other skin.
 */

export interface RendererPropsMap {
  HeroIntemporel: HeroIntemporelProps;
  DeathNoticeIntemporel: DeathNoticeIntemporelProps;
  CeremonyIntemporel: CeremonyIntemporelProps;
  RecitDeVieIntemporel: RecitDeVieIntemporelProps;
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
  | "adapterError";

export interface AdapterContext {
  content: MemorialContent;
  editorialContext: EditorialContext;
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
      editorialContext: context.editorialContext,
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
      editorialContext: context.editorialContext,
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

/** QG decision: a resolved sheet with all three matters empty stays
 * renderable (the renderer's HERITAGE fallbacks). Only a CORRUPTED
 * matter is refused — its fallback would stand in for the family's own
 * text. */
export const adaptRecitDeVieIntemporel: RendererAdapter<"RecitDeVieIntemporel"> = async (context) => {
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
};

/** Exhaustive over `RendererKey`: a key added to `RENDERER_KEYS` without
 * an adapter fails to typecheck. */
export const RENDERER_ADAPTERS: { readonly [K in RendererKey]: RendererAdapter<K> } = {
  HeroIntemporel: adaptHeroIntemporel,
  DeathNoticeIntemporel: adaptDeathNoticeIntemporel,
  CeremonyIntemporel: adaptCeremonyIntemporel,
  RecitDeVieIntemporel: adaptRecitDeVieIntemporel,
};
