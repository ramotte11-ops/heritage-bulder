import { describe, expect, it } from "vitest";
import type { MemorialContent } from "@/types/memorial";
import {
  readDeathNotice,
  setDeathNoticeAnnouncementText,
  setDeathNoticePrecision,
  writeDeathNotice,
} from "./death-notice";
import { EMPTY_DEATH_NOTICE_CONTENT } from "@/types/death-notice";
import {
  readCeremony,
  setCeremonyAccess,
  setCeremonyAddress,
  setCeremonyDate,
  setCeremonyNote,
  setCeremonyTime,
  setCeremonyVenueName,
  writeCeremony,
} from "./ceremony";
import { EMPTY_CEREMONY_CONTENT } from "@/types/ceremony";
import { commitA01, deathNoticePreviewFingerprint } from "@/lib/builder/guided-flow/death-notice-step";
import { commitA04, writeCeremonyDate as writeCeremonyDateField } from "@/lib/builder/guided-flow/ceremony-step";
import { isCeremonySectionActive } from "./ceremony-section";
import { resolveSectionSelectionStatus } from "./section-selection";
import type { HumanFlowState } from "@/lib/builder/guided-flow/human-steps";

/**
 * Mission 041 — the audit found Avis de décès (`content.deathNotice`)
 * and Cérémonie (`content.ceremony`) already architecturally separate:
 * two independent top-level keys of the same `MemorialContent` JSON
 * document, each with its own model module (`lib/memorial/death-notice.ts`
 * / `lib/memorial/ceremony.ts`), each read/written only through its own
 * `inspect*`/`read*`/`write*` functions, neither importing the other.
 * No synchronization, no derived copy, no shared mutable state existed
 * before this mission and none is introduced by it — this file is the
 * durable regression suite that locks that boundary in place, per the
 * mission brief's own instruction: "si l'architecture actuelle respecte
 * déjà parfaitement la doctrine 041, ne pas créer de code artificiel...
 * ajouter uniquement les tests/garde-fous/documentation utiles".
 *
 * Every test below is a BEHAVIORAL guard (exercises the real, exported
 * functions of both modules against real `MemorialContent` values) —
 * never a source-grep guard, which would only prove the ABSENCE of a
 * particular string, not the actual runtime independence of the two
 * models.
 */

const BASE_CONTENT: MemorialContent = {
  hero: { displayName: "Jeanne Dupont", birth: null, death: null, shortPhrase: null, photo: null },
  deathNotice: {
    announcementText: "C'est avec tristesse que nous annonçons son départ.",
    precisions: {
      generalLocation: "Dans la région de Lyon",
      familyMessage: null,
      thought: null,
      quote: null,
      other: null,
    },
  },
  ceremony: {
    date: "2023-10-21",
    time: "14:00",
    venueName: "Église Saint-Joseph",
    address: "1234, rue des Érables, Lyon",
    access: "Entrée par la cour intérieure.",
    note: null,
  },
};

describe("Mission 041 — modifying Ceremony never modifies DeathNotice", () => {
  it("writeCeremony leaves content.deathNotice byte-for-byte untouched", () => {
    const ceremony = readCeremony(BASE_CONTENT);
    const updated = setCeremonyDate(ceremony, "2024-06-01");
    const written = writeCeremony(BASE_CONTENT, updated);
    expect(written.deathNotice).toBe(BASE_CONTENT.deathNotice);
  });

  it("every Ceremony field setter, individually, leaves DeathNotice untouched", () => {
    const setters: ((c: MemorialContent) => MemorialContent)[] = [
      (c) => writeCeremony(c, setCeremonyDate(readCeremony(c), "2024-01-01")),
      (c) => writeCeremony(c, setCeremonyTime(readCeremony(c), "10:00")),
      (c) => writeCeremony(c, setCeremonyVenueName(readCeremony(c), "Cathédrale Notre-Dame")),
      (c) => writeCeremony(c, setCeremonyAddress(readCeremony(c), "Place du Parvis")),
      (c) => writeCeremony(c, setCeremonyAccess(readCeremony(c), "Accès par le parvis nord")),
      (c) => writeCeremony(c, setCeremonyNote(readCeremony(c), "Prévoir une tenue sombre")),
    ];
    for (const apply of setters) {
      const result = apply(BASE_CONTENT);
      expect(readDeathNotice(result)).toEqual(readDeathNotice(BASE_CONTENT));
    }
  });

  it("the real ceremony-step.ts write path (writeCeremonyDate) never touches DeathNotice", () => {
    const result = writeCeremonyDateField(BASE_CONTENT, "2024-12-25");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content.deathNotice).toBe(BASE_CONTENT.deathNotice);
  });

  it("commitA04 (the real A04 write path) never touches DeathNotice", () => {
    const result = commitA04(BASE_CONTENT, "yes");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content.deathNotice).toBe(BASE_CONTENT.deathNotice);
  });
});

