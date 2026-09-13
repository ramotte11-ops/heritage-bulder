import { describe, expect, it } from "vitest";
import {
  inspectDeathNotice,
  parseDeathNoticeContent,
  readDeathNotice,
  setDeathNoticeAnnouncementText,
  setDeathNoticePrecision,
  validateDeathNotice,
  writeDeathNotice,
} from "./death-notice";
import {
  EMPTY_DEATH_NOTICE_CONTENT,
  EMPTY_DEATH_NOTICE_PRECISIONS,
  type DeathNoticeContent,
} from "@/types/death-notice";
import { resolveSectionSelectionStatus } from "./section-selection";
import type { MemorialContent } from "@/types/memorial";

// ---------------------------------------------------------------------
// modèle absent / valide / incomplet / corrompu
// ---------------------------------------------------------------------

describe("parseDeathNoticeContent — absent", () => {
  it("no deathNotice key at all parses to the empty content (incomplete, not invalid)", () => {
    const result = parseDeathNoticeContent(undefined);
    expect(result).toEqual({ ok: true, deathNotice: EMPTY_DEATH_NOTICE_CONTENT });
  });

  it("an explicit null parses the same way", () => {
    const result = parseDeathNoticeContent(null);
    expect(result).toEqual({ ok: true, deathNotice: EMPTY_DEATH_NOTICE_CONTENT });
  });
});

describe("parseDeathNoticeContent — valid", () => {
  it("a fully-filled, well-formed content parses successfully", () => {
    const raw = {
      announcementText: "C'est avec une immense tristesse que nous annonçons...",
      precisions: {
        generalLocation: "Dans la région de Lyon",
        familyMessage: "Merci pour votre soutien.",
        thought: "Une pensée pour ceux qui l'ont connue.",
        quote: "\"La vie est un souffle.\"",
        other: "Fleurs déclinées.",
      },
    };
    const result = parseDeathNoticeContent(raw);
    expect(result).toEqual({ ok: true, deathNotice: raw });
  });

  it("announcementText alone, no precisions object at all, is still valid", () => {
    const result = parseDeathNoticeContent({ announcementText: "Quelques mots." });
    expect(result).toEqual({
      ok: true,
      deathNotice: { announcementText: "Quelques mots.", precisions: EMPTY_DEATH_NOTICE_PRECISIONS },
    });
  });
});

describe("parseDeathNoticeContent — incomplete (structurally valid, A01 not filled in)", () => {
  it("announcementText: null with real precisions is structurally valid", () => {
    const raw = {
      announcementText: null,
      precisions: { generalLocation: "Bretagne", familyMessage: null, thought: null, quote: null, other: null },
    };
    const result = parseDeathNoticeContent(raw);
    expect(result.ok).toBe(true);
  });

  it("blanks-only announcementText normalizes to null (incomplete, never rejected)", () => {
    const result = parseDeathNoticeContent({ announcementText: "   " });
    expect(result.ok && result.deathNotice.announcementText).toBe(null);
  });

  it("blanks-only precision fields normalize to null (incomplete, never rejected)", () => {
    const result = parseDeathNoticeContent({
      precisions: { generalLocation: "  ", familyMessage: "\t", thought: "", quote: null, other: undefined },
    });
    expect(result.ok && result.deathNotice.precisions).toEqual(EMPTY_DEATH_NOTICE_PRECISIONS);
  });

  it("a well-formed but entirely empty content is structurally valid, not complete", () => {
    const result = parseDeathNoticeContent({ announcementText: null, precisions: null });
    expect(result).toEqual({ ok: true, deathNotice: EMPTY_DEATH_NOTICE_CONTENT });
  });
});

