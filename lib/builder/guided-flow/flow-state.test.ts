import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MemorialContent } from "@/types/memorial";
import type { Media } from "@/types/media";
import { EMPTY_HERO_CONTENT } from "@/types/hero";
import { EMPTY_DEATH_NOTICE_CONTENT } from "@/types/death-notice";
import { EMPTY_CEREMONY_CONTENT } from "@/types/ceremony";
import { EMPTY_TRADITIONS_CONTENT } from "@/types/traditions";
import { EMPTY_PERSON_WORDS_CONTENT } from "@/types/person-words";
import { EMPTY_LOVED_THINGS_CONTENT } from "@/types/loved-things";
import { EMPTY_LEGACY_CONTENT } from "@/types/legacy";
import { EMPTY_GALLERY_CONTENT } from "@/types/gallery";
import { createAutosaveController } from "@/lib/builder/autosave-controller";
import { STEP_IDS, type HumanFlowState } from "./human-steps";
import { readGuidedFlowState, writeGuidedFlowState } from "./flow-state";
import {
  commitPageA,
  commitPageB,
  commitPageC,
  commitPageD,
  commitPageE,
  reconcileHeroPhotoMedia,
  reopenPageC,
  writeDisplayName,
  writeHeroCrop,
  writeShortPhrase,
} from "./hero-step";
import {
  commitA01,
  commitA02,
  commitA03,
  reopenA01,
  reopenA02,
  skipA02,
  writeAnnouncementText,
  writePrecision,
} from "./death-notice-step";
import {
  commitA04,
  commitA05,
  commitA06,
  commitA07,
  commitA08,
  skipA05,
  skipA06,
  skipA07,
  skipA08,
  writeCeremonyDate,
  writeCeremonyNote,
} from "./ceremony-step";
import { addTraditionsEntry, commitA09, skipA09 } from "./traditions-step";
import { commitPersonSheet, skipPersonSheet, writePersonWordsFieldText } from "./person-sheet-step";
import { commitA13, skipA13 } from "./gallery-step";

/**
 * Mission B02-L1 — a Builder save must never delete a `content.guidedFlow`
 * key this build does not know (B01 report, risk R4), while every
 * business read keeps filtering those keys out exactly as before.
 *
 * Every write path that touches the bag is exercised below against ONE
 * draft carrying unknown keys: each step's Continue/commit, each Skip,
 * each reopen, plus the field writes autosave persists and the autosave
 * controller itself.
 */

const MEDIA_ID = "cccccccc-cccc-4ccc-8ccc-000000000001";
const OTHER_MEDIA_ID = "cccccccc-cccc-4ccc-8ccc-000000000002";

