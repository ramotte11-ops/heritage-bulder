import { describe, expect, it } from "vitest";
import type { MemorialContent } from "@/types/memorial";
import { SECTION_IDS } from "@/config/sections";
import { SECTION_RENDERERS } from "@/config/memorial-section-renderers";
import { composeMemorial } from "@/lib/memorial/composition/compose-memorial";
import { assembleMemorial } from "@/lib/memorial/assembly/assemble-memorial";
import { fullAnnouncement, recordingResolver, throughA02, throughA03 } from "@/lib/memorial/assembly/test-fixtures";
import { commitA00 } from "@/lib/builder/guided-flow/announcement-choice-step";
import { commitA04 } from "@/lib/builder/guided-flow/ceremony-step";
import { en } from "@/lib/i18n/dictionaries/en";
import { es } from "@/lib/i18n/dictionaries/es";
import { fr } from "@/lib/i18n/dictionaries/fr";
import {
  ARCHIVABLE_SECTIONS,
  isHideableSection,
  readHiddenSections,
  setSectionVisibility,
  withStoredPresentation,
} from "./section-visibility";
import { resolveVisibilityEntries } from "./visibility-entries";

/**
 * « Gérer les rubriques visibles » — the model, the composition, the
 * assembly and the protected save, on real drafts built through the
 * real Guided Flow commits.
 */

function ok(result: { ok: true; content: MemorialContent } | { ok: false }): MemorialContent {
  if (!result.ok) throw new Error("fixture refused");
  return result.content;
}
const hide = (content: MemorialContent, ...ids: Parameters<typeof setSectionVisibility>[1][]) =>
  ids.reduce((c, id) => ok(setSectionVisibility(c, id, false, "intemporel")), content);
const compose = (content: MemorialContent) => composeMemorial({ skin: "intemporel", skinVariant: "light", content });
const stateOf = (content: MemorialContent, id: string) => compose(content).sections.find((s) => s.sectionId === id)?.state;

describe("the model", () => {
  it("reads nothing hidden on every existing draft (no presentation key)", () => {
    expect(readHiddenSections(fullAnnouncement())).toEqual([]);
    expect(readHiddenSections({})).toEqual([]);
  });

  it("a malformed value never hides anything by accident", () => {
    for (const presentation of [null, "x", [], { hiddenSections: "ceremony" }, { hiddenSections: [1, "nope", "hero"] }]) {
      expect(readHiddenSections({ presentation } as unknown as MemorialContent)).toEqual([]);
    }
  });

  it("the Hero can never be hidden; a section without a renderer cannot either (yet)", () => {
    expect(isHideableSection("hero", "intemporel")).toBe(false);
    expect(setSectionVisibility(fullAnnouncement(), "hero", false, "intemporel")).toEqual({ ok: false, reason: "notHideable" });
    expect(isHideableSection("traditions", "intemporel")).toBe(false);
    expect(isHideableSection("ceremony", null)).toBe(false);
    for (const id of ["deathNotice", "ceremony", "story", "gallery"] as const) {
      expect(isHideableSection(id, "intemporel")).toBe(true);
    }
  });

  it("hiding touches nothing but presentation; showing again restores the exact content", () => {
    const base = fullAnnouncement();
    const hidden = hide(base, "ceremony", "deathNotice");
    expect(readHiddenSections(hidden)).toEqual(["deathNotice", "ceremony"]);
    const { presentation, ...rest } = hidden as Record<string, unknown>;
    expect(presentation).toBeDefined();
    expect(rest).toEqual(base);
    const shown = ok(setSectionVisibility(ok(setSectionVisibility(hidden, "ceremony", true, "intemporel")), "deathNotice", true, "intemporel"));
    expect(readHiddenSections(shown)).toEqual([]);
    expect({ ...shown, presentation: undefined }).toEqual({ ...base, presentation: undefined });
  });

  it("is idempotent and keeps catalog order", () => {
    const twice = hide(fullAnnouncement(), "gallery", "story", "gallery");
    expect(readHiddenSections(twice)).toEqual(["story", "gallery"]);
  });
});

describe("the protected save (withStoredPresentation)", () => {
  it("keeps the stored presentation over a stale client copy", () => {
    const stored = hide(fullAnnouncement(), "ceremony");
    const staleClient = fullAnnouncement();
    expect(readHiddenSections(withStoredPresentation(staleClient, stored))).toEqual(["ceremony"]);
  });

  it("ignores a client-sent presentation when nothing is stored", () => {
    const client = hide(fullAnnouncement(), "gallery");
    expect(readHiddenSections(withStoredPresentation(client, fullAnnouncement()))).toEqual([]);
    expect(readHiddenSections(withStoredPresentation(client, null))).toEqual([]);
  });

  it("never touches any other key", () => {
    const client = fullAnnouncement();
    const out = withStoredPresentation(client, hide(throughA03(), "deathNotice"));
    const { presentation, ...rest } = out as Record<string, unknown>;
    expect(presentation).toEqual({ hiddenSections: ["deathNotice"] });
    expect(rest).toEqual(client);
  });
});

