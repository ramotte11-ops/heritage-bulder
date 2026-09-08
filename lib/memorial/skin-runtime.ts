import { SKINS, type Skin } from "@/config/skins";

/**
 * Mission 029 — the memorial skin runtime foundation.
 *
 * HERITAGE has one Memorial Builder and one memorial renderer; a skin
 * only changes which visual identity that same renderer is scoped
 * under. This module is the small, framework-free mechanism that turns
 * a `Memorial.skin` value into that scope — nothing here renders
 * anything, decides a religion, a language, or a section, and nothing
 * here knows Etsy or `offer_id` exist (see this file's own imports:
 * `@/config/skins` only).
 *
 * ## Source of truth
 *
 * `SKINS`/`Skin` come from `config/skins.ts` — this module deliberately
 * does not restate the four V1 ids (`intemporel`, `musulman`, `juif`,
 * `hindou`) as a second list. Growing or correcting the V1 segmentation
 * is a `config/skins.ts` change only; this file picks it up for free.
 *
 * ## Fail-safe strategy for an invalid or missing skin (mission brief
 * section 12)
 *
 * `resolveSkinRuntime` NEVER falls back to `intemporel` — not for an
 * unrecognized id (a corrupted row, a retired V1 id like `occidental` or
 * `africain` leaking back in), and not for a missing one (`null`,
 * `undefined`, an empty string). Both come back as the same explicit
 * `{ status: "invalid" }` result, carrying the raw value that was
 * received for logging/diagnostics. `intemporel` is not, and must never
 * become, "what happens when nothing else matches" — it is one of the
 * four skins, at the exact same level as the other three (section 20).
 *
 * A caller can never accidentally scope a memorial under an invalid
 * skin: `skinScopeAttributes` below only accepts an already-validated
 * `Skin`, not the `unknown` `resolveSkinRuntime` takes in — the type
 * system, not caller discipline, is what keeps an invalid id from ever
 * reaching the DOM as a scope value. What a caller does with an
 * `"invalid"` result (an error boundary, a monitoring alert, a
 * temporary non-cultural HERITAGE Core render) is a decision for the
 * surface that owns the real memorial renderer — no such surface exists
 * yet (see this module's own docstring below on integration), so this
 * mission does not build that handling UI.
 */

export type SkinRuntimeResolution =
  | { status: "resolved"; skin: Skin }
  | { status: "invalid"; received: unknown };

const VALID_SKINS: readonly string[] = SKINS;

/**
 * Validates a raw `skin_id` value (as it arrives from `memorial.skin_id`
 * — untyped at the actual boundary, since nothing between the database
 * and this function currently re-checks the DB's own CHECK constraint;
 * see the mission report's audit note on
 * `lib/adapters/supabase/memorial-repository.ts`) against the real V1
 * skin list.
 *
 * Deliberately takes `unknown`, not `Skin`: a TypeScript-level `Skin`
 * annotation elsewhere in the codebase is a claim, not a guarantee — the
 * value already flowed through an untyped cast at least once. This is
 * the one place that turns the claim into a checked fact.
 */
export function resolveSkinRuntime(skinId: unknown): SkinRuntimeResolution {
  if (typeof skinId === "string" && VALID_SKINS.includes(skinId)) {
    return { status: "resolved", skin: skinId as Skin };
  }

  return { status: "invalid", received: skinId };
}

/**
 * The single DOM attribute name the skin runtime scopes a memorial
 * render under (mission brief section 10). One constant so every future
 * caller (Preview, V02, the published memorial, ...) and every future
 * skin-aware CSS rule agree on the exact same name.
 */
export const SKIN_SCOPE_ATTRIBUTE = "data-heritage-skin" as const;

/**
 * The scope attributes to spread onto whatever DOM node wraps the
 * memorial renderer — see `components/memorial/SkinScope.tsx` for the
 * thin component built on top of this. Takes an already-resolved `Skin`
 * on purpose (see this module's docstring): there is no overload that
 * accepts a `SkinRuntimeResolution` or an `unknown`, so an `"invalid"`
 * resolution structurally cannot be turned into a scope value.
 */
export function skinScopeAttributes(skin: Skin): Record<typeof SKIN_SCOPE_ATTRIBUTE, Skin> {
  return { [SKIN_SCOPE_ATTRIBUTE]: skin };
}
