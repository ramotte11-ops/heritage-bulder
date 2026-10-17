import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { MemorialContent } from "@/types/memorial";
import { applicableSteps } from "./engine";
import { humanFlowDefinition, isA14InRoute, STEPS, type HumanFlowState } from "./human-steps";
import { readGuidedFlowState } from "./flow-state";
import { JOURNEY_SCREEN_IDS, JOURNEY_SCREENS } from "./journey";
import {
  addCeremonyProgrammeMoment,
  commitA04,
  commitA14,
  isA14Resolved,
  moveCeremonyProgrammeMoment,
  needsA08,
  needsA14,
  readCeremonyProgrammeForEditing,
  removeCeremonyProgrammeMoment,
  repairCeremonyProgramme,
  skipA05,
  skipA06,
  skipA07,
  skipA14,
  updateCeremonyProgrammeMoment,
} from "./ceremony-step";

/**
 * Cérémonie V2 (B2) — A14 « Le déroulement de la cérémonie »: the step
 * functions and its C5 insertion in the active route.
 */

function ok(result: { ok: true; content: MemorialContent } | { ok: false; reason: string }): MemorialContent {
  if (!result.ok) throw new Error(`test fixture: unexpected refusal (${result.reason})`);
  return result.content;
}

const PLANNED = ok(commitA04({}, "yes"));
const AFTER_A07 = ok(skipA07(ok(skipA06(ok(skipA05(PLANNED))))));

function withMoments(content: MemorialContent, ...labels: string[]): MemorialContent {
  return labels.reduce(
    (current, label, index) =>
      ok(addCeremonyProgrammeMoment(current, { id: `m${index + 1}`, time: null, label, detail: null })),
    content,
  );
}

function labels(content: MemorialContent): string[] {
  const read = readCeremonyProgrammeForEditing(content);
  if (read.status !== "ready") throw new Error("test fixture: corrupted ceremony");
  return read.moments.map((moment) => moment.label);
}

const DAMAGED: MemorialContent = {
  ...PLANNED,
  ceremony: {
    date: null,
    time: null,
    venueName: null,
    address: null,
    access: null,
    note: null,
    programme: [
      { id: "m1", time: null, label: "Accueil", detail: null },
      { id: "m2", time: "25:99", label: "Illisible", detail: null },
    ],
  },
};

const CORRUPTED: MemorialContent = {
  ...PLANNED,
  ceremony: { venueName: "Église", cause: "x" } as unknown as MemorialContent["ceremony"],
};

describe("A14 — lecture pour l'édition", () => {
  it("a ceremony without programme reads as an intact, empty déroulement", () => {
    expect(readCeremonyProgrammeForEditing({})).toEqual({ status: "ready", moments: [], intact: true });
    expect(readCeremonyProgrammeForEditing(PLANNED)).toEqual({ status: "ready", moments: [], intact: true });
  });

  it("a damaged déroulement shows its readable moments and says it is not intact", () => {
    const read = readCeremonyProgrammeForEditing(DAMAGED);
    expect(read).toMatchObject({ status: "ready", intact: false });
    expect(labels(DAMAGED)).toEqual(["Accueil"]);
  });

  it("a corrupted ceremony stays visible as corrupted", () => {
    expect(readCeremonyProgrammeForEditing(CORRUPTED)).toEqual({ status: "corrupted" });
  });
});

