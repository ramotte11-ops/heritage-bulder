import type { MemorialContent } from "@/types/memorial";
import type { Media } from "@/types/media";
import {
  EMPTY_HERO_CONTENT,
  HERO_CROP_NEUTRAL_ZOOM,
  type HeroContent,
  type HeroCrop,
  type HeroDate,
  type HeroPhoto,
} from "@/types/hero";

/**
 * Mission 031 — parsing, normalization, validation, chronology and
 * completeness for the Hero (types/hero.ts), plus its integration with
 * the existing draft model (`memorial_drafts.content` — see
 * lib/adapters/draft-repository.ts). Pure, framework-free, no I/O: like
 * lib/memorial/status-transitions.ts and lib/memorial/section-selection.ts,
 * this module never touches Supabase.
 *
 * ## Why `draft.content.hero`, not new columns on `memorials`
 *
 * Audited alongside `memorials` and `memorial_published_snapshots`
 * (mission brief, section 11): the Hero's fields (displayName, dates,
 * shortPhrase, photo, crop) are editorial content the family edits and
 * autosaves progressively, exactly like every other section's content —
 * not structural/lifecycle metadata (`memorial_type`, `editorial_context`,
 * `skin`, `status`, ...), which is what `memorials` actually holds
 * (types/memorial.ts). `memorial_drafts.content` and
 * `memorial_published_snapshots.content` already exist as JSONB for
 * exactly this kind of per-section content (config/sections.ts's `hero`
 * id already reserves the key). No migration, no new table, no new
 * columns.
 *
 * ## `HERO_CROP_NEUTRAL_ZOOM` is re-exported here
 *
 * So a caller who imports this module for its operations (rather than
 * types/hero.ts for its shapes) has it at hand too — see setHeroCrop's
 * callers in a future mission.
 */
export { HERO_CROP_NEUTRAL_ZOOM };

// ---------------------------------------------------------------------
// Small internal helpers
// ---------------------------------------------------------------------

/** A sentinel distinct from every legal parsed value (including `null`,
 * which is itself a legal "absent" value for several Hero fields) —
 * this is what lets a private parser return "absent" and "malformed"
 * as two different outcomes. */
const INVALID = Symbol("hero:invalid");
type Parsed<T> = T | typeof INVALID;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The only normalization this domain performs on family-authored text
 * (mission brief, sections 2 and 5): peripheral whitespace only. Casing,
 * accents and punctuation are exactly what the family chose and are
 * never touched. A blanks-only string normalizes to `null` (absent) —
 * incomplete, never invalid (section 9).
 */
function normalizeOptionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function parseOptionalText(raw: unknown): Parsed<string | null> {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") return INVALID;
  return normalizeOptionalText(raw);
}

// ---------------------------------------------------------------------
// T04 — dates
// ---------------------------------------------------------------------

/**
 * A "valid whole year" bound (mission brief, section 3: "année entière
 * valide"). This is a technical sanity bound, not a UX decision — it
 * exists only to keep `year` a real 4-digit calendar year and to reject
 * `NaN`/`Infinity`/non-integers, never to express a product opinion
 * about how old a Hero date may be.
 */
const MIN_HERO_YEAR = 1000;
const MAX_HERO_YEAR = 9999;

function isValidHeroYear(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_HERO_YEAR &&
    value <= MAX_HERO_YEAR
  );
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * True calendar-date validity, not just a regex (mission brief, section
 * 3): rejects a real but non-leap February 29th (`2025-02-29`) while
 * accepting a real leap day (`2024-02-29`), and rejects any date whose
 * day/month would roll over into a different month (`2026-02-30`).
 * Computed in UTC deliberately, so no host timezone can shift a date
 * across midnight and change the answer.
 */
function isValidCalendarDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;

  const [yearStr, monthStr, dayStr] = value.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  if (year < MIN_HERO_YEAR || year > MAX_HERO_YEAR) return false;
  if (month < 1 || month > 12) return false;

  const asDate = new Date(Date.UTC(year, month - 1, day));
  return (
    asDate.getUTCFullYear() === year &&
    asDate.getUTCMonth() === month - 1 &&
    asDate.getUTCDate() === day
  );
}

