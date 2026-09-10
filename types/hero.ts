/**
 * Mission 031 — the canonical Hero data model.
 *
 * The Hero is the one piece of content every memorial has (Mission 000:
 * `hero` is `core: true` in both editorial contexts — config/sections.ts).
 * This file only defines its SHAPE. Parsing, normalization, validation,
 * chronology and completeness rules live in lib/memorial/hero.ts;
 * persistence into `draft.content.hero` is also handled there. No UI,
 * no rendering, no wording is built here (see the mission brief,
 * sections 19-20).
 *
 * ## Why this is structurally common to announcement/remembrance (and,
 * later, Pet)
 *
 * `editorial_context` never appears in this file. A `HeroContent` is the
 * same shape whichever context the memorial is in (mission brief,
 * section 16) — context can influence wording and suggestions later,
 * never the stored structure. The same reasoning is why the field is
 * `displayName` rather than `firstName`/`lastName` (section 2) and
 * `heroPhoto`-style neutral naming rather than anything human-specific
 * (section 17): Pet Memorial (V1.5) will reuse this exact shape without
 * a single `if memorialType === "pet"` anywhere in it. No Pet screen,
 * species, wording or migration is added by this mission — only the
 * avoidance of names that would have to be revisited later.
 */

/**
 * One Hero date (birth or death), independent of any locale.
 *
 * V1 supports exactly two precisions (mission brief, section 3):
 *
 *   - `"year"`  a bare year, e.g. the family only knows/wants "1948".
 *   - `"date"`  a full calendar date, canonical `YYYY-MM-DD`.
 *
 * A year is never upgraded into a fabricated `YYYY-01-01` date, and a
 * full date is never downgraded to a year — each precision is what the
 * family actually knows, preserved as such. Rendering a localized
 * string ("17 mars 1948", "March 17, 1948") is entirely the renderer's
 * job (i18n, a later mission); nothing localized is ever stored here.
 */
export type HeroDate =
  | { precision: "year"; year: number }
  | { precision: "date"; date: string };

/**
 * A crop as an INTENTION, not a rectangle of pixels (mission brief,
 * section 7). Independent of viewport, device and original resolution,
 * so the same value drives a phone, a desktop, and any future skin
 * layout without ever being re-derived.
 *
 * `focalX`/`focalY` — normalized position of the subject within the
 * source photo, `0` = left/top edge, `1` = right/bottom edge.
 *
 * `zoom` — a multiplier on top of the focal point. `1` is the neutral
 * state (no zoom applied, the documented "compatible avec un état
 * neutre" value the mission brief asks for) — NOT a maximum; Mission
 * 034 is free to define its own UX ceiling later without this type
 * changing.
 *
 * The original photo itself is never modified (section 7) — a crop is
 * only ever an instruction for how to display it.
 */
export interface HeroCrop {
  focalX: number;
  focalY: number;
  zoom: number;
}

/** `HeroCrop`'s documented neutral state — see the `zoom` field above. */
export const HERO_CROP_NEUTRAL_ZOOM = 1;

/**
 * The Hero's photo reference plus the crop that belongs to it.
 *
 * Deliberately NOT `{ mediaId, crop }` as two independent optional
 * fields of `HeroContent` — nesting `crop` inside the same object as
 * `mediaId` is what makes "this crop belongs to this photo" a
 * structural fact rather than a convention two call sites have to
 * remember (mission brief, section 8). Replacing the photo means
 * constructing a whole new `HeroPhoto`, which is exactly what
 * `setHeroPhoto` (lib/memorial/hero.ts) does — it can never leave a
 * stale crop from the previous `mediaId` attached by accident.
 *
 * `mediaId` references a Mission 030 `media` row (types/media.ts) by
 * its internal id — never a Supabase URL, a signed URL, a
 * `storage_path`, or a client-provided filename (section 6). Whether
 * that media is actually `ready` and owned by this memorial is NOT
 * this type's concern: that is an external, asynchronous fact this
 * pure model deliberately does not encode (section 18) — see
 * `isHeroPhotoMediaUsable` in lib/memorial/hero.ts for the explicit
 * seam where a caller supplies that fact.
 *
 * `crop: null` is the normal, valid intermediate state between T06
 * (photo chosen) and T07 (crop confirmed) — a photo can exist with no
 * crop yet; a crop can never exist without a photo (mission brief,
 * section 8).
 */
export interface HeroPhoto {
  mediaId: string;
  crop: HeroCrop | null;
}

/**
 * The Hero content stored at `draft.content.hero` (mission brief,
 * section 11 — see lib/memorial/hero.ts for why that location was
 * chosen over adding columns to `memorials`).
 *
 * Every field is nullable: the Builder is progressive and autosaved
 * (section 9), so an incomplete Hero is a normal, structurally valid
 * state, never a malformed one. `isHeroContentComplete`
 * (lib/memorial/hero.ts) is the one place that decides whether a given
 * `HeroContent` is complete enough to be a finished Hero — this type
 * itself makes no such judgement.
 *
 * The index signature (`[key: string]: unknown`) is what makes this
 * type structurally assignable into `MemorialSectionContent`
 * (`Record<string, unknown>`, types/memorial.ts) — the same pattern
 * `DemoSectionContent` (lib/builder/demo-content.ts) already uses to
 * fit into `MemorialContent` without introducing a second, competing
 * content model.
 *
 * Deliberately NOT split into `AnnouncementHeroData`/
 * `RemembranceHeroData` (section 16) and deliberately NOT named with
 * anything human-specific like `deceasedFirstName` (section 17).
 */
export interface HeroContent {
  [key: string]: unknown;
  /** The exact name the family wants displayed. `null` = not entered
   * yet, or normalized away from a blanks-only value. Never split into
   * first/last/nickname — see this file's top comment. */
  displayName: string | null;
  /** `null` = not entered, or intentionally left out (a family may
   * choose to show no birth date at all — section 3). */
  birth: HeroDate | null;
  /** `null` = not entered, or intentionally left out. */
  death: HeroDate | null;
  /** A short line under the name. `null` = not entered, or normalized
   * away from a blanks-only value. Exactly the family's own text —
   * never generated, translated, or length-capped by this domain
   * (mission brief, section 5). */
  shortPhrase: string | null;
  /** `null` = no photo selected yet. See `HeroPhoto` for the
   * photo+crop pairing rule. */
  photo: HeroPhoto | null;
}

/** The Hero of a brand-new draft, or what a missing/malformed
 * `content.hero` fails safe to (lib/memorial/hero.ts's `readHero`). */
export const EMPTY_HERO_CONTENT: HeroContent = {
  displayName: null,
  birth: null,
  death: null,
  shortPhrase: null,
  photo: null,
};
