import { afterEach, describe, expect, it, vi } from "vitest";
import { LANGUAGES, type Language } from "@/config/languages";
import { TRANSLATION_KEYS, type TranslationKey } from "./keys";
import { DICTIONARIES, type Dictionary, isSupportedLanguage, translate } from "./translate";
import { en } from "./dictionaries/en";
import { fr } from "./dictionaries/fr";
import { es } from "./dictionaries/es";

describe("translate — each language resolves its own keys", () => {
  it("en resolves every canonical key to its own dictionary entry", () => {
    for (const key of TRANSLATION_KEYS) {
      expect(translate("en", key)).toBe(en[key]);
    }
  });

  it("fr resolves every key it has translated to its own dictionary entry", () => {
    for (const key of TRANSLATION_KEYS) {
      expect(translate("fr", key)).toBe(fr[key]);
    }
  });

  it("es resolves every key it has translated to its own dictionary entry", () => {
    for (const key of TRANSLATION_KEYS) {
      expect(translate("es", key)).toBe(es[key]);
    }
  });
});

describe("translate — unsupported language falls back to en", () => {
  it("falls back to en for a language absent from LANGUAGES", () => {
    for (const key of TRANSLATION_KEYS) {
      expect(translate("de", key)).toBe(en[key]);
      expect(translate("xx", key)).toBe(en[key]);
    }
  });

  it("falls back to en for an empty or malformed language code", () => {
    expect(translate("", "common.continue")).toBe(en["common.continue"]);
  });

  it("never treats a supported language as unsupported", () => {
    for (const language of LANGUAGES) {
      expect(isSupportedLanguage(language)).toBe(true);
    }
    expect(isSupportedLanguage("de")).toBe(false);
  });
});

describe("translate — a key missing from FR/ES falls back to the same key's en value", () => {
  // Constructed fixture rather than the real FR/ES dictionaries: the
  // real ones happen to translate every key that exists today (see
  // dictionaries/fr.ts, dictionaries/es.ts), so this proves the
  // fallback *mechanism* directly instead of relying on an
  // incidentally-incomplete real dictionary.
  const fixtures: Record<Language, Dictionary> = {
    en: { "common.continue": "Continue", "errors.generic": "Something went wrong." },
    fr: { "common.continue": "Continuer" }, // "errors.generic" deliberately absent
    es: {}, // nothing translated at all
  };

  it("falls back to en when the target language dictionary has no entry", () => {
    expect(translate("fr", "errors.generic", fixtures)).toBe("Something went wrong.");
    expect(translate("es", "common.continue", fixtures)).toBe("Continue");
    expect(translate("es", "errors.generic", fixtures)).toBe("Something went wrong.");
  });

  it("uses the target language's own entry when present, not the fallback", () => {
    expect(translate("fr", "common.continue", fixtures)).toBe("Continuer");
  });
});

describe("translate — an unknown key is an explicit, testable developer error", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws outside production for a key not in the canonical set", () => {
    expect(process.env.NODE_ENV).not.toBe("production");
    expect(() => translate("en", "nope.nope" as TranslationKey)).toThrow(/no canonical dictionary entry/);
  });

  it("degrades to the key string itself in production instead of throwing", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(translate("en", "nope.nope" as TranslationKey)).toBe("nope.nope");
  });
});

describe("translate — no coupling to culture, skin, or offer", () => {
  it("resolves identically regardless of any surrounding product context", () => {
    // translate()'s signature is (language, key[, dictionaries]) only —
    // there is no culture/skin/offer parameter for it to read. Two
    // completely different "contexts" (stood in for here by unrelated
    // local values that are never passed to translate()) must produce
    // the exact same resolution for the same language + key.
    const contextA = { skin: "maghreb", offerId: "arabe", culture: "arabe" };
    const contextB = { skin: "juif", offerId: "juif", culture: "juif" };
    void contextA;
    void contextB;

    expect(translate("fr", "common.save")).toBe(translate("fr", "common.save"));
    expect(translate.length).toBe(2); // (language, key) — dictionaries has a default
  });
});

describe("translate — the primitive never mutates shared state", () => {
  it("keeps DICTIONARIES frozen and unchanged across repeated calls", () => {
    expect(Object.isFrozen(DICTIONARIES)).toBe(true);
    expect(Object.isFrozen(DICTIONARIES.en)).toBe(true);
    expect(Object.isFrozen(DICTIONARIES.fr)).toBe(true);
    expect(Object.isFrozen(DICTIONARIES.es)).toBe(true);

    const before = JSON.stringify(DICTIONARIES);
    for (const language of [...LANGUAGES, "de", "xx"]) {
      for (const key of TRANSLATION_KEYS) {
        translate(language, key);
      }
    }
    expect(JSON.stringify(DICTIONARIES)).toBe(before);
  });

  it("rejects a direct mutation attempt on a dictionary", () => {
    expect(() => {
      // @ts-expect-error — DICTIONARIES.en is frozen; this is exactly
      // what must throw.
      DICTIONARIES.en["common.continue"] = "Nope";
    }).toThrow();
  });
});

describe("guard — the canonical language list has exactly one source", () => {
  it("DICTIONARIES has exactly one entry per config/languages.ts's LANGUAGES, no more, no fewer", () => {
    expect(Object.keys(DICTIONARIES).sort()).toEqual([...LANGUAGES].sort());
  });
});

describe("guard — the canonical key list matches the en dictionary exactly", () => {
  it("en has exactly one entry per TRANSLATION_KEYS, no more, no fewer", () => {
    expect(Object.keys(en).sort()).toEqual([...TRANSLATION_KEYS].sort());
  });

  it("TRANSLATION_KEYS has no duplicate entries", () => {
    expect(new Set(TRANSLATION_KEYS).size).toBe(TRANSLATION_KEYS.length);
  });

  it("fr and es never declare a key outside the canonical set", () => {
    const canonical = new Set<string>(TRANSLATION_KEYS);
    for (const key of Object.keys(fr)) expect(canonical.has(key)).toBe(true);
    for (const key of Object.keys(es)) expect(canonical.has(key)).toBe(true);
  });
});