function heroMedia(id = MEDIA_ID): Media {
  return {
    id,
    memorialId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    ownerId: "11111111-1111-4111-8111-111111111111",
    storagePath: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/${id}/original.jpg`,
    mediaType: "photo",
    purpose: "hero",
    status: "ready",
    mimeType: "image/jpeg",
    originalFilename: null,
    sizeBytes: 12345,
    width: null,
    height: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

/** Keys this build has never heard of — a future step record, an
 * arbitrary object, a bare string. None is a `StepId`. */
const UNKNOWN_ENTRIES: Record<string, unknown> = {
  A00: { status: "completed", answer: "yes" },
  R01: { status: "completed", answer: "0f3a9c21" },
  "future.meta": { nested: { version: 2 }, list: [1, 2, 3] },
  Z99: "free-form value",
};

/** Known-step records the per-step writes below need as preconditions
 * (A02 resolved for `commitA03`; A01/A02/T06 present so the reopens
 * have something to un-mark). */
const KNOWN_RECORDS: HumanFlowState = {
  T04: { status: "skipped" },
  T05: { status: "skipped" },
  T06: { status: "completed" },
  A01: { status: "completed" },
  A02: { status: "skipped" },
  A04: { status: "completed", answer: "yes" },
};

/** A draft in which every write path below can succeed: a complete
 * Hero (photo + crop), an announcement with one precision, a full
 * ceremony, one tradition, an empty gallery. */
const COMPLETE_DRAFT = {
  hero: {
    ...EMPTY_HERO_CONTENT,
    displayName: "Jeanne Dupont",
    photo: { mediaId: MEDIA_ID, crop: { focalX: 0.5, focalY: 0.5, zoom: 1 } },
  },
  deathNotice: {
    ...EMPTY_DEATH_NOTICE_CONTENT,
    announcementText: "C'est avec tristesse que nous annonçons son départ.",
    precisions: { ...EMPTY_DEATH_NOTICE_CONTENT.precisions, generalLocation: "Dans la région de Lyon" },
  },
  ceremony: {
    ...EMPTY_CEREMONY_CONTENT,
    date: "2026-03-14",
    time: "10:30",
    venueName: "Église Saint-Jean",
    address: "1 place de l'Église",
    note: "Stationnement sur la place.",
  },
  traditions: {
    ...EMPTY_TRADITIONS_CONTENT,
    entries: [
      { id: "fixture-entry-1", origin: "custom", suggestionId: null, title: null, text: "Une touche de bleu." },
    ],
  },
  personWords: { ...EMPTY_PERSON_WORDS_CONTENT, text: "Elle aimait rire." },
  lovedThings: { ...EMPTY_LOVED_THINGS_CONTENT },
  legacy: { ...EMPTY_LEGACY_CONTENT },
  gallery: { ...EMPTY_GALLERY_CONTENT },
} as unknown as MemorialContent;

function withBag(content: MemorialContent, bag: Record<string, unknown>): MemorialContent {
  return { ...content, guidedFlow: bag } as MemorialContent;
}

const DRAFT_WITH_UNKNOWN_KEYS = withBag(COMPLETE_DRAFT, { ...KNOWN_RECORDS, ...UNKNOWN_ENTRIES });

function storedBag(content: MemorialContent): Record<string, unknown> {
  return (content as { guidedFlow?: Record<string, unknown> }).guidedFlow ?? {};
}

function unknownPart(content: MemorialContent): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(storedBag(content)).filter(([key]) => !(STEP_IDS as readonly string[]).includes(key)),
  );
}

type WriteResult = { ok: true; content: MemorialContent } | { ok: false; reason: string };

function requireOk(result: WriteResult): MemorialContent {
  if (!result.ok) throw new Error(`expected a successful write, got "${result.reason}"`);
  return result.content;
}

// ---------------------------------------------------------------------
// writeGuidedFlowState / readGuidedFlowState — the contract itself
// ---------------------------------------------------------------------

describe("writeGuidedFlowState — unknown keys survive, known keys follow `flow`", () => {
  it("keeps every unknown-id entry of the stored bag, verbatim", () => {
    const written = writeGuidedFlowState(DRAFT_WITH_UNKNOWN_KEYS, { T05: { status: "completed" } });
    expect(unknownPart(written)).toEqual(UNKNOWN_ENTRIES);
  });

  it("writes exactly `flow` for known ids — an id absent from `flow` is removed, as before", () => {
    const written = writeGuidedFlowState(DRAFT_WITH_UNKNOWN_KEYS, { T05: { status: "completed" } });
    expect(readGuidedFlowState(written)).toEqual({ T05: { status: "completed" } });
    expect(storedBag(written)).toEqual({ ...UNKNOWN_ENTRIES, T05: { status: "completed" } });
  });

  it("still drops a malformed known-id record the caller did not carry over", () => {
    const content = withBag(COMPLETE_DRAFT, { T05: { status: "bogus" }, ...UNKNOWN_ENTRIES });
    const written = writeGuidedFlowState(content, { ...readGuidedFlowState(content) });
    expect(storedBag(written)).toEqual(UNKNOWN_ENTRIES);
  });

  it("leaves every other content key untouched", () => {
    const written = writeGuidedFlowState(DRAFT_WITH_UNKNOWN_KEYS, {});
    const { guidedFlow: _before, ...restBefore } = DRAFT_WITH_UNKNOWN_KEYS as Record<string, unknown>;
    const { guidedFlow: _after, ...restAfter } = written as Record<string, unknown>;
    expect(restAfter).toEqual(restBefore);
  });

  it("writes `flow` alone when no bag is stored yet, or the stored one is not a plain object", () => {
    for (const raw of [undefined, null, "corrupted", 42, ["A00"]]) {
      const content = { ...COMPLETE_DRAFT, guidedFlow: raw } as MemorialContent;
      expect(() => writeGuidedFlowState(content, { T05: { status: "skipped" } })).not.toThrow();
      expect(storedBag(writeGuidedFlowState(content, { T05: { status: "skipped" } }))).toEqual({
        T05: { status: "skipped" },
      });
    }
  });

  it("never mutates its input", () => {
    const snapshot = structuredClone(DRAFT_WITH_UNKNOWN_KEYS);
    writeGuidedFlowState(DRAFT_WITH_UNKNOWN_KEYS, { T05: { status: "completed" } });
    expect(DRAFT_WITH_UNKNOWN_KEYS).toEqual(snapshot);
  });

  it("survives a JSON round-trip (what the draft column actually stores)", () => {
    const written = writeGuidedFlowState(DRAFT_WITH_UNKNOWN_KEYS, { T05: { status: "completed" } });
    const reloaded = JSON.parse(JSON.stringify(written)) as MemorialContent;
    expect(unknownPart(reloaded)).toEqual(UNKNOWN_ENTRIES);
    expect(readGuidedFlowState(reloaded)).toEqual({ T05: { status: "completed" } });
  });

  it("keeps a stored `__proto__` key as an ordinary own property, never a prototype change", () => {
    const content = JSON.parse(
      JSON.stringify({ guidedFlow: { T05: { status: "skipped" } } }).replace(
        '"guidedFlow":{',
        '"guidedFlow":{"__proto__":{"polluted":true},',
      ),
    ) as MemorialContent;
    const bag = storedBag(writeGuidedFlowState(content, readGuidedFlowState(content)));
    expect(Object.prototype.hasOwnProperty.call(bag, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(bag)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("readGuidedFlowState — business reads still filter unknown keys (unchanged)", () => {
  it("returns only well-formed known-step records", () => {
    expect(readGuidedFlowState(DRAFT_WITH_UNKNOWN_KEYS)).toEqual(KNOWN_RECORDS);
  });

  it("returns no unknown id even after a write preserved them", () => {
    const written = writeGuidedFlowState(DRAFT_WITH_UNKNOWN_KEYS, readGuidedFlowState(DRAFT_WITH_UNKNOWN_KEYS));
    for (const key of Object.keys(readGuidedFlowState(written))) {
      expect(STEP_IDS as readonly string[]).toContain(key);
    }
    expect(readGuidedFlowState(written)).toEqual(KNOWN_RECORDS);
  });
});

// ---------------------------------------------------------------------
// Every per-step write path — validation, skip, reopen
// ---------------------------------------------------------------------

const media = heroMedia();

const STEP_WRITES: ReadonlyArray<[string, (content: MemorialContent) => WriteResult]> = [
  // Hero — T03-T08
  ["commitPageA (T04)", commitPageA],
  ["commitPageB (T05)", commitPageB],
  ["commitPageC (T06)", (c) => commitPageC(c, media)],
  ["commitPageD (T07)", (c) => commitPageD(c, media)],
  ["commitPageE (T08)", (c) => commitPageE(c, media)],
  ["reopenPageC (T06)", reopenPageC],
  // Avis de décès — A01-A03
  ["commitA01", commitA01],
  ["commitA02", commitA02],
  ["skipA02", skipA02],
  ["commitA03", commitA03],
  ["reopenA01", reopenA01],
  ["reopenA02", reopenA02],
  // Cérémonie — A04-A08
  ["commitA04", (c) => commitA04(c, "yes")],
  ["commitA05", commitA05],
  ["skipA05", skipA05],
  ["commitA06", commitA06],
  ["skipA06", skipA06],
  ["commitA07", commitA07],
  ["skipA07", skipA07],
  ["commitA08", commitA08],
  ["skipA08", skipA08],
  // Traditions — A09
  ["commitA09", commitA09],
  ["skipA09", skipA09],
  // Fiche — A10-A12
  ["commitPersonSheet (A10-A12)", commitPersonSheet],
  ["skipPersonSheet (A10-A12)", skipPersonSheet],
  // Galerie — A13
  ["commitA13", commitA13],
  ["skipA13", skipA13],
];

describe("every validation / skip / reopen keeps the unknown keys", () => {
  it.each(STEP_WRITES)("%s", (_label, write) => {
    const written = requireOk(write(DRAFT_WITH_UNKNOWN_KEYS));
    expect(unknownPart(written)).toEqual(UNKNOWN_ENTRIES);
    for (const key of Object.keys(readGuidedFlowState(written))) {
      expect(STEP_IDS as readonly string[]).toContain(key);
    }
  });

  it("a reopen still removes the step it un-marks — only that step, never an unknown key", () => {
    const reopened = requireOk(reopenA01(DRAFT_WITH_UNKNOWN_KEYS));
    expect(readGuidedFlowState(reopened).A01).toBeUndefined();
    expect(readGuidedFlowState(reopened).A02).toEqual({ status: "skipped" });
    expect(unknownPart(reopened)).toEqual(UNKNOWN_ENTRIES);
  });

  it("a whole chain of successive writes keeps them too", () => {
    let content = DRAFT_WITH_UNKNOWN_KEYS;
    for (const [, write] of STEP_WRITES) content = requireOk(write(content));
    expect(unknownPart(content)).toEqual(UNKNOWN_ENTRIES);
  });
});

// ---------------------------------------------------------------------
// Autosave — the field writes it persists, and the controller itself
// ---------------------------------------------------------------------

const FIELD_WRITES: ReadonlyArray<[string, (content: MemorialContent) => WriteResult]> = [
  ["writeDisplayName", (c) => writeDisplayName(c, "Jeanne Martin")],
  ["writeShortPhrase", (c) => writeShortPhrase(c, "Toujours dans nos cœurs")],
  ["writeHeroCrop", (c) => writeHeroCrop(c, { focalX: 0.4, focalY: 0.6, zoom: 1.2 })],
  ["reconcileHeroPhotoMedia", (c) => reconcileHeroPhotoMedia(c, [heroMedia(OTHER_MEDIA_ID)])],
  ["writeAnnouncementText", (c) => writeAnnouncementText(c, "Un nouveau texte.")],
  ["writePrecision", (c) => writePrecision(c, "thought", "Une pensée.")],
  ["writeCeremonyDate", (c) => writeCeremonyDate(c, "2026-03-15")],
  ["writeCeremonyNote", (c) => writeCeremonyNote(c, "Une autre note.")],
  [
    "addTraditionsEntry",
    (c) =>
      addTraditionsEntry(c, {
        id: "fixture-entry-2",
        origin: "custom",
        suggestionId: null,
        title: null,
        text: "Des fleurs blanches.",
      }),
  ],
  ["writePersonWordsFieldText", (c) => writePersonWordsFieldText(c, "Elle chantait souvent.")],
];

describe("autosaved field writes leave the whole bag untouched", () => {
  it.each(FIELD_WRITES)("%s", (_label, write) => {
    const written = requireOk(write(DRAFT_WITH_UNKNOWN_KEYS));
    expect(storedBag(written)).toEqual(storedBag(DRAFT_WITH_UNKNOWN_KEYS));
  });
});

describe("the autosave controller persists the unknown keys it was handed", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounced save then flush both send the bag intact", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    const controller = createAutosaveController({ persist, debounceMs: 50 });

    controller.notifyContentChanged(requireOk(writeDisplayName(DRAFT_WITH_UNKNOWN_KEYS, "Jeanne Martin")));
    await vi.advanceTimersByTimeAsync(50);
    controller.notifyContentChanged(requireOk(commitPageA(DRAFT_WITH_UNKNOWN_KEYS)));
    await controller.flush();

    expect(persist).toHaveBeenCalledTimes(2);
    for (const [saved] of persist.mock.calls as [MemorialContent][]) {
      expect(unknownPart(saved)).toEqual(UNKNOWN_ENTRIES);
    }
    controller.destroy();
  });
});
