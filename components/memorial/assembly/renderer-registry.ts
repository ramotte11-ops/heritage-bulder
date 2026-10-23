import type { ComponentType } from "react";
import type { RendererKey } from "@/config/memorial-section-renderers";
import type { RendererPropsMap } from "@/lib/memorial/assembly/renderer-adapters";
import { HeroIntemporel } from "@/components/memorial/hero/HeroIntemporel";
import { DeathNoticeIntemporel } from "@/components/memorial/death-notice/DeathNoticeIntemporel";
import { DeathNoticeV2 } from "@/components/memorial/death-notice/v2/DeathNoticeV2";
import { CeremonyIntemporel } from "@/components/memorial/ceremony/CeremonyIntemporel";
import { CeremonyV2 } from "@/components/memorial/ceremony/v2/CeremonyV2";
import { RecitDeVieIntemporel } from "@/components/memorial/life-story/RecitDeVieIntemporel";
import { RecitDeVieV2 } from "@/components/memorial/life-story/v2/RecitDeVieV2";
import { TraditionsV2 } from "@/components/memorial/traditions/v2/TraditionsV2";
import { GalleryIntemporel } from "@/components/memorial/gallery/GalleryIntemporel";
import { SymbolicOfferingsV1Section } from "@/components/memorial/symbolic-offerings/v1/SymbolicOfferingsV1Section";

/**
 * Étape 2 — Assembleur du Memorial: the renderer key → real component
 * table `config/memorial-section-renderers.ts` deliberately left to "the
 * future assembler". Exhaustive over `RendererKey`: a key added to
 * `RENDERER_KEYS` without its component fails to typecheck. Each entry
 * is the validated renderer itself — no wrapper, no fork, no fallback.
 * One exception, by design: `SymbolicOfferingsV1Section` is the gate
 * that keeps the validated `SymbolicOfferingsV1` inside the Builder
 * Preview (it draws nothing elsewhere).
 */
export const RENDERER_COMPONENTS: { readonly [K in RendererKey]: ComponentType<RendererPropsMap[K]> } = {
  HeroIntemporel,
  DeathNoticeIntemporel,
  DeathNoticeV2,
  CeremonyIntemporel,
  CeremonyV2,
  RecitDeVieIntemporel,
  RecitDeVieV2,
  TraditionsV2,
  GalleryIntemporel,
  SymbolicOfferingsV1Section,
};
