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
 * B14: deadlines are real durations from their event (7 days = 168 h,
 * 45 days = 1080 h, 30 days = 720 h). Nothing here rounds them to the
 * end of a day. They are shown in Paris time, so across a DST change the
 * displayed hour moves by one while the duration stays exact.
 *
 * States (E0 to E7, EC):
 * - E0 — free draft, e-mail not yet confirmed (no anchor);
 * - E1 — anchored, never published, free publication still possible;
 * - E2 — free publication window over, draft kept;
 * - E3 — draft retention over (read-only until removal);
 * - E4 — published, corrections open;
 * - E5 — published, frozen (ceremony fields only);
 * - E6 — public page closed, private conservation;
 * - E7 — end of conservation;
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
  firstPublishedAt: string | null;
  freeCorrectionsUntil: string | null;
  freePublicUntil: string | null;
  freePrivateUntil: string | null;
}

export type MemorialAccessState =
  | { state: "EC" }
  | { state: "E0" }
  /** `until` is the instant this state ends — the next deadline to show. */
  | { state: "E1" | "E2" | "E4" | "E5" | "E6"; until: string }
  | { state: "E3" | "E7"; since: string }
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
    firstPublishedAt,
    freeCorrectionsUntil,
    freePublicUntil,
    freePrivateUntil,
  } = deadlines;

  if (firstPublishedAt !== null) {
    if (
      instant(firstPublishedAt) === null ||
      freeCorrectionsUntil === null ||
      freePublicUntil === null ||
      freePrivateUntil === null
    ) {
      return { state: "inconsistent" };
    }
    const correctionsUntil = instant(freeCorrectionsUntil);
    const publicUntil = instant(freePublicUntil);
    const privateUntil = instant(freePrivateUntil);
    if (correctionsUntil === null || publicUntil === null || privateUntil === null) {
      return { state: "inconsistent" };
    }
    if (t < correctionsUntil) return { state: "E4", until: freeCorrectionsUntil };
    if (t < publicUntil) return { state: "E5", until: freePublicUntil };
    if (t < privateUntil) return { state: "E6", until: freePrivateUntil };
    return { state: "E7", since: freePrivateUntil };
  }

  if (freeAnchorAt === null) {
    return freePublishUntil === null && freeDraftUntil === null
      ? { state: "E0" }
      : { state: "inconsistent" };
  }

  if (instant(freeAnchorAt) === null || freePublishUntil === null || freeDraftUntil === null) {
    return { state: "inconsistent" };
  }
  const publishUntil = instant(freePublishUntil);
  const draftUntil = instant(freeDraftUntil);
  if (publishUntil === null || draftUntil === null) return { state: "inconsistent" };
  if (t < publishUntil) return { state: "E1", until: freePublishUntil };
  if (t < draftUntil) return { state: "E2", until: freeDraftUntil };
  return { state: "E3", since: freeDraftUntil };
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