/**
 * Parses one `HeroDate`. `undefined`/`null` is the legal "not entered"
 * state (`null`), anything else must be a well-formed
 * `{ precision: "year", year }` or `{ precision: "date", date }` —
 * notably, a bare localized string like `"17 mars 1948"` is never a
 * plain object here and so is rejected, never silently accepted
 * (mission brief, section 3).
 */
function parseHeroDate(raw: unknown): Parsed<HeroDate | null> {
  if (raw === null || raw === undefined) return null;
  if (!isPlainObject(raw)) return INVALID;

  if (raw.precision === "year") {
    // A year is never fabricated into a date — it stays a year
    // (mission brief, section 3).
    return isValidHeroYear(raw.year) ? { precision: "year", year: raw.year } : INVALID;
  }

  if (raw.precision === "date") {
    return typeof raw.date === "string" && isValidCalendarDate(raw.date)
      ? { precision: "date", date: raw.date }
      : INVALID;
  }

  return INVALID;
}

/** The earliest/latest real calendar date a `HeroDate` could denote —
 * a single point for `precision: "date"`, the whole year for
 * `precision: "year"`. Comparable lexicographically because both ends
 * are always `YYYY-MM-DD` with a 4-digit year (`MIN_HERO_YEAR` keeps
 * that true). */
function heroDateRange(date: HeroDate): { min: string; max: string } {
  if (date.precision === "date") {
    return { min: date.date, max: date.date };
  }
  const year = String(date.year).padStart(4, "0");
  return { min: `${year}-01-01`, max: `${year}-12-31` };
}

/**
 * Mission brief, section 4: never use the dates to drive
 * `editorial_context`/announcement-vs-remembrance wording — this
 * function's only job is the one conservative chronology check the
 * brief actually asks for. A combination is rejected ONLY when it is
 * CERTAIN birth comes after death, i.e. even the earliest date `birth`
 * could denote is already later than the latest date `death` could
 * denote. A merely ambiguous combination (e.g. birth = year 1950,
 * death = 1950-02-03 — ranges overlap, so which came first within 1950
 * is genuinely unknown) is never rejected.
 */
function isChronologyCertainlyImpossible(
  birth: HeroDate | null,
  death: HeroDate | null,
): boolean {
  if (birth === null || death === null) return false;
  const birthRange = heroDateRange(birth);
  const deathRange = heroDateRange(death);
  return birthRange.min > deathRange.max;
}

// ---------------------------------------------------------------------
// T07 — crop, T06/T08 — photo reference
// ---------------------------------------------------------------------

