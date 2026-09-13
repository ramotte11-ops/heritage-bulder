/**
 * Mission 038 — the canonical Death Notice (Avis de décès) content model.
 *
 * This is the content behind the `announcement` editorial context's own
 * branch of UX-A (lib/builder/guided-flow/human-steps.ts):
 *
 *   - A01 "L'Annonce : quelques mots"  — obligatoire, non passable
 *   - A02 "Précisions de l'avis"       — facultatif, passable
 *   - A03 "Aperçu de l'avis de décès"  — obligatoire (a preview screen;
 *     it renders this content plus the Hero's own, it stores nothing of
 *     its own — see this file's "no Hero duplication" note below)
 *
 * This file only defines the SHAPE, exactly like types/hero.ts does for
 * the Hero. Parsing, normalization, validation and the draft-integration
 * helpers (inspect/read/write) live in lib/memorial/death-notice.ts. No
 * UI, no A01/A02/A03 screens, no A03 preview rendering, and no wording
 * are built here — that is Mission 039's job (mission brief, section 3).
 *
 * ## Why two fields, not one
 *
 * The mission brief (section 4) is explicit: the short announcement text
 * (A01) and the facultative precisions (A02) are two distinct kinds of
 * family content, never merged into one big generic field. Nesting the
 * five precision fields inside their own `precisions` object — rather
 * than flattening them onto `DeathNoticeContent` next to
 * `announcementText` — makes that separation a structural fact, the same
 * reasoning types/hero.ts uses for nesting `crop` inside `HeroPhoto`
 * rather than leaving it a sibling field of `HeroContent`.
 *
 * ## Family content, exactly as entered (mission brief, section 6)
 *
 * Every string field here is the family's own text, verbatim. Nothing in
 * this model ever translates it, invents it on the family's behalf, or
 * silently replaces it. A future neutral HERITAGE-authored starting point
 * for A01 is not part of this persisted shape at all until the family has
 * actually confirmed it into `announcementText` — at that point it is
 * simply the family's text like any other, indistinguishable in storage
 * from something they typed from scratch.
 *
 * ## No language field (mission brief, section 12)
 *
 * `announcementText` and every precision are stored exactly as typed, in
 * whichever language the family used — there is no `text_fr`/`text_en`/
 * `text_es` here or anywhere in this model. Mission 039's screens choose
 * which language to prompt in; this model does not encode one.
 *
 * ## No Hero duplication (mission brief, section 13)
 *
 * Deliberately absent from this type: `displayedName`, `birth`, `death`,
 * any Hero photo/crop reference, `shortPhrase`. Those already have their
 * one canonical source — types/hero.ts / lib/memorial/hero.ts. A03's
 * future preview composes them from there; this model is not a second
 * place they could drift out of sync with.
 *
 * ## No ceremony data (mission brief, section 14)
 *
 * Deliberately absent from this type: any ceremony date, venue, or
 * detail. That data belongs to a later A04-A08 / Mission 040-041 model.
 * `generalLocation` below is NOT that: it is A02's own vague, optional
 * mention ("dans la région de...", "en Bretagne...") — the same kind of
 * loose text a family might put in a short announcement, never a
 * ceremony's actual date/time/address.
 *
 * ## No cause of death (mission brief, section 5)
 *
 * No field of any kind captures a cause of death. This is a deliberate
 * omission, not an oversight — the mission brief forbids it outright for
 * the normal flow.
 *
 * ## No Auth/Owner dependency (mission brief, section 11)
 *
 * No field here names or references a user, an owner, or a session. This
 * content belongs to a draft the same way `HeroContent` does — entirely
 * independently of whatever mechanism eventually attaches that draft to
 * an authenticated owner (today, redemption up front; potentially, in a
 * future mission, a guest draft claimed later). Nothing in this shape
 * would need to change either way.
 */

