import { describe, expect, it } from "vitest";
import { needsA01, needsA02, needsA03 } from "@/lib/builder/guided-flow/death-notice-step";
import {
  needsPageA,
  needsPageB,
  needsPageC,
  needsPageD,
  needsPageE,
  readHeroForEditing,
} from "@/lib/builder/guided-flow/hero-step";
import {
  QG_RUNTIME_DEMO_ANNOUNCEMENT_TEXT,
  QG_RUNTIME_DEMO_BIRTH,
  QG_RUNTIME_DEMO_DEATH,
  QG_RUNTIME_DEMO_MEDIA,
  QG_RUNTIME_DEMO_NAME_LONG,
  QG_RUNTIME_DEMO_NAME_NORMAL,
  QG_RUNTIME_DEMO_PRECISIONS,
  applyQgRuntimeDemoAnnouncement,
  applyQgRuntimeDemoPrecisions,
  buildQgRuntimeDemoContent,
  buildQgRuntimeDemoContentThroughA03,
} from "./qg-runtime-demo";

/**
 * QG Runtime Demo (mini-mission before Mission 040) — the demo page
 * itself (app/builder/demo/page.tsx) is a "use client" component with no
 * server-render seam worth unit-testing on its own; what actually needs
 * proving is that this module's fixture composition genuinely reaches
 * the same states the real Guided Flow gates
 * (lib/builder/guided-flow/{hero,death-notice}-step.ts) expect, using
 * ONLY those real, exported functions — never a hand-shaped
 * `content.guidedFlow`/`content.hero` object.
 */
describe("qg-runtime-demo", () => {
  it("pre-fills the Hero (name, dates) and pre-completes T06/T07 (photo, crop), but leaves PAGE A/B/E genuinely open", () => {
    const content = buildQgRuntimeDemoContent({
      displayName: QG_RUNTIME_DEMO_NAME_NORMAL,
      birth: QG_RUNTIME_DEMO_BIRTH,
      death: QG_RUNTIME_DEMO_DEATH,
    });

    // PAGE A/PAGE B must still be real, walkable screens — never silently
    // pre-committed — so the QG Runtime Demo page actually shows
    // HeroIdentityStep/HeroPhraseStep, pre-filled with this scenario.
    expect(needsPageA(content)).toBe(true);
    expect(needsPageB(content)).toBe(false); // needsPageB itself gates on needsPageA
    // The photo/crop pair is the one thing that MUST be pre-completed
    // (no real Storage to upload through in this demo).
    expect(needsPageC(content)).toBe(false);
    expect(needsPageD(content)).toBe(false);
    expect(needsPageE(content)).toBe(false); // also gated behind needsPageA

    const read = readHeroForEditing(content);
    expect(read.status).toBe("ready");
    if (read.status === "ready") {
      expect(read.hero.displayName).toBe(QG_RUNTIME_DEMO_NAME_NORMAL);
      expect(read.hero.photo?.mediaId).toBe(QG_RUNTIME_DEMO_MEDIA.id);
      expect(read.hero.photo?.crop).not.toBeNull();
    }
  });

  it("accepts the long-name scenario the same way (nom long test case)", () => {
    const content = buildQgRuntimeDemoContent({
      displayName: QG_RUNTIME_DEMO_NAME_LONG,
      birth: QG_RUNTIME_DEMO_BIRTH,
      death: QG_RUNTIME_DEMO_DEATH,
    });

    expect(needsPageA(content)).toBe(true);
    const read = readHeroForEditing(content);
    expect(read.status).toBe("ready");
    if (read.status === "ready") {
      expect(read.hero.displayName).toBe(QG_RUNTIME_DEMO_NAME_LONG);
    }
  });

  it("applyQgRuntimeDemoAnnouncement/applyQgRuntimeDemoPrecisions write through the real A01/A02 fields", () => {
    let content = buildQgRuntimeDemoContent({ displayName: QG_RUNTIME_DEMO_NAME_NORMAL });
    content = applyQgRuntimeDemoAnnouncement(content, QG_RUNTIME_DEMO_ANNOUNCEMENT_TEXT);
    content = applyQgRuntimeDemoPrecisions(content, QG_RUNTIME_DEMO_PRECISIONS);

    // Writing the fields alone is never itself a commit (mission brief's
    // "données présentes != étape validée" doctrine) — A01/A02 must still
    // report incomplete until their own commit function runs.
    expect(needsA01(content)).toBe(true);
  });

  it("buildQgRuntimeDemoContentThroughA03 lands exactly on needsA03 === true with every earlier gate satisfied", () => {
    const content = buildQgRuntimeDemoContentThroughA03({
      displayName: QG_RUNTIME_DEMO_NAME_NORMAL,
      birth: QG_RUNTIME_DEMO_BIRTH,
      death: QG_RUNTIME_DEMO_DEATH,
    });

    expect(needsPageA(content)).toBe(false);
    expect(needsPageB(content)).toBe(false);
    expect(needsPageC(content)).toBe(false);
    expect(needsPageD(content)).toBe(false);
    expect(needsPageE(content)).toBe(false);
    expect(needsA01(content)).toBe(false);
    expect(needsA02(content)).toBe(false);
    expect(needsA03(content)).toBe(true);
  });
});