describe("parseDeathNoticeContent — corrupted", () => {
  it("a stray string in place of the whole content is rejected, not treated as absent", () => {
    expect(parseDeathNoticeContent("not an object")).toEqual({ ok: false, reason: "not_an_object" });
  });

  it("a number is rejected", () => {
    expect(parseDeathNoticeContent(42)).toEqual({ ok: false, reason: "not_an_object" });
  });

  it("an array is rejected", () => {
    expect(parseDeathNoticeContent([])).toEqual({ ok: false, reason: "not_an_object" });
  });

  it("a non-string announcementText is rejected", () => {
    expect(parseDeathNoticeContent({ announcementText: 12 })).toEqual({
      ok: false,
      reason: "announcementText",
    });
  });

  it("a non-object precisions value is rejected", () => {
    expect(parseDeathNoticeContent({ precisions: "Lyon" })).toEqual({
      ok: false,
      reason: "precisions",
    });
  });

  it("a non-string precision field is rejected", () => {
    expect(parseDeathNoticeContent({ precisions: { generalLocation: 7 } })).toEqual({
      ok: false,
      reason: "precisions",
    });
  });

  it("validateDeathNotice re-checks a hand-built object the same way parseDeathNoticeContent does", () => {
    const wellFormed: DeathNoticeContent = {
      announcementText: null,
      precisions: EMPTY_DEATH_NOTICE_PRECISIONS,
    };
    expect(validateDeathNotice(wellFormed)).toEqual({ ok: true, deathNotice: wellFormed });
  });
});

// ---------------------------------------------------------------------
// annonce courte (A01)
// ---------------------------------------------------------------------

describe("announcementText (A01)", () => {
  it("setDeathNoticeAnnouncementText sets the field", () => {
    const next = setDeathNoticeAnnouncementText(EMPTY_DEATH_NOTICE_CONTENT, "Quelques mots simples.");
    expect(next.announcementText).toBe("Quelques mots simples.");
  });

  it("setDeathNoticeAnnouncementText trims peripheral whitespace only", () => {
    const next = setDeathNoticeAnnouncementText(EMPTY_DEATH_NOTICE_CONTENT, "  Texte avec espaces  ");
    expect(next.announcementText).toBe("Texte avec espaces");
  });

  it("setDeathNoticeAnnouncementText never touches accents/punctuation/casing", () => {
    const text = "Éléonore VASSEUR, née d'Aubigné — 1938-2026.";
    const next = setDeathNoticeAnnouncementText(EMPTY_DEATH_NOTICE_CONTENT, text);
    expect(next.announcementText).toBe(text);
  });

  it("setDeathNoticeAnnouncementText(null) clears the field", () => {
    const filled = setDeathNoticeAnnouncementText(EMPTY_DEATH_NOTICE_CONTENT, "Texte");
    const cleared = setDeathNoticeAnnouncementText(filled, null);
    expect(cleared.announcementText).toBe(null);
  });

  it("a blanks-only value normalizes to null, never rejected", () => {
    const next = setDeathNoticeAnnouncementText(EMPTY_DEATH_NOTICE_CONTENT, "    ");
    expect(next.announcementText).toBe(null);
  });

  it("setting announcementText never touches precisions", () => {
    const withPrecision = setDeathNoticePrecision(EMPTY_DEATH_NOTICE_CONTENT, "thought", "Une pensée.");
    const next = setDeathNoticeAnnouncementText(withPrecision, "Annonce.");
    expect(next.precisions.thought).toBe("Une pensée.");
  });
});

// ---------------------------------------------------------------------
// chaque précision facultative (A02)
// ---------------------------------------------------------------------

describe("each optional precision (A02)", () => {
  const fields = ["generalLocation", "familyMessage", "thought", "quote", "other"] as const;

  for (const field of fields) {
    it(`sets ${field} independently, leaving the other four and announcementText untouched`, () => {
      const seeded = setDeathNoticeAnnouncementText(EMPTY_DEATH_NOTICE_CONTENT, "Annonce.");
      const next = setDeathNoticePrecision(seeded, field, `Valeur ${field}`);

      expect(next.precisions[field]).toBe(`Valeur ${field}`);
      expect(next.announcementText).toBe("Annonce.");
      for (const other of fields) {
        if (other !== field) {
          expect(next.precisions[other]).toBe(null);
        }
      }
    });

    it(`${field}: a blanks-only value normalizes to null, never rejected`, () => {
      const next = setDeathNoticePrecision(EMPTY_DEATH_NOTICE_CONTENT, field, "   ");
      expect(next.precisions[field]).toBe(null);
    });

    it(`${field}: null clears it back out`, () => {
      const filled = setDeathNoticePrecision(EMPTY_DEATH_NOTICE_CONTENT, field, "Valeur");
      const cleared = setDeathNoticePrecision(filled, field, null);
      expect(cleared.precisions[field]).toBe(null);
    });
  }
});

