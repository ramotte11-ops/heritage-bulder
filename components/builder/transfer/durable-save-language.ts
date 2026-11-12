import { isLanguage, type Language } from "@/config/languages";

/**
 * QG 008 Lot 2 — the language of the durable-save screens. It comes from
 * the guest draft (the family's T01 choice), passed as `?langue=` by the
 * guest Builder; anything else falls back to French, HERITAGE's first
 * market. Never used for authorization.
 */
export const DURABLE_SAVE_FALLBACK_LANGUAGE: Language = "fr";

export function durableSaveLanguage(raw: string | string[] | undefined): Language {
  return typeof raw === "string" && isLanguage(raw) ? raw : DURABLE_SAVE_FALLBACK_LANGUAGE;
}

/** Where the magic link brings the family back: the transfer page. */
export const DURABLE_SAVE_RETURN_PATH = "/brouillon/reprise";