describe("A14 — ajouter / modifier / supprimer / déplacer", () => {
  it("adds confirmed moments at the end, in the family's order", () => {
    const content = withMoments(PLANNED, "Accueil", "Cérémonie", "Verre de l'amitié");
    expect(labels(content)).toEqual(["Accueil", "Cérémonie", "Verre de l'amitié"]);
  });

  it("keeps the other ceremony fields and the guided flow untouched", () => {
    const content = withMoments({ ...PLANNED, ceremony: { ...readCeremonyFields(), venueName: "Église" } }, "Accueil");
    expect(content.ceremony).toMatchObject({ venueName: "Église" });
    expect(readGuidedFlowState(content)).toEqual(readGuidedFlowState(PLANNED));
  });

  it("refuses a blank title, an invalid time and a duplicate id — content unchanged", () => {
    const content = withMoments(PLANNED, "Accueil");
    expect(addCeremonyProgrammeMoment(content, { id: "x", time: null, label: "  ", detail: null })).toEqual({
      ok: false,
      reason: "label",
    });
    expect(addCeremonyProgrammeMoment(content, { id: "x", time: "9h", label: "Messe", detail: null })).toEqual({
      ok: false,
      reason: "time",
    });
    expect(addCeremonyProgrammeMoment(content, { id: "m1", time: null, label: "Messe", detail: null })).toEqual({
      ok: false,
      reason: "duplicateId",
    });
  });

  it("stores the optional time and precision, trimmed", () => {
    const content = ok(
      addCeremonyProgrammeMoment(PLANNED, { id: "a", time: "14:30", label: " Accueil ", detail: " Salle paroissiale " }),
    );
    const read = readCeremonyProgrammeForEditing(content);
    expect(read.status === "ready" && read.moments).toEqual([
      { id: "a", time: "14:30", label: "Accueil", detail: "Salle paroissiale" },
    ]);
  });

  it("edits a moment in place, never its position", () => {
    const content = ok(
      updateCeremonyProgrammeMoment(withMoments(PLANNED, "Accueil", "Cérémonie"), "m1", {
        time: "10:00",
        label: "Accueil des proches",
        detail: null,
      }),
    );
    expect(labels(content)).toEqual(["Accueil des proches", "Cérémonie"]);
  });

  it("refuses to edit an unknown moment", () => {
    expect(updateCeremonyProgrammeMoment(withMoments(PLANNED, "Accueil"), "nope", { label: "x" })).toEqual({
      ok: false,
      reason: "id",
    });
  });

  it("removes a moment; removing the last one leaves no empty list behind", () => {
    const two = withMoments(PLANNED, "Accueil", "Cérémonie");
    expect(labels(ok(removeCeremonyProgrammeMoment(two, "m1")))).toEqual(["Cérémonie"]);
    const none = ok(removeCeremonyProgrammeMoment(ok(removeCeremonyProgrammeMoment(two, "m1")), "m2"));
    expect(none.ceremony).not.toHaveProperty("programme");
  });

  it("moves a moment up and down; at either end nothing changes", () => {
    const three = withMoments(PLANNED, "A", "B", "C");
    expect(labels(ok(moveCeremonyProgrammeMoment(three, "m3", "up")))).toEqual(["A", "C", "B"]);
    expect(labels(ok(moveCeremonyProgrammeMoment(three, "m1", "down")))).toEqual(["B", "A", "C"]);
    expect(labels(ok(moveCeremonyProgrammeMoment(three, "m1", "up")))).toEqual(["A", "B", "C"]);
    expect(labels(ok(moveCeremonyProgrammeMoment(three, "m3", "down")))).toEqual(["A", "B", "C"]);
  });

  it("refuses every write on a corrupted ceremony", () => {
    const input = { id: "a", time: null, label: "Accueil", detail: null };
    expect(addCeremonyProgrammeMoment(CORRUPTED, input)).toEqual({ ok: false, reason: "corrupted" });
    expect(updateCeremonyProgrammeMoment(CORRUPTED, "a", { label: "x" })).toEqual({ ok: false, reason: "corrupted" });
    expect(removeCeremonyProgrammeMoment(CORRUPTED, "a")).toEqual({ ok: false, reason: "corrupted" });
    expect(moveCeremonyProgrammeMoment(CORRUPTED, "a", "up")).toEqual({ ok: false, reason: "corrupted" });
    expect(repairCeremonyProgramme(CORRUPTED)).toEqual({ ok: false, reason: "corrupted" });
  });
});

describe("A14 — déroulement endommagé (arbitrage B1)", () => {
  it("refuses edits explicitly instead of silently not applying them", () => {
    const input = { id: "new", time: null, label: "Messe", detail: null };
    expect(addCeremonyProgrammeMoment(DAMAGED, input)).toEqual({ ok: false, reason: "programmeDamaged" });
    expect(removeCeremonyProgrammeMoment(DAMAGED, "m1")).toEqual({ ok: false, reason: "programmeDamaged" });
    expect(moveCeremonyProgrammeMoment(DAMAGED, "m1", "down")).toEqual({ ok: false, reason: "programmeDamaged" });
    expect(updateCeremonyProgrammeMoment(DAMAGED, "m1", { label: "x" })).toEqual({
      ok: false,
      reason: "programmeDamaged",
    });
  });

  it("the explicit repair keeps the readable moments, then edits work again", () => {
    const repaired = ok(repairCeremonyProgramme(DAMAGED));
    expect(readCeremonyProgrammeForEditing(repaired)).toMatchObject({ status: "ready", intact: true });
    expect(labels(repaired)).toEqual(["Accueil"]);
    expect(labels(ok(addCeremonyProgrammeMoment(repaired, { id: "n", time: null, label: "Messe", detail: null })))).toEqual([
      "Accueil",
      "Messe",
    ]);
  });
});

