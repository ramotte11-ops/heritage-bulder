import type { ReactNode } from "react";
import type { Skin } from "@/config/skins";
import { skinScopeAttributes } from "@/lib/memorial/skin-runtime";

export interface SkinScopeProps {
  /** An already-resolved skin — see `resolveSkinRuntime` in
   * `lib/memorial/skin-runtime.ts`. Never pass a raw `memorial.skin_id`
   * straight through; resolve it first so an invalid value can never
   * reach this component. */
  skin: Skin;
  /**
   * The memorial renderer this scope wraps — the SAME renderer for
   * every skin (mission brief section 6/16). This component never
   * inspects, brands, or forks on `skin` beyond the one attribute below;
   * it does not know what a Hero, a section, or a memorial even is.
   */
  children: ReactNode;
}

/**
 * Mission 029 — the memorial skin scope.
 *
 * The one place `data-heritage-skin` is written to the DOM (mission
 * brief section 10's suggested mechanism). A future skin's CSS can then
 * target `[data-heritage-skin="musulman"] { ... }` to override one of
 * Mission 028's semantic tokens for that scope alone — no component
 * fork, no per-skin renderer.
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
export function SkinScope({ skin, children }: SkinScopeProps) {
  return <div {...skinScopeAttributes(skin)}>{children}</div>;
}