function isUnitInterval(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isValidZoom(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Parses one `HeroCrop`. `undefined`/`null` is the legal "no crop yet"
 * state (mission brief, section 8: T06 precedes T07). `focalX`/`focalY`
 * must be finite and within `[0, 1]`; `zoom` must be finite and
 * strictly positive (`NaN`/`Infinity`/`0`/negative are all refused —
 * mission brief, section 7).
 */
function parseHeroCrop(raw: unknown): Parsed<HeroCrop | null> {
  if (raw === null || raw === undefined) return null;
  if (!isPlainObject(raw)) return INVALID;

  const { focalX, focalY, zoom } = raw;
  if (!isUnitInterval(focalX) || !isUnitInterval(focalY) || !isValidZoom(zoom)) {
    return INVALID;
  }

  return { focalX, focalY, zoom };
}

/**
 * Parses one `HeroPhoto`. `undefined`/`null` is the legal "no photo
 * selected yet" state. `mediaId` must be a non-blank string referencing
 * a Mission 030 media by its internal id — never a URL/path (mission
 * brief, section 6); its `crop`, if present, is parsed with the same
 * rules as `parseHeroCrop`, and stays nested inside this object so a
 * crop can never be attributed to the wrong `mediaId` (section 8).
 */
function parseHeroPhoto(raw: unknown): Parsed<HeroPhoto | null> {
  if (raw === null || raw === undefined) return null;
  if (!isPlainObject(raw)) return INVALID;

  const mediaId = raw.mediaId;
  if (typeof mediaId !== "string" || mediaId.trim() === "") return INVALID;

  const crop = parseHeroCrop(raw.crop);
  if (crop === INVALID) return INVALID;

  return { mediaId, crop };
}

// ---------------------------------------------------------------------
// Whole-Hero parsing / validation
// ---------------------------------------------------------------------

/** Which part of a `HeroContent` candidate failed. Not a user-facing
 * message — T08's wording is a later mission's job (mission brief,
 * section 19); this is only precise enough for a caller (and a test) to
 * tell failures apart. */
export type HeroValidationReason =
  | "not_an_object"
  | "displayName"
  | "birth"
  | "death"
  | "chronology"
  | "shortPhrase"
  | "photo";

export type HeroValidationResult =
  | { ok: true; hero: HeroContent }
  | { ok: false; reason: HeroValidationReason };

/**
 * The one place that turns an untrusted value (raw JSON out of
 * `memorial_drafts.content.hero`, or a `HeroContent` a caller built by
 * hand) into either a known-good `HeroContent` or a specific rejection.
 * Never casts — every field is individually checked, so a malformed
 * shape can never slip through as if it had been validated (mission
 * brief, section 12).
 *
 * `undefined`/`null` (an old draft with no `hero` key at all, or a
 * brand-new one) is the one input that is NOT an error: it parses to
 * `EMPTY_HERO_CONTENT`, an incomplete-but-valid Hero (section 9). Any
 * other non-object input (a stray string, a number, an array) is
 * rejected as `"not_an_object"` rather than treated as absent — those
 * only arise from real corruption, not from a normal missing key.
 */
export function parseHeroContent(raw: unknown): HeroValidationResult {
  if (raw === null || raw === undefined) {
    return { ok: true, hero: { ...EMPTY_HERO_CONTENT } };
  }
  if (!isPlainObject(raw)) {
    return { ok: false, reason: "not_an_object" };
  }

  const displayName = parseOptionalText(raw.displayName);
  if (displayName === INVALID) return { ok: false, reason: "displayName" };

  const birth = parseHeroDate(raw.birth);
  if (birth === INVALID) return { ok: false, reason: "birth" };

  const death = parseHeroDate(raw.death);
  if (death === INVALID) return { ok: false, reason: "death" };

  if (isChronologyCertainlyImpossible(birth, death)) {
    return { ok: false, reason: "chronology" };
  }

  const shortPhrase = parseOptionalText(raw.shortPhrase);
  if (shortPhrase === INVALID) return { ok: false, reason: "shortPhrase" };

  const photo = parseHeroPhoto(raw.photo);
  if (photo === INVALID) return { ok: false, reason: "photo" };

  return { ok: true, hero: { displayName, birth, death, shortPhrase, photo } };
}

/**
 * Validates a `HeroContent` a caller already built (e.g. via the
 * `setHero*` helpers below) before it is written back to the draft.
 * Reuses `parseHeroContent` rather than duplicating its rules — a typed
 * `HeroContent` is exactly the same shape a well-formed raw value must
 * have, so one validator serves both (a `HeroDate`'s `date` field being
 * typed `string` does not by itself guarantee it is a real calendar
 * date, so this re-checks it, not just the object's TypeScript shape).
 */
export function validateHero(hero: HeroContent): HeroValidationResult {
  return parseHeroContent(hero);
}

// ---------------------------------------------------------------------
// Draft integration (mission brief, section 13)
// ---------------------------------------------------------------------

/**
 * The three ways a draft's `content.hero` can actually be found, kept
 * distinct on purpose:
 *
 *   - `"absent"`     no `hero` key at all — a brand-new or pre-Hero
 *                    draft. Perfectly normal; safe to start fresh from.
 *   - `"valid"`      parsed successfully.
 *   - `"corrupted"`  a `hero` key exists but is NOT a well-formed
 *                    `HeroContent` — this is real, existing data that
 *                    failed validation, not an empty field. `raw` is
 *                    the untouched original value, specifically so a
 *                    write path can decide what to do with it (surface
 *                    it, log it, refuse to save over it) instead of it
 *                    silently vanishing.
 *
 * This is the primitive a future write/autosave path MUST branch on —
 * see `readHero`'s docstring for why that function is NOT it.
 */
export type HeroReadResult =
  | { status: "absent"; hero: HeroContent }
  | { status: "valid"; hero: HeroContent }
  | { status: "corrupted"; raw: unknown };

/**
 * Inspects `content.hero` without collapsing "absent" and "corrupted"
 * into the same outcome (mission brief, section 12's "ne jamais caster
 * aveuglément", read literally: a malformed value is a distinct fact,
 * not a synonym for missing). This is what stands between a real data
 * corruption and a future autosave silently overwriting it: a write
 * path that calls this before saving can refuse to persist a fresh
 * `EMPTY_HERO_CONTENT`-derived value over a `"corrupted"` one, instead
 * of doing `readHero()` (which already defaulted it away) followed by
 * an unconditional `updateHero()`.
 */
export function inspectHero(content: MemorialContent): HeroReadResult {
  const raw = content.hero;
  if (raw === null || raw === undefined) {
    return { status: "absent", hero: { ...EMPTY_HERO_CONTENT } };
  }

  const result = parseHeroContent(raw);
  return result.ok ? { status: "valid", hero: result.hero } : { status: "corrupted", raw };
}

/**
 * Reads the Hero out of a draft's content, fail-safe (mission brief,
 * section 12): a missing `hero` key reads as an incomplete-but-valid
 * empty Hero, and a malformed one reads the SAME way rather than
 * throwing or propagating a bad cast — a corrupt Hero must never take
 * down the rest of the draft when the caller only wants something to
 * DISPLAY or edit from.
 *
 * This is a display/edit-seed convenience, built on `inspectHero`
 * above (which is where "absent" and "corrupted" are still told
 * apart). It is deliberately the WRONG function to call right before a
 * write: `readHero` then `updateHero` would silently replace a
 * `"corrupted"` stored value with a fresh empty one and no record that
 * anything was ever wrong. A future autosave/save path must use
 * `inspectHero` instead, and decide explicitly what a `"corrupted"`
 * status means for that write (e.g. refuse to save until resolved, or
 * log it) rather than reaching for this function.
 */
export function readHero(content: MemorialContent): HeroContent {
  const result = inspectHero(content);
  return result.status === "corrupted" ? { ...EMPTY_HERO_CONTENT } : result.hero;
}

/**
 * Writes a Hero back into a draft's content, preserving every other
 * section's content untouched (a plain shallow merge — `content.hero`
 * is the only key this ever touches). Whole-content, last-write-wins,
 * same as `DraftRepository.saveDraftContent` (lib/adapters/draft-repository.ts)
 * this is meant to feed: this function does not itself validate `hero`
 * — call `validateHero` first, the same way a Server Action validates
 * form input before persisting it.
 */
export function updateHero(content: MemorialContent, hero: HeroContent): MemorialContent {
  return { ...content, hero };
}

// ---------------------------------------------------------------------
// Pure field-update helpers (for the future T03-T07 screens to call —
// mission 031 builds none of those screens itself, only the operations
// they will need).
// ---------------------------------------------------------------------

export type HeroUpdateResult =
  | { ok: true; hero: HeroContent }
  | { ok: false; reason: HeroValidationReason };

/** T03 — sets `displayName`. A blanks-only value normalizes to `null`
 * (incomplete), never rejected. */
export function setHeroDisplayName(hero: HeroContent, value: string | null): HeroContent {
  return { ...hero, displayName: value === null ? null : normalizeOptionalText(value) };
}

/** T05 — sets `shortPhrase`. A blanks-only value normalizes to `null`
 * (incomplete), never rejected. No generation, no translation — exactly
 * the text passed in (mission brief, section 5). */
export function setHeroShortPhrase(hero: HeroContent, value: string | null): HeroContent {
  return { ...hero, shortPhrase: value === null ? null : normalizeOptionalText(value) };
}

/** T04 — sets `birth`, re-checking chronology against the current
 * `death` so an update can never silently produce a certainly-impossible
 * pair. */
export function setHeroBirth(hero: HeroContent, birth: HeroDate | null): HeroUpdateResult {
  const parsed = parseHeroDate(birth);
  if (parsed === INVALID) return { ok: false, reason: "birth" };
  if (isChronologyCertainlyImpossible(parsed, hero.death)) {
    return { ok: false, reason: "chronology" };
  }
  return { ok: true, hero: { ...hero, birth: parsed } };
}

/** T04 — sets `death`, re-checking chronology against the current
 * `birth` so an update can never silently produce a certainly-impossible
 * pair. */
export function setHeroDeath(hero: HeroContent, death: HeroDate | null): HeroUpdateResult {
  const parsed = parseHeroDate(death);
  if (parsed === INVALID) return { ok: false, reason: "death" };
  if (isChronologyCertainlyImpossible(hero.birth, parsed)) {
    return { ok: false, reason: "chronology" };
  }
  return { ok: true, hero: { ...hero, death: parsed } };
}

/**
 * T06 — sets which media the Hero photo references.
 *
 * This is the one function that gets to enforce mission brief section
 * 8's guarantee: setting a DIFFERENT `mediaId` than the one currently
 * referenced always starts that photo with `crop: null` — the previous
 * photo's crop can never silently survive onto a new one. Re-setting
 * the SAME `mediaId` (e.g. an idempotent autosave retry) is a no-op
 * that keeps whatever crop already existed. `mediaId: null` clears the
 * photo entirely (and, being nested inside it, its crop with it).
 */
export function setHeroPhotoMedia(hero: HeroContent, mediaId: string | null): HeroUpdateResult {
  if (mediaId === null) {
    return { ok: true, hero: { ...hero, photo: null } };
  }

  const trimmed = mediaId.trim();
  if (trimmed === "") return { ok: false, reason: "photo" };

  const isSameMedia = hero.photo !== null && hero.photo.mediaId === trimmed;
  return {
    ok: true,
    hero: {
      ...hero,
      photo: isSameMedia ? hero.photo : { mediaId: trimmed, crop: null },
    },
  };
}

/**
 * T07 — sets the crop for the CURRENTLY referenced photo. A crop can
 * never exist without a photo (mission brief, section 8): with no photo
 * selected, this is a documented no-op rather than an error, since
 * "crop this photo" is a structurally meaningless instruction at that
 * point, not invalid input.
 */
export function setHeroCrop(hero: HeroContent, crop: HeroCrop | null): HeroUpdateResult {
  if (hero.photo === null) {
    return { ok: true, hero };
  }

  const parsed = parseHeroCrop(crop);
  if (parsed === INVALID) return { ok: false, reason: "photo" };

  return { ok: true, hero: { ...hero, photo: { ...hero.photo, crop: parsed } } };
}

// ---------------------------------------------------------------------
// Completeness (mission brief, section 10)
// ---------------------------------------------------------------------

/**
 * Structural completeness alone: a `displayName`, a referenced photo,
 * and a crop for that exact photo. Dates and `shortPhrase` are never
 * required — a family with no known dates can still have a complete
 * Hero (mission brief, section 10).
 *
 * Deliberately does NOT check whether the referenced media is actually
 * `ready`/owned — that is an external fact this pure function cannot
 * know (mission brief, section 18). Re-validates the crop's own bounds
 * defensively (rather than trusting the caller only ever produced
 * `HeroContent` through `setHeroCrop`/`parseHeroContent`), so this
 * function is self-contained no matter how the `HeroContent` was built.
 * See `isHeroComplete` below for the fuller check that also consults
 * the media.
 */
export function isHeroContentComplete(hero: HeroContent): boolean {
  if (hero.displayName === null) return false;
  if (hero.photo === null) return false;
  if (hero.photo.crop === null) return false;
  return parseHeroCrop(hero.photo.crop) !== INVALID;
}

/**
 * The external half of photo completeness (mission brief, section 18):
 * is the media this Hero references actually the one it claims to be —
 * belongs to this exact `mediaId`, is a `"hero"`-purpose media, and has
 * been verified `"ready"` (never a `"pending"` upload, whose bytes may
 * not even exist yet — see lib/media/read-media.ts). Still pure: the
 * caller is responsible for actually fetching `media` (a
 * `MediaRepository` read, e.g. lib/adapters/media-repository.ts), this
 * function only judges the fact once handed to it — nothing here
 * depends on Supabase.
 */
export function isHeroPhotoMediaUsable(hero: HeroContent, media: Media | null): boolean {
  if (hero.photo === null || media === null) return false;
  return media.id === hero.photo.mediaId && media.purpose === "hero" && media.status === "ready";
}

/**
 * The full Hero completeness the mission brief asks for (section 10):
 * structurally complete AND its photo is a verified, usable `"hero"`
 * media. `media` should be the result of looking up `hero.photo.mediaId`
 * (`null` when there is no photo, or the lookup found nothing) —
 * nothing here performs that lookup itself. Mission 031 does not wire
 * this into publication (that is a later mission's job, per section 10)
 * — it only makes the rule available in one tested place.
 */
export function isHeroComplete(hero: HeroContent, media: Media | null): boolean {
  return isHeroContentComplete(hero) && isHeroPhotoMediaUsable(hero, media);
}