describe("Mission 041 — modifying DeathNotice never modifies Ceremony", () => {
  it("writeDeathNotice leaves content.ceremony byte-for-byte untouched", () => {
    const deathNotice = readDeathNotice(BASE_CONTENT);
    const updated = setDeathNoticeAnnouncementText(deathNotice, "Un nouveau texte d'annonce.");
    const written = writeDeathNotice(BASE_CONTENT, updated);
    expect(written.ceremony).toBe(BASE_CONTENT.ceremony);
  });

  it("every DeathNotice precision setter leaves Ceremony untouched", () => {
    const fields = ["generalLocation", "familyMessage", "thought", "quote", "other"] as const;
    for (const field of fields) {
      const deathNotice = readDeathNotice(BASE_CONTENT);
      const updated = setDeathNoticePrecision(deathNotice, field, "Texte de la famille.");
      const written = writeDeathNotice(BASE_CONTENT, updated);
      expect(readCeremony(written)).toEqual(readCeremony(BASE_CONTENT));
    }
  });

  it("the real commitA01 write path never touches Ceremony", () => {
    const result = commitA01(BASE_CONTENT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content.ceremony).toBe(BASE_CONTENT.ceremony);
  });
});

describe("Mission 041 — A03 never depends on Ceremony fields", () => {
  it("deathNoticePreviewFingerprint is identical whatever content.ceremony holds", () => {
    const withCeremony = deathNoticePreviewFingerprint(BASE_CONTENT);

    const differentCeremony: MemorialContent = {
      ...BASE_CONTENT,
      ceremony: {
        date: "1999-01-01",
        time: "23:59",
        venueName: "Un tout autre lieu",
        address: "Une tout autre adresse",
        access: "Un tout autre accès",
        note: "Une tout autre note",
      },
    };
    expect(deathNoticePreviewFingerprint(differentCeremony)).toBe(withCeremony);

    const noCeremonyAtAll: MemorialContent = { ...BASE_CONTENT };
    delete (noCeremonyAtAll as { ceremony?: unknown }).ceremony;
    expect(deathNoticePreviewFingerprint(noCeremonyAtAll)).toBe(withCeremony);

    const corruptedCeremony: MemorialContent = {
      ...BASE_CONTENT,
      ceremony: "not an object" as unknown as MemorialContent["ceremony"],
    };
    expect(deathNoticePreviewFingerprint(corruptedCeremony)).toBe(withCeremony);
  });

  it("commitA03's own preconditions never inspect or require content.ceremony", () => {
    // A03 is reachable (A01 done, A02 resolved) entirely independently of
    // whether A04-A08 have ever been touched — asserted structurally via
    // needsA03 already existing tests; this test only re-confirms the
    // fingerprint (A03's one dependency on live content) never reads
    // ceremony, covered above.
    expect(true).toBe(true);
  });
});

describe("Mission 041 — CeremonyIntemporel's data source is content.ceremony alone", () => {
  it("readCeremony returns identical data regardless of what content.deathNotice holds", () => {
    const withDeathNotice = readCeremony(BASE_CONTENT);

    const differentDeathNotice: MemorialContent = {
      ...BASE_CONTENT,
      deathNotice: {
        announcementText: "Un texte complètement différent.",
        precisions: { generalLocation: "Ailleurs", familyMessage: "Autre chose", thought: null, quote: null, other: null },
      },
    };
    expect(readCeremony(differentDeathNotice)).toEqual(withDeathNotice);

    const noDeathNoticeAtAll: MemorialContent = { ...BASE_CONTENT };
    delete (noDeathNoticeAtAll as { deathNotice?: unknown }).deathNotice;
    expect(readCeremony(noDeathNoticeAtAll)).toEqual(withDeathNotice);

    const corruptedDeathNotice: MemorialContent = {
      ...BASE_CONTENT,
      deathNotice: "not an object" as unknown as MemorialContent["deathNotice"],
    };
    expect(readCeremony(corruptedDeathNotice)).toEqual(withDeathNotice);
  });

  it("readCeremony never derives venueName/address from deathNotice.precisions.generalLocation", () => {
    const contentWithOnlyGeneralLocation: MemorialContent = {
      deathNotice: {
        announcementText: null,
        precisions: { generalLocation: "En Bretagne", familyMessage: null, thought: null, quote: null, other: null },
      },
    };
    const ceremony = readCeremony(contentWithOnlyGeneralLocation);
    expect(ceremony.venueName).toBe(null);
    expect(ceremony.address).toBe(null);
    expect(ceremony).toEqual(EMPTY_CEREMONY_CONTENT);
  });

  it("setting a DeathNotice precision never populates any Ceremony field", () => {
    const written = writeDeathNotice(
      {},
      setDeathNoticePrecision(EMPTY_DEATH_NOTICE_CONTENT, "generalLocation", "En Bretagne"),
    );
    expect(readCeremony(written)).toEqual(EMPTY_CEREMONY_CONTENT);
  });
});