describe("precisions all absent", () => {
  it("EMPTY_DEATH_NOTICE_CONTENT has every precision null", () => {
    expect(EMPTY_DEATH_NOTICE_CONTENT.precisions).toEqual({
      generalLocation: null,
      familyMessage: null,
      thought: null,
      quote: null,
      other: null,
    });
  });

  it("a content with announcementText but no precisions object is still fully valid", () => {
    const result = parseDeathNoticeContent({ announcementText: "Annonce seule." });
    expect(result.ok && result.deathNotice.precisions).toEqual(EMPTY_DEATH_NOTICE_PRECISIONS);
  });
});

// ---------------------------------------------------------------------
// write/read roundtrip, family content preserved exactly
// ---------------------------------------------------------------------

describe("write/read roundtrip", () => {
  it("writeDeathNotice then readDeathNotice returns the exact same content", () => {
    const deathNotice: DeathNoticeContent = {
      announcementText: "Texte d'annonce exact, avec accents éàçù et ponctuation !",
      precisions: {
        generalLocation: "Île-de-France",
        familyMessage: "Merci à toutes et tous.",
        thought: null,
        quote: "« Rien ne se perd, tout se transforme. »",
        other: null,
      },
    };

    const content: MemorialContent = writeDeathNotice({}, deathNotice);
    expect(readDeathNotice(content)).toEqual(deathNotice);
  });

  it("writeDeathNotice preserves every other section's content untouched", () => {
    const content: MemorialContent = {
      hero: { displayName: "Éléonore Vasseur" },
      story: { body: "Contenu de l'histoire." },
    };
    const next = writeDeathNotice(content, {
      announcementText: "Annonce.",
      precisions: EMPTY_DEATH_NOTICE_PRECISIONS,
    });

    expect(next.hero).toEqual(content.hero);
    expect(next.story).toEqual(content.story);
  });

  it("family text survives a roundtrip byte-for-byte (no trimming beyond the original set)", () => {
    const text = "Multi-ligne :\nligne 1\nligne 2 — em dash, apostrophe d'Aubigné, emoji 🕊️";
    const deathNotice = setDeathNoticeAnnouncementText(EMPTY_DEATH_NOTICE_CONTENT, text);
    const content = writeDeathNotice({}, deathNotice);
    expect(readDeathNotice(content).announcementText).toBe(text);
  });
});

// ---------------------------------------------------------------------
// aucun champ Hero dupliqué / aucun champ cérémonie dupliqué / aucun
// champ Auth/Owner
// ---------------------------------------------------------------------

describe("no Hero duplication", () => {
  const forbiddenHeroKeys = ["displayName", "displayedName", "birth", "death", "shortPhrase", "photo"];

  it("EMPTY_DEATH_NOTICE_CONTENT carries none of the Hero's own fields", () => {
    for (const key of forbiddenHeroKeys) {
      expect(Object.prototype.hasOwnProperty.call(EMPTY_DEATH_NOTICE_CONTENT, key)).toBe(false);
    }
  });

  it("a fully-populated DeathNoticeContent still carries none of them", () => {
    const filled: DeathNoticeContent = {
      announcementText: "Annonce.",
      precisions: {
        generalLocation: "Paris",
        familyMessage: "Merci.",
        thought: "Pensée.",
        quote: "Citation.",
        other: "Autre.",
      },
    };
    for (const key of forbiddenHeroKeys) {
      expect(Object.prototype.hasOwnProperty.call(filled, key)).toBe(false);
    }
  });
});

describe("no ceremony duplication", () => {
  const forbiddenCeremonyKeys = [
    "ceremonyDate",
    "ceremonyTime",
    "ceremonyVenue",
    "ceremonyAddress",
    "venue",
    "date",
    "time",
  ];

  it("EMPTY_DEATH_NOTICE_CONTENT carries no ceremony field", () => {
    for (const key of forbiddenCeremonyKeys) {
      expect(Object.prototype.hasOwnProperty.call(EMPTY_DEATH_NOTICE_CONTENT, key)).toBe(false);
    }
  });

  it("precisions.generalLocation is a loose optional mention, not a ceremony venue field", () => {
    // Structural proof, not a wording test: `generalLocation` is the
    // only location-shaped field anywhere in this model, and it lives
    // under `precisions`, not as a ceremony-shaped sibling of it.
    expect(Object.keys(EMPTY_DEATH_NOTICE_PRECISIONS)).toEqual([
      "generalLocation",
      "familyMessage",
      "thought",
      "quote",
      "other",
    ]);
  });
});

