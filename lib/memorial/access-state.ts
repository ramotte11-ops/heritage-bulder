import type { AccessLevel } from "@/config/access-levels";
import type { Language } from "@/config/languages";

/**
 * HERITAGE Direct M1-A — which state of the free / complete contract
 * (V2.1 §3.2) a memorial is in, read from its server-written deadlines.
 *
 * Pure, framework-free, no I/O, no clock of its own: `now` is always a
 * parameter. This module DISPLAYS a state; it never decides one. Every
 * decision that matters (publishing, uploading, upgrading) is taken in
 * the database, at the database's clock, under the memorial's lock —
 * never from this result, and never from the browser's clock (R2).
 *
 * B14: deadlines are real durations from their event. Since QG 008 (V8):
 * 10 days = 240 h to publish for free, 45 days = 1080 h of preparation,
 * 45 days = 1080 h of public visibility, 7 days = 168 h of recovery after
 * each expiry. Nothing here rounds them to the end of a day. They are
 * shown in Paris time, so across a DST change the displayed hour moves by
 * one while the duration stays exact.
 *
 * QG 008: these states DESCRIBE deadlines; none of them carries a rule of
 * display or modification. Corrections after publication (L06) and what a
 * recovery period allows are not decided.
 *
 * States (E0 to E8, EC):
 * - E0 — free draft, no durable anchor yet;
 * - E1 — anchored, never published, free publication still possible;
 * - E2 — free publication window over, preparation still running;
 * - E3 — preparation over, recovery period running (7 days);
 * - E8 — preparation recovery period over;
 * - E4 — published, inside an optional correction window (none is set
 *        while L06 is open, so a publication goes straight to E5);
 * - E5 — published and publicly visible;
 * - E6 — public visibility over, recovery period running (7 days);
 * - E7 — publication recovery period over;
 * - EC — complete level (every Etsy memorial, every upgraded one).
 *
 * `inconsistent` is returned, never guessed around, when the deadlines a
 * free memorial carries do not describe any state — the schema's
 * coherence constraints make that unreachable, and a caller must treat it
 * as "show nothing actionable".
 */

export type MemorialAccessStateId =
  | "E0"
  | "E1"
  | "E2"
  | "E3"
  | "E4"
  | "E5"
  | "E6"
  | "E7"
  | "EC";

/** The access columns of a memorial, as the server wrote them. */
export interface MemorialAccessDeadlines {
  accessLevel: AccessLevel;
  freeAnchorAt: string | null;
  freePublishUntil: string | null;
  freeDraftUntil: string | null;
  /** QG 008 — `memorials.free_draft_recovery_until` (free_draft_until + 7 d). */
  freeDraftRecoveryUntil: string | null;
  firstPublishedAt: string | null;
  freeCorrectionsUntil: string | null;
  freePublicUntil: string | null;
  freePrivateUntil: string | null;
}

export type MemorialAccessState =
  | { state: "EC" }
  | { state: "E0" }
  /** `until` is the instant this state ends — the next deadline to show. */
  | { state: "E1" | "E2" | "E3" | "E4" | "E5" | "E6"; until: string }
  | { state: "E7" | "E8"; since: string }
  | { state: "inconsistent" };

function instant(iso: string | null): number | null {
  if (iso === null) return null;
  const time = new Date(iso).getTime();
  return Number.isNaN(time) ? null : time;
}

export function resolveMemorialAccessState(
  deadlines: MemorialAccessDeadlines,
  now: Date,
): MemorialAccessState {
  if (deadlines.accessLevel === "complet") return { state: "EC" };

  const t = now.getTime();

  const {
    freeAnchorAt,
    freePublishUntil,
    freeDraftUntil,
    freeDraftRecoveryUntil,
    firstPublishedAt,
    freeCorrectionsUntil,
    freePublicUntil,
    freePrivateUntil,
  } = deadlines;

  if (firstPublishedAt !== null) {
    if (instant(firstPublishedAt) === null || freePublicUntil === null || freePrivateUntil === null) {
      return { state: "inconsistent" };
    }
    const correctionsUntil = freeCorrectionsUntil === null ? null : instant(freeCorrectionsUntil);
    const publicUntil = instant(freePublicUntil);
    const privateUntil = instant(freePrivateUntil);
    if (
      (freeCorrectionsUntil !== null && correctionsUntil === null) ||
      publicUntil === null ||
      privateUntil === null
    ) {
      return { state: "inconsistent" };
    }
    if (correctionsUntil !== null && freeCorrectionsUntil !== null && t < correctionsUntil) {
      return { state: "E4", until: freeCorrectionsUntil };
    }
    if (t < publicUntil) return { state: "E5", until: freePublicUntil };
    if (t < privateUntil) return { state: "E6", until: freePrivateUntil };
    return { state: "E7", since: freePrivateUntil };
  }

  if (freeAnchorAt === null) {
    return freePublishUntil === null && freeDraftUntil === null && freeDraftRecoveryUntil === null
      ? { state: "E0" }
      : { state: "inconsistent" };
  }

  if (
    instant(freeAnchorAt) === null ||
    freePublishUntil === null ||
    freeDraftUntil === null ||
    freeDraftRecoveryUntil === null
  ) {
    return { state: "inconsistent" };
  }
  const publishUntil = instant(freePublishUntil);
  const draftUntil = instant(freeDraftUntil);
  const recoveryUntil = instant(freeDraftRecoveryUntil);
  if (publishUntil === null || draftUntil === null || recoveryUntil === null) return { state: "inconsistent" };
  if (t < publishUntil) return { state: "E1", until: freePublishUntil };
  if (t < draftUntil) return { state: "E2", until: freeDraftUntil };
  if (t < recoveryUntil) return { state: "E3", until: freeDraftRecoveryUntil };
  return { state: "E8", since: freeDraftRecoveryUntil };
}

const INTL_LOCALE_BY_LANGUAGE: Record<Language, string> = {
  fr: "fr-FR",
  en: "en-GB",
  es: "es-ES",
};

const DEADLINE_FORMAT_BY_LANGUAGE: Record<Language, Intl.DateTimeFormat> = {
  fr: deadlineFormat("fr"),
  en: deadlineFormat("en"),
  es: deadlineFormat("es"),
};

function deadlineFormat(language: Language): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(INTL_LOCALE_BY_LANGUAGE[language], {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  });
}

/**
 * A deadline as the family reads it: date AND time, in Paris time, at the
 * exact instant the server computed (B14 — never 23 h 59). `null` for a
 * value that is not a valid instant, so nothing invented is ever shown.
 */
export function formatAccessDeadline(iso: string, language: Language): string | null {
  const time = instant(iso);
  return time === null ? null : DEADLINE_FORMAT_BY_LANGUAGE[language].format(time);
}