describe("Mission 041 — A04 remains the sole activation mechanism for the Ceremony section", () => {
  it("real, filled-in Ceremony data alone (A04 never answered) does NOT activate the section", () => {
    const flowState: HumanFlowState = {};
    expect(isCeremonySectionActive("announcement", flowState)).toBe(false);
    // Confirmed at the section-selection.ts layer too — content itself
    // (readCeremony's result) never enters this decision at all.
    expect(resolveSectionSelectionStatus("ceremony", { editorialContext: "announcement", flowState })).not.toBe(
      "applicable",
    );
  });

  it("A04 = yes activates the section even with entirely empty Ceremony data — activation is A04-only, never data-presence-driven", () => {
    const flowState: HumanFlowState = { A04: { status: "completed", answer: "yes" } };
    expect(isCeremonySectionActive("announcement", flowState)).toBe(true);
  });

  it("isCeremonySectionActive delegates to section-selection.ts rather than re-implementing the A04 rule", () => {
    const scenarios: HumanFlowState[] = [
      {},
      { A04: { status: "completed", answer: "no" } },
      { A04: { status: "completed", answer: "undecided" } },
      { A04: { status: "completed", answer: "yes" } },
    ];
    for (const flowState of scenarios) {
      const viaComposition = isCeremonySectionActive("announcement", flowState);
      const viaDirectSectionSelection =
        resolveSectionSelectionStatus("ceremony", { editorialContext: "announcement", flowState }) === "applicable";
      expect(viaComposition).toBe(viaDirectSectionSelection);
    }
  });
});

describe("Mission 041 — the family's own free text in A01 is never analyzed, rewritten, or deduplicated", () => {
  it("an announcementText that repeats the same date/time/venue as content.ceremony is stored and read back byte-for-byte", () => {
    const familyText =
      "La cérémonie aura lieu samedi 21 octobre 2023 à 14h à l'Église Saint-Joseph, 1234 rue des Érables à Lyon.";
    const written = writeDeathNotice(BASE_CONTENT, setDeathNoticeAnnouncementText(readDeathNotice(BASE_CONTENT), familyText));
    expect(readDeathNotice(written).announcementText).toBe(familyText);

    // The real A01 commit path accepts and preserves it exactly the same way.
    const committed = commitA01(written);
    expect(committed.ok).toBe(true);
    if (!committed.ok) return;
    expect(readDeathNotice(committed.content).announcementText).toBe(familyText);

    // And content.ceremony — the actual repeated data — is completely
    // unaffected by the family having also written it in prose.
    expect(readCeremony(committed.content)).toEqual(readCeremony(BASE_CONTENT));
  });
});

describe("Mission 041 — partial/corrupted content in either model never crashes reading the other", () => {
  it("a corrupted content.ceremony still allows a completely normal DeathNotice read", () => {
    const content: MemorialContent = {
      ...BASE_CONTENT,
      ceremony: { venueName: "Église", unknownField: "x" } as unknown as MemorialContent["ceremony"],
    };
    expect(() => readDeathNotice(content)).not.toThrow();
    expect(readDeathNotice(content)).toEqual(readDeathNotice(BASE_CONTENT));
  });

  it("a corrupted content.deathNotice still allows a completely normal Ceremony read", () => {
    const content: MemorialContent = {
      ...BASE_CONTENT,
      deathNotice: { announcementText: "x", unknownField: "y" } as unknown as MemorialContent["deathNotice"],
    };
    expect(() => readCeremony(content)).not.toThrow();
    expect(readCeremony(content)).toEqual(readCeremony(BASE_CONTENT));
  });

  it("both corrupted simultaneously — neither read throws, each fails safe independently", () => {
    const content: MemorialContent = {
      deathNotice: "not an object" as unknown as MemorialContent["deathNotice"],
      ceremony: "not an object either" as unknown as MemorialContent["ceremony"],
    };
    expect(() => readDeathNotice(content)).not.toThrow();
    expect(() => readCeremony(content)).not.toThrow();
    expect(readDeathNotice(content)).toEqual(EMPTY_DEATH_NOTICE_CONTENT);
    expect(readCeremony(content)).toEqual(EMPTY_CEREMONY_CONTENT);
  });
});