describe("no cause of death field", () => {
  it("no key resembling a cause of death exists anywhere in the model", () => {
    const allKeys = [
      ...Object.keys(EMPTY_DEATH_NOTICE_CONTENT),
      ...Object.keys(EMPTY_DEATH_NOTICE_PRECISIONS),
    ];
    for (const key of allKeys) {
      expect(key.toLowerCase()).not.toContain("cause");
    }
  });
});

describe("no Auth/Owner dependency", () => {
  it("no key resembling an owner/user/session identity exists in the model", () => {
    const allKeys = [
      ...Object.keys(EMPTY_DEATH_NOTICE_CONTENT),
      ...Object.keys(EMPTY_DEATH_NOTICE_PRECISIONS),
    ];
    const forbidden = ["owner", "user", "auth", "session", "email"];
    for (const key of allKeys) {
      const lower = key.toLowerCase();
      for (const term of forbidden) {
        expect(lower).not.toContain(term);
      }
    }
  });

  it("every exported function takes only content/values — no session or owner parameter", () => {
    // Compile-time guard: if any of these signatures ever grew a
    // session/owner parameter, this file would fail to type-check exactly
    // like section-selection.test.ts's own compile-time guard for
    // skin/offerId.
    const content: MemorialContent = {};
    inspectDeathNotice(content);
    readDeathNotice(content);
    writeDeathNotice(content, EMPTY_DEATH_NOTICE_CONTENT);
    parseDeathNoticeContent(undefined);
    validateDeathNotice(EMPTY_DEATH_NOTICE_CONTENT);
    setDeathNoticeAnnouncementText(EMPTY_DEATH_NOTICE_CONTENT, null);
    setDeathNoticePrecision(EMPTY_DEATH_NOTICE_CONTENT, "thought", null);
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------
// Context cases (mission brief, section 10)
// ---------------------------------------------------------------------

describe("context: announcement can read/use the model", () => {
  it("resolveSectionSelectionStatus classifies deathNotice for announcement", () => {
    const status = resolveSectionSelectionStatus("deathNotice", { editorialContext: "announcement" });
    expect(status === "notRelevant").toBe(false);
  });

  it("readDeathNotice works identically regardless of which editorialContext the caller is in", () => {
    const deathNotice: DeathNoticeContent = {
      announcementText: "Annonce.",
      precisions: EMPTY_DEATH_NOTICE_PRECISIONS,
    };
    const content = writeDeathNotice({}, deathNotice);
    // The model itself never receives an editorialContext at all — this
    // is the same read regardless of what a caller's memorial happens to
    // be configured as.
    expect(readDeathNotice(content)).toEqual(deathNotice);
  });
});

describe("context: remembrance does not activate the Death Notice", () => {
  it("resolveSectionSelectionStatus resolves deathNotice to notRelevant in remembrance", () => {
    const status = resolveSectionSelectionStatus("deathNotice", { editorialContext: "remembrance" });
    expect(status).toBe("notRelevant");
  });

  it("remembrance stays notRelevant even when explicit content signals are (incorrectly) passed for it", () => {
    const status = resolveSectionSelectionStatus("deathNotice", {
      editorialContext: "remembrance",
      explicitContentSectionIds: ["deathNotice"],
    });
    expect(status).toBe("notRelevant");
  });
});

describe("context change does not silently destroy already-entered content", () => {
  it("content.deathNotice written while in announcement survives being read back untouched — this module never inspects or depends on editorialContext to decide whether to keep it", () => {
    const deathNotice: DeathNoticeContent = {
      announcementText: "Annonce déjà saisie avant un changement de contexte.",
      precisions: { ...EMPTY_DEATH_NOTICE_PRECISIONS, familyMessage: "Un mot de la famille." },
    };
    let content: MemorialContent = writeDeathNotice({}, deathNotice);

    // A context switch (memorials.editorial_context flipping to
    // "remembrance" and back) never runs through this module at all —
    // there is no function here that could even be called to react to
    // it. Simulating "nothing touched content.deathNotice in between" is
    // exactly the guarantee: the value is still there, unmodified.
    expect(inspectDeathNotice(content)).toEqual({ status: "valid", deathNotice });

    // Writing an unrelated section (as a real context-change flow would
    // do to other keys) still never disturbs it.
    content = { ...content, hero: { displayName: "Éléonore" } };
    expect(inspectDeathNotice(content)).toEqual({ status: "valid", deathNotice });
  });
});

// ---------------------------------------------------------------------
// QG micro-audit — unknown keys never become canonical (mission's own
// "Point à auditer": the `[key: string]: unknown` index signatures on
// DeathNoticeContent/DeathNoticePrecisions exist ONLY for structural
// assignability into MemorialSectionContent (Record<string, unknown>,
// types/memorial.ts) — the same reason HeroContent carries one. They do
// NOT make `parseDeathNoticeContent` permissive: it reconstructs a fresh
// `{ announcementText, precisions }` object field-by-field and never
// spreads `raw`, so no key the parser doesn't explicitly name can ever
// reach the returned value, however the index signature reads.
// ---------------------------------------------------------------------

describe("QG micro-audit — unknown keys never become canonical", () => {
  it("a Hero-shaped key (displayName/birth/death/photo/shortPhrase) does not survive parsing", () => {
    const poisoned = {
      announcementText: "Texte normal.",
      displayName: "Jean Dupont",
      birth: { precision: "year", year: 1950 },
      death: { precision: "year", year: 2020 },
      photo: { mediaId: "11111111-1111-4111-8111-111111111111" },
      shortPhrase: "Une phrase.",
    };
    const result = parseDeathNoticeContent(poisoned);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    // The canonical value holds ONLY the two known fields.
    expect(Object.keys(result.deathNotice).sort()).toEqual(["announcementText", "precisions"]);
    expect(result.deathNotice).toEqual({
      announcementText: "Texte normal.",
      precisions: EMPTY_DEATH_NOTICE_PRECISIONS,
    });
    for (const heroKey of ["displayName", "birth", "death", "photo", "shortPhrase"]) {
      expect(Object.prototype.hasOwnProperty.call(result.deathNotice, heroKey)).toBe(false);
    }
  });

  it("an Auth/Owner-shaped key (ownerId/userId/email) does not survive parsing", () => {
    const poisoned = {
      announcementText: "Texte normal.",
      ownerId: "owner-1",
      userId: "user-1",
      email: "famille@example.com",
    };
    const result = parseDeathNoticeContent(poisoned);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    expect(Object.keys(result.deathNotice).sort()).toEqual(["announcementText", "precisions"]);
    for (const authKey of ["ownerId", "userId", "email"]) {
      expect(Object.prototype.hasOwnProperty.call(result.deathNotice, authKey)).toBe(false);
    }
  });

  it("a ceremony-shaped key (ceremonyDate/venue) does not survive parsing", () => {
    const poisoned = {
      announcementText: "Texte normal.",
      ceremonyDate: "2026-03-01",
      venue: "Église Saint-Martin",
    };
    const result = parseDeathNoticeContent(poisoned);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    expect(Object.keys(result.deathNotice).sort()).toEqual(["announcementText", "precisions"]);
    for (const ceremonyKey of ["ceremonyDate", "venue"]) {
      expect(Object.prototype.hasOwnProperty.call(result.deathNotice, ceremonyKey)).toBe(false);
    }
  });

  it("all three families of unknown keys combined still parse to exactly the two known fields, nothing more", () => {
    const poisoned = {
      announcementText: "Annonce.",
      precisions: { generalLocation: "Lyon" },
      displayName: "Jean Dupont",
      birth: { precision: "year", year: 1950 },
      death: { precision: "year", year: 2020 },
      photo: { mediaId: "x" },
      shortPhrase: "phrase",
      ownerId: "owner-1",
      userId: "user-1",
      email: "a@b.com",
      ceremonyDate: "2026-01-01",
      venue: "Church",
    };
    const result = parseDeathNoticeContent(poisoned);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    expect(Object.keys(result.deathNotice).sort()).toEqual(["announcementText", "precisions"]);
    expect(Object.keys(result.deathNotice.precisions).sort()).toEqual(
      ["familyMessage", "generalLocation", "other", "quote", "thought"].sort(),
    );
  });

  it("the same combined poisoned payload also inspects as ordinary valid content.deathNotice, not corrupted", () => {
    const content: MemorialContent = {
      deathNotice: {
        announcementText: "Annonce.",
        displayName: "Jean Dupont",
        ownerId: "owner-1",
        ceremonyDate: "2026-01-01",
      },
    };
    const result = inspectDeathNotice(content);
    expect(result.status).toBe("valid");
    if (result.status !== "valid") throw new Error("unreachable");
    expect(Object.keys(result.deathNotice).sort()).toEqual(["announcementText", "precisions"]);
  });
});

describe("QG micro-audit — non-canonical payload keeps raw preserved", () => {
  it("a deathNotice that is a string, not an object, is corrupted and its raw is preserved untouched", () => {
    const content: MemorialContent = { deathNotice: "not an object" as unknown as MemorialContent["deathNotice"] };
    const result = inspectDeathNotice(content);
    expect(result).toEqual({ status: "corrupted", raw: "not an object" });
  });

  it("a deathNotice with a wrongly-typed known field is corrupted and its raw — including any unknown sibling keys — is preserved untouched, not stripped down to the known ones", () => {
    const raw = { announcementText: 42, displayName: "Jean Dupont", ownerId: "owner-1" };
    const content: MemorialContent = { deathNotice: raw as unknown as MemorialContent["deathNotice"] };
    const result = inspectDeathNotice(content);
    expect(result).toEqual({ status: "corrupted", raw });
    // The exact original object identity/shape is what a future repair
    // path would need — never a partially-parsed, partially-lost value.
    if (result.status === "corrupted") {
      expect(result.raw).toBe(raw);
    }
  });
});

describe("QG micro-audit — write path on a corrupted payload", () => {
  const corruptedRaw = { announcementText: 42, displayName: "Jean Dupont" };

  it("proves the real risk: readDeathNotice + writeDeathNotice DOES silently discard a corrupted stored value", () => {
    const content: MemorialContent = { deathNotice: corruptedRaw as unknown as MemorialContent["deathNotice"] };
    expect(inspectDeathNotice(content).status).toBe("corrupted");

    // The unsafe composition readDeathNotice's own docstring warns
    // against: it fails safe to an empty value, and writing that back
    // replaces the corrupted raw with no trace it was ever there.
    const editedFromReadDeathNotice = setDeathNoticeAnnouncementText(
      readDeathNotice(content),
      "Nouveau texte tapé par la famille.",
    );
    const next = writeDeathNotice(content, editedFromReadDeathNotice);

    // The corrupted raw (and its unknown `displayName` key) is gone —
    // this IS the documented risk, proven real, not merely asserted.
    expect(inspectDeathNotice(next).status).toBe("valid");
    expect(next.deathNotice).not.toEqual(corruptedRaw);
  });

  it("proves the safe pattern: a caller branching on inspectDeathNotice can refuse to call writeDeathNotice at all", () => {
    const content: MemorialContent = { deathNotice: corruptedRaw as unknown as MemorialContent["deathNotice"] };

    // The guarded pattern lib/builder/guided-flow/hero-step.ts already
    // applies for every Hero field write (inspectHero first, refuse on
    // "corrupted") composes identically here — Mission 039's own job to
    // wire in, proven here to actually work when followed.
    function guardedWrite(c: MemorialContent, text: string): { ok: true; content: MemorialContent } | { ok: false } {
      const state = inspectDeathNotice(c);
      if (state.status === "corrupted") return { ok: false };
      return { ok: true, content: writeDeathNotice(c, setDeathNoticeAnnouncementText(state.deathNotice, text)) };
    }

    const result = guardedWrite(content, "Nouveau texte.");
    expect(result).toEqual({ ok: false });
    // Nothing was written — the original corrupted raw is exactly as it was.
    expect(inspectDeathNotice(content)).toEqual({ status: "corrupted", raw: corruptedRaw });
  });

  it("writeDeathNotice itself has no corrupted-check: it always overwrites, by design (mirrors lib/memorial/hero.ts's updateHero) — the guard is the caller's job", () => {
    const content: MemorialContent = { deathNotice: corruptedRaw as unknown as MemorialContent["deathNotice"] };
    const deliberateReplacement: DeathNoticeContent = {
      announcementText: "Remplacement volontaire, ex. après réparation manuelle.",
      precisions: EMPTY_DEATH_NOTICE_PRECISIONS,
    };
    const next = writeDeathNotice(content, deliberateReplacement);
    expect(readDeathNotice(next)).toEqual(deliberateReplacement);
  });
});
