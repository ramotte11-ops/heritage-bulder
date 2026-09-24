import type { ComponentType } from "react";
import type { RendererKey } from "@/config/memorial-section-renderers";
import type { RendererPropsMap } from "@/lib/memorial/assembly/renderer-adapters";
import { HeroIntemporel } from "@/components/memorial/hero/HeroIntemporel";
import { DeathNoticeIntemporel } from "@/components/memorial/death-notice/DeathNoticeIntemporel";
import { CeremonyIntemporel } from "@/components/memorial/ceremony/CeremonyIntemporel";
import { RecitDeVieIntemporel } from "@/components/memorial/life-story/RecitDeVieIntemporel";

/**
 * Étape 2 — Assembleur du Memorial: the renderer key → real component
 * table `config/memorial-section-renderers.ts` deliberately left to "the
 * future assembler". Exhaustive over `RendererKey`: a key added to
 * `RENDERER_KEYS` without its component fails to typecheck. Each entry
 * is the validated renderer itself — no wrapper, no fork, no fallback.
 */
export const RENDERER_COMPONENTS: { readonly [K in RendererKey]: ComponentType<RendererPropsMap[K]> } = {
  HeroIntemporel,
  DeathNoticeIntemporel,
  CeremonyIntemporel,
  RecitDeVieIntemporel,
};