describe("A14 — Continuer / Passer", () => {
  it("Continue requires at least one confirmed moment", () => {
    expect(commitA14(PLANNED)).toEqual({ ok: false, reason: "programme" });
    const committed = ok(commitA14(withMoments(PLANNED, "Accueil")));
    expect(readGuidedFlowState(committed).A14).toEqual({ status: "completed" });
    expect(isA14Resolved(committed)).toBe(true);
  });

  it("Continue refuses a damaged déroulement until it is repaired", () => {
    expect(commitA14(DAMAGED)).toEqual({ ok: false, reason: "programmeDamaged" });
  });

  it("Skip never touches the ceremony — confirmed moments are kept", () => {
    const content = withMoments(PLANNED, "Accueil");
    const skipped = ok(skipA14(content));
    expect(readGuidedFlowState(skipped).A14).toEqual({ status: "skipped" });
    expect(skipped.ceremony).toEqual(content.ceremony);
    expect(isA14Resolved(skipped)).toBe(true);
  });

  it("Skip works with nothing entered and writes no programme", () => {
    const skipped = ok(skipA14(PLANNED));
    expect(skipped.ceremony ?? {}).not.toHaveProperty("programme");
  });

  it("both refuse on a corrupted ceremony", () => {
    expect(commitA14(CORRUPTED)).toEqual({ ok: false, reason: "corrupted" });
    expect(skipA14(CORRUPTED)).toEqual({ ok: false, reason: "corrupted" });
  });
});

describe("A14 — C5 gate", () => {
  it("is ready once A07 is behind a family who planned a ceremony, until A14 is treated", () => {
    expect(needsA14(PLANNED)).toBe(false);
    expect(needsA14(AFTER_A07)).toBe(true);
    expect(needsA14(ok(skipA14(AFTER_A07)))).toBe(false);
    expect(needsA14(ok(commitA04({}, "no")))).toBe(false);
  });
});

describe("A14 — active route", () => {
  const flow = humanFlowDefinition();
  const YES: HumanFlowState = { A04: { status: "completed", answer: "yes" } };
  const NO: HumanFlowState = { A04: { status: "completed", answer: "no" } };

  it("is declared between A07 and A08 and applies exactly when A04 = yes", () => {
    const ids = STEPS.map((step) => step.id);
    expect(ids.indexOf("A14")).toBe(ids.indexOf("A07") + 1);
    expect(ids.indexOf("A08")).toBe(ids.indexOf("A14") + 1);
    expect(isA14InRoute(YES)).toBe(true);
    expect(isA14InRoute(NO)).toBe(false);
    expect(applicableSteps(flow, YES).map((s) => s.id)).toContain("A14");
    expect(applicableSteps(flow, NO).map((s) => s.id)).not.toContain("A14");
  });

  it("A08 waits for A14", () => {
    expect(needsA08(AFTER_A07)).toBe(false);
    expect(needsA08(ok(skipA14(AFTER_A07)))).toBe(true);
  });

  it("« Mon parcours » exposes A14 between A07 and A08", () => {
    const ids = JOURNEY_SCREEN_IDS as readonly string[];
    expect(ids.indexOf("ceremonyProgramme")).toBe(ids.indexOf("ceremonyAddress") + 1);
    expect(ids.indexOf("ceremonyNote")).toBe(ids.indexOf("ceremonyProgramme") + 1);
    expect(JOURNEY_SCREENS.map((screen) => screen.id)).toContain("ceremonyProgramme");
  });

  it("the Builder route evaluates needsA14 and renders the A14 screen", () => {
    const page = readFileSync(join(process.cwd(), "app/builder/[memorialId]/page.tsx"), "utf8");
    expect(page).toContain("needsA14");
    expect(page).toContain("CeremonyProgrammeStep");
  });
});

function readCeremonyFields() {
  return { date: null, time: null, venueName: null, address: null, access: null, note: null };
}