/**
 * A02's facultative precisions. Every field is independently nullable —
 * `null` means "not entered", never "invalid" (mirrors HeroContent's own
 * fields, types/hero.ts). All five may be absent at once; A02 itself is
 * a passable step (human-steps.ts).
 *
 * The exact five the mission brief's UX map calls for (section 5) — no
 * more invented without a demonstrated need (section 5's own rule):
 *
 *   - `generalLocation` — "lieu général": a loose, optional mention
 *     (a city, a region, "dans l'intimité familiale"...), never a full
 *     street address and never a ceremony venue (see this file's
 *     "no ceremony data" note above).
 *   - `familyMessage`   — "mot de la famille".
 *   - `thought`         — "pensée".
 *   - `quote`           — "citation".
 *   - `other`           — "autre précision appropriée": the one
 *     deliberately open slot for whatever doesn't fit the four named
 *     ones above, still never a second general-purpose field replacing
 *     them (mission brief, section 4's "pas de gros champ générique" —
 *     this is one specific, named overflow, not a catch-all).
 *
 * Its own `[key: string]: unknown` index signature is the identical
 * TypeScript-only necessity documented on `DeathNoticeContent` below —
 * NOT a runtime license for a sixth property. `lib/memorial/death-notice.ts`'s
 * `parsePrecisions` is the actual, strict boundary: any key besides these
 * five, whatever value it holds, makes the enclosing `DeathNoticeContent`
 * `"corrupted"` as a whole (never silently dropped, never silently
 * accepted as canonical).
 */
export interface DeathNoticePrecisions {
  [key: string]: unknown;
  generalLocation: string | null;
  familyMessage: string | null;
  thought: string | null;
  quote: string | null;
  other: string | null;
}

/** `DeathNoticePrecisions` with every field absent — A02 fully skipped,
 * or not yet visited. */
export const EMPTY_DEATH_NOTICE_PRECISIONS: DeathNoticePrecisions = {
  generalLocation: null,
  familyMessage: null,
  thought: null,
  quote: null,
  other: null,
};

/**
 * The Death Notice content stored at `draft.content.deathNotice`
 * (config/sections.ts already reserves that `SectionId` — see
 * lib/memorial/death-notice.ts for why no new table or column is
 * introduced for it).
 *
 * `announcementText` is never null-vs-absent-vs-invalid ambiguous beyond
 * what `HeroContent`'s own text fields already resolve the same way:
 * `null` = not entered yet, or normalized away from a blanks-only value.
 * A01 is obligatoire/non-passable in the guided flow (human-steps.ts),
 * but this model itself makes no such judgement — see this file's own
 * "modèle structurellement valide" note in lib/memorial/death-notice.ts.
 *
 * `precisions` is always a fully-shaped `DeathNoticePrecisions` object —
 * never itself `null` — exactly so "no precision filled in yet" and "A02
 * doesn't exist as a concept for this draft" are the same, unambiguous
 * state (`EMPTY_DEATH_NOTICE_PRECISIONS`), never a third nullable outer
 * layer to account for.
 *
 * ## The index signature is a TypeScript-only necessity — NOT a runtime
 * permission (QG closure)
 *
 * The index signature (`[key: string]: unknown`) exists SOLELY so this
 * type is structurally assignable into `MemorialSectionContent`
 * (`Record<string, unknown>`, types/memorial.ts) — the same pattern
 * `HeroContent` (types/hero.ts) already uses for the identical reason.
 * Proven necessary, not merely assumed: removing it makes
 * `lib/memorial/death-notice.ts`'s `writeDeathNotice` fail to compile
 * with exactly `Index signature for type 'string' is missing in type
 * 'DeathNoticeContent'`.
 *
 * This is a compile-time fact about TYPE COMPATIBILITY only. It grants NO
 * runtime license for an arbitrary property to exist on a real
 * `DeathNoticeContent` value. The actual, strict boundary — which keys a
 * `content.deathNotice` may ever legally carry — is enforced entirely at
 * RUNTIME, by `lib/memorial/death-notice.ts`'s `parseDeathNoticeContent`
 * (top-level: only `announcementText`/`precisions`) and `parsePrecisions`
 * (only its own five named fields): any other key, however the type
 * system might tolerate it structurally, makes the whole value
 * `"corrupted"`, never a silently-accepted or silently-dropped extra. The
 * type's openness and the parser's strictness are two different layers on
 * purpose — the type only has to satisfy the compiler; the parser is what
 * actually decides what is canonical.
 */
export interface DeathNoticeContent {
  [key: string]: unknown;
  announcementText: string | null;
  precisions: DeathNoticePrecisions;
}

/** The Death Notice of a brand-new draft, or what a missing/malformed
 * `content.deathNotice` fails safe to (lib/memorial/death-notice.ts's
 * `readDeathNotice`). */
export const EMPTY_DEATH_NOTICE_CONTENT: DeathNoticeContent = {
  announcementText: null,
  precisions: { ...EMPTY_DEATH_NOTICE_PRECISIONS },
};
