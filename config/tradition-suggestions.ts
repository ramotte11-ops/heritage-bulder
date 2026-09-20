import type { Language } from "./languages";
import type { OfferId } from "./offers";
import type { Skin } from "./skins";

/**
 * Mission 042 — the Traditions & repères (A09) suggestion catalog and its
 * resolver.
 *
 * ## The one rule this file exists to enforce
 *
 * Resolution is always `configuration -> suggestions allowed to be
 * SHOWN`, never `skin -> practices true FOR this family` (mission brief
 * section 7). Nothing below ever infers, precomputes, or presélects a
 * practice from a skin, an offer, a name, a language, a country, or any
 * other memorial content — it only ever narrows which already-authored,
 * already-neutral suggestion CARDS the family is offered to look at.
 * Whether any of them actually apply to this family, and whether its
 * text is adopted at all, is decided exclusively by the family, at A09
 * (lib/builder/guided-flow/traditions-step.ts /
 * components/builder/TraditionsStep.tsx) — this module has no notion of
 * "selected" at all.
 *
 * ## `TRADITION_SUGGESTIONS` is deliberately empty in V1
 *
 * Mission 042 builds the ENGINE, not a cultural library. No Muslim,
 * Jewish, Hindu, Christian, African, or any other tradition's text is
 * authored anywhere in this codebase (mission brief section 6) — a
 * future, separately reviewed editorial mission populates this array;
 * until then, A09 works perfectly with zero suggestions and the
 * family's own free-form entries alone (mission brief section 6's own
 * "le système peut fonctionner avec zéro suggestion éditoriale").
 * `traditions-step.test.ts`/`TraditionsStep`'s own tests exercise a
 * small, explicitly FICTIONAL catalog fixture (ids like
 * `"fixture:lantern"`, never a real tradition's name) confined to test
 * files only — never imported by, or copied into, this file or any
 * other production module.
 *
 * ## Never `if (skin === "musulman") { ... }`
 *
 * `compatibleOffers`/`compatibleSkins` are plain, declarative arrays a
 * catalog entry carries about ITSELF — there is no branch anywhere in
 * this file (or in `resolveAvailableTraditionSuggestions`) that
 * special-cases any particular `OfferId`/`Skin` value. Growing the
 * catalog tomorrow is only ever a data change to this array, never a
 * change to the resolver or to any Builder logic that calls it.
 */
export interface TraditionSuggestion {
  /** Stable across the catalog's lifetime — this is what a confirmed
   * `TraditionEntry.suggestionId` (types/traditions.ts) points back to.
   * Never reused for a different suggestion once published. */
  id: string;
  /** A short, localized title shown on the suggestion's own card —
   * every supported `Language` present, since a suggestion with a
   * missing translation would otherwise silently read wrong for a
   * family using that language. */
  labels: Record<Language, string>;
  /** The starting editorial text offered if the family picks this
   * suggestion — never persisted as-is until the family explicitly
   * confirms it (mission brief section 9), and freely editable by the
   * family before they do. */
  texts: Record<Language, string>;
  /** Which offers may see this suggestion at all. Absent (or omitted)
   * means "every offer" — never a default that hides a suggestion
   * without an explicit reason to. */
  compatibleOffers?: readonly OfferId[];
  /** Which skins may see this suggestion at all. Absent means "every
   * skin", same convention as `compatibleOffers`. */
  compatibleSkins?: readonly Skin[];
}

/**
 * V1 Intemporel doctrine (mission brief section 6): no cultural
 * suggestion is authored yet. Empty on purpose, not a placeholder
 * forgotten mid-mission — see this module's own docstring above and
 * `tradition-suggestions.test.ts`'s explicit guard that this array stays
 * empty until a dedicated editorial mission populates it.
 */
export const TRADITION_SUGGESTIONS: readonly TraditionSuggestion[] = [];

/** What the resolver needs to know about the memorial asking for
 * suggestions — deliberately minimal, and deliberately never anything
 * about the deceased, their name, their language, their country, or any
 * other memorial content (mission brief section 3). `offerId`/`skin` are
 * both optional: an absent one simply never narrows the catalog on that
 * dimension, the same "absent = no restriction from this axis" rule
 * `compatibleOffers`/`compatibleSkins` themselves already use. */
export interface TraditionSuggestionResolutionInput {
  offerId?: OfferId;
  skin?: Skin;
}

/**
 * Narrows `catalog` (defaults to the real `TRADITION_SUGGESTIONS`) down
 * to the suggestions this memorial's configuration is allowed to be
 * shown — never a ranking, never a "best match", never anything marked
 * as pre-selected (mission brief section 9). A suggestion whose own
 * `compatibleOffers`/`compatibleSkins` is absent is available to every
 * offer/skin on that axis; one that lists specific values is available
 * only when `input` supplies a matching one — an `input` that omits
 * `offerId`/`skin` altogether never matches a suggestion that restricts
 * on that axis, so a caller that genuinely doesn't know the offer/skin
 * yet never over-shows a restricted suggestion.
 */
export function resolveAvailableTraditionSuggestions(
  input: TraditionSuggestionResolutionInput,
  catalog: readonly TraditionSuggestion[] = TRADITION_SUGGESTIONS,
): readonly TraditionSuggestion[] {
  return catalog.filter((suggestion) => {
    if (suggestion.compatibleOffers) {
      if (input.offerId === undefined || !suggestion.compatibleOffers.includes(input.offerId)) return false;
    }
    if (suggestion.compatibleSkins) {
      if (input.skin === undefined || !suggestion.compatibleSkins.includes(input.skin)) return false;
    }
    return true;
  });
}
