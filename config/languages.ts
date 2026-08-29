/**
 * Languages available in the Builder and on published memorials.
 */

export const LANGUAGES = ["en", "fr", "es"] as const;

export type Language = (typeof LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = "en";
