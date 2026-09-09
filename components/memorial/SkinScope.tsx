import type { ReactNode } from "react";
import type { Skin, SkinVariant } from "@/config/skins";
import { skinScopeAttributes } from "@/lib/memorial/skin-runtime";

export interface SkinScopeProps {
  /** An already-resolved skin — see `resolveSkinRuntime` in
   * `lib/memorial/skin-runtime.ts`. Never pass a raw `memorial.skin_id`
   * straight through; resolve it first so an invalid value can never
   * reach this component. */
  skin: Skin;
  /**
   * Mission 029B — an already-resolved variant, same contract as `skin`
   * above: see `resolveSkinVariantRuntime`. Never pass a raw
   * `memorial.skin_variant` straight through, and never derive this from
   * `prefers-color-scheme`/`window.matchMedia` — it is a persisted
   * HERITAGE ambiance, not a device setting (AGENTS.md Mission 029B
   * section 3).
   */
  skinVariant: SkinVariant;
  /**
   * The memorial renderer this scope wraps — the SAME renderer for
   * every skin AND every variant (mission brief section 6/16). This
   * component never inspects, brands, or forks on `skin`/`skinVariant`
   * beyond the two attributes below; it does not know what a Hero, a
   * section, or a memorial even is.
   */
  children: ReactNode;
}

/**
 * Mission 029 — the memorial skin scope.
 * Mission 029B — extended with the independent `skinVariant` dimension.
 *
 * The one place `data-heritage-skin` and `data-heritage-skin-variant`
 * are written to the DOM (mission brief section 10's suggested
 * mechanism). A future skin's CSS can then target
 * `[data-heritage-skin="musulman"][data-heritage-skin-variant="dark"] {
 * ... }` to override one of Mission 028's semantic tokens for that exact
 * scope alone — no component fork, no per-skin or per-variant renderer.
 *
 * No renderer is wrapped in this yet: neither `MemorialPreview` (Mission
 * 021 documents it as a local demonstration preview only — "pas de vrai
 * layout/skin", no public data) nor a published memorial page exist as
 * a real memorial-rendering boundary today. Wrapping either now would
 * mean inventing a fake Hero/mémorial just to exercise this component,
 * which the mission brief explicitly forbids (section 15). The future
 * real memorial renderer (Live Preview's real content, V02, the
 * published page) is this component's intended caller — see the
 * mission report for this exact integration point.
 */
export function SkinScope({ skin, skinVariant, children }: SkinScopeProps) {
  return <div {...skinScopeAttributes(skin, skinVariant)}>{children}</div>;
}