describe("the composition — the Preview (and later the published page) respects it", () => {
  it("a hidden ready section is `hidden`, never `renderable`; its content is untouched", () => {
    const content = hide(fullAnnouncement(), "story");
    expect(stateOf(content, "story")).toBe("hidden");
    expect(compose(content).renderable).not.toContain("story");
    expect(compose(content).renderable).toContain("hero");
  });

  it("death notice and ceremony, hidden, are archived (consultable); story and gallery are not", () => {
    const content = hide(fullAnnouncement(), "deathNotice", "ceremony", "story");
    expect(compose(content).archived).toEqual(["deathNotice", "ceremony"]);
  });

  it("never archives a section that does not apply or was never filled in", () => {
    // A00 = Non: the death notice does not apply — hiding it archives nothing.
    const no = hide(ok(commitA00(throughA03(), "no")), "deathNotice");
    expect(stateOf(no, "deathNotice")).toBe("notRelevant");
    expect(compose(no).archived).toEqual([]);
    // A04 = Non: no ceremony to archive.
    const noCeremony = hide(ok(commitA04(ok(commitA00(throughA03(), "yes")), "no")), "ceremony");
    expect(compose(noCeremony).archived).toEqual([]);
    // Notice not verified yet (A03 pending): nothing filled in to consult.
    const pending = hide(throughA02(), "deathNotice");
    expect(stateOf(pending, "deathNotice")).toBe("pending");
    expect(compose(pending).archived).toEqual([]);
  });

  it("A00 = Plus tard: no notice, no archive; « Oui » again brings back the family's choice", () => {
    const later = hide(ok(commitA00(throughA03(), "later")), "deathNotice");
    expect(compose(later).archived).toEqual([]);
    const yes = ok(commitA00(later, "yes"));
    expect(stateOf(yes, "deathNotice")).toBe("hidden");
    expect(compose(yes).archived).toEqual(["deathNotice"]);
  });

  it("nothing expires: the choice is the same whatever the date", () => {
    const content = hide(fullAnnouncement(), "ceremony");
    expect(JSON.stringify((content as { presentation: unknown }).presentation)).not.toMatch(/\d{4}-\d{2}/);
  });
});

describe("the assembly", () => {
  it("assembles archived sections apart from the flow — never in it", async () => {
    const content = hide(fullAnnouncement(), "deathNotice", "story");
    const assembled = await assembleMemorial(
      { skin: "intemporel", skinVariant: "light", language: "fr", content },
      { resolveMedia: recordingResolver().resolve },
    );
    expect(assembled.status).toBe("assembled");
    expect(assembled.sections.map((s) => s.sectionId)).toEqual(["hero", "ceremony"]);
    expect(assembled.archivedSections.map((s) => s.sectionId)).toEqual(["deathNotice"]);
  });

  it("an unchanged draft assembles exactly as before (no archive)", async () => {
    const assembled = await assembleMemorial(
      { skin: "intemporel", skinVariant: "light", language: "fr", content: fullAnnouncement() },
      { resolveMedia: recordingResolver().resolve },
    );
    expect(assembled.sections.map((s) => s.sectionId)).toEqual(["hero", "deathNotice", "ceremony", "story"]);
    expect(assembled.archivedSections).toEqual([]);
  });
});

describe("the rows of « Gérer les rubriques visibles »", () => {
  it("lists the memorial's own hideable sections — never the Hero, never one that does not apply", () => {
    const rows = resolveVisibilityEntries(compose(hide(fullAnnouncement(), "ceremony")));
    expect(rows.map((r) => r.sectionId)).toEqual(["deathNotice", "ceremony", "story"]);
    expect(rows.find((r) => r.sectionId === "ceremony")).toEqual({ sectionId: "ceremony", hidden: true, ready: true, archivable: true });
    expect(rows.find((r) => r.sectionId === "story")?.archivable).toBe(false);

    const no = resolveVisibilityEntries(compose(ok(commitA00(throughA03(), "no"))));
    expect(no.map((r) => r.sectionId)).not.toContain("deathNotice");
  });

  it("a section still being filled in is listed as not ready (it can be hidden in advance)", () => {
    const rows = resolveVisibilityEntries(compose(ok(commitA04(throughA03(), "yes"))));
    expect(rows.find((r) => r.sectionId === "ceremony")).toMatchObject({ ready: false, hidden: false });
  });
});

describe("every section that can ever be hidden or archived has its words, in three languages", () => {
  it("visibility labels for every section but the Hero; archive links for archivable sections", () => {
    for (const dictionary of [fr, en, es]) {
      for (const id of SECTION_IDS.filter((id) => id !== "hero")) {
        expect(dictionary[`visibility.section.${id}` as keyof typeof dictionary], id).toBeTruthy();
      }
      for (const id of ARCHIVABLE_SECTIONS) {
        expect(dictionary[`memorial.archive.${id}` as keyof typeof dictionary], id).toBeTruthy();
      }
    }
    // The registry is what makes a section hideable: when Traditions gets
    // its renderer it joins with no other change.
    expect(Object.keys(SECTION_RENDERERS)).not.toContain("traditions");
  });
});
