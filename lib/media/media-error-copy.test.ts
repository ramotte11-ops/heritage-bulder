import { describe, expect, it } from "vitest";
import type { MediaErrorCode } from "./media-errors";
import { MediaActionError, mediaErrorTranslationKey } from "./media-error-copy";
import { translate } from "@/lib/i18n/translate";
import { isTranslationKey } from "@/lib/i18n/keys";

const ALL_CODES: MediaErrorCode[] = [
  "file_too_large",
  "unsupported_format",
  "invalid_file",
  "upload_incomplete",
  "access_denied",
  "storage_unavailable",
];

const TECHNICAL_WORDS = [
  "413",
  "mime",
  "signature",
  "storage error",
  "supabase",
  "http",
  "stack",
  "json",
];

describe("mediaErrorTranslationKey — Mission 033 section 12, closed human vocabulary", () => {
  it.each(ALL_CODES)("resolves a real, existing TranslationKey for %s", (code) => {
    const key = mediaErrorTranslationKey(code);
    expect(isTranslationKey(key)).toBe(true);
  });

  it("maps the three distinguishable, product-specified cases to their own key", () => {
    expect(mediaErrorTranslationKey("file_too_large")).toBe("hero.photoErrorTooLarge");
    expect(mediaErrorTranslationKey("unsupported_format")).toBe("hero.photoErrorUnsupportedFormat");
    expect(mediaErrorTranslationKey("invalid_file")).toBe("hero.photoErrorInvalidFile");
  });

  it("collapses upload_incomplete/access_denied/storage_unavailable into the one generic 'incident' key — never an oracle", () => {
    expect(mediaErrorTranslationKey("upload_incomplete")).toBe("hero.photoErrorGeneric");
    expect(mediaErrorTranslationKey("access_denied")).toBe("hero.photoErrorGeneric");
    expect(mediaErrorTranslationKey("storage_unavailable")).toBe("hero.photoErrorGeneric");
  });

  it.each(["en", "fr", "es"] as const)(
    "every resolved key actually translates to real, non-technical text in %s",
    (language) => {
      for (const code of ALL_CODES) {
        const text = translate(language, mediaErrorTranslationKey(code));
        expect(text.length).toBeGreaterThan(0);
        const lower = text.toLowerCase();
        for (const word of TECHNICAL_WORDS) {
          expect(lower).not.toContain(word);
        }
      }
    },
  );
});

describe("MediaActionError", () => {
  it("carries the code and nothing else observable beyond a generic message", () => {
    const error = new MediaActionError("file_too_large");
    expect(error.code).toBe("file_too_large");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("MediaActionError");
  });
});
