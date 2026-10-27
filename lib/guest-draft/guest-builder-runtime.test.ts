import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { commitA00 } from "@/lib/builder/guided-flow/announcement-choice-step";
import { commitPageA, commitPageB, writeDisplayName } from "@/lib/builder/guided-flow/hero-step";
import { commitWelcome } from "@/lib/builder/guided-flow/welcome-step";
import { createGuestDraftV3, updateGuestDraftV3, type GuestDraftV3 } from "./guest-draft-v3";
import type { MemorialContent } from "@/types/memorial";
import type { GuestDraftV3ReadResult, GuestDraftV3WriteResult } from "./guest-draft-v3-store";
import {
  GUEST_BUILDER_V1_SKIN,
  GuestBuilderRuntimeError,
  createGuestDraftSaveTransport,
  loadOrCreateGuestDraft,
  resolveGuestBuilderStage,
  resolveGuestPostHeroScreen,
  saveGuestDraftLanguage,
  type GuestBuilderDraftStore,
} from "./guest-builder-runtime";

const T0 = "2026-10-26T08:00:00.000Z";
const T1 = "2026-10-26T08:01:00.000Z";

class MemoryStore implements GuestBuilderDraftStore {
  value: GuestDraftV3 | null = null;
  failNext: GuestDraftV3WriteResult | null = null;

  async read(): Promise<GuestDraftV3ReadResult> {
    return this.value === null
      ? { status: "empty" }
      : { status: "ready", draft: structuredClone(this.value) };
  }

  async save(draft: GuestDraftV3, expectedRevision: number | null): Promise<GuestDraftV3WriteResult> {
    if (this.failNext !== null) {
      const result = this.failNext;
      this.failNext = null;
      return result;
    }
    if (expectedRevision === null) {
      if (this.value !== null) return { ok: false, reason: "revision_conflict" };
    } else if (this.value?.revision !== expectedRevision) {
      return { ok: false, reason: "revision_conflict" };
    }
    this.value = structuredClone(draft);
    return { ok: true };
  }
}

function draft(): GuestDraftV3 {
  const result = createGuestDraftV3({
    draftId: "guest-draft-stable",
    transferKey: "guest-transfer-stable",
    now: T0,
  });
  if (!result.ok) throw new Error(result.reason);
  return result.draft;
}

function postHeroDraft(
  answer: "yes" | "no" | "later",
  extraFlow: Record<string, unknown> = {},
): GuestDraftV3 {
  return {
    ...draft(),
    language: "fr",
    skinVariant: "light",
    content: {
      hero: { displayName: "Jeanne Dupont", birth: null, death: null, shortPhrase: null, photo: null },
      guidedFlow: {
        T04: { status: "skipped" },
        A00: { status: answer === "later" ? "skipped" : "completed", answer },
        T05: { status: "skipped" },
        T06: { status: "completed" },
        T07: { status: "completed" },
        T08: { status: "completed" },
        ...extraFlow,
      },
    } as MemorialContent,
    photos: [{
      localId: "local-hero",
      placement: { purpose: "hero", crop: { focalX: 0.5, focalY: 0.5, zoom: 1 } },
    }],
  };
}

describe("guest Builder local runtime", () => {
  it("centralizes the fixed V1 cultural skin independently from Light/Dark", () => {
    expect(GUEST_BUILDER_V1_SKIN).toBe("intemporel");
    expect(postHeroDraft("no").skinVariant).toBe("light");
    expect({ ...postHeroDraft("no"), skinVariant: "dark" as const }.skinVariant).toBe("dark");
  });

  it("creates one active V3 draft and resumes the same identifiers after reload", async () => {
    const store = new MemoryStore();
    const ids = ["draft-created-once", "transfer-created-once"];
    const first = await loadOrCreateGuestDraft({ store, createId: () => ids.shift()!, now: () => T0 });
    const reloaded = await loadOrCreateGuestDraft({
      store,
      createId: () => {
        throw new Error("must not regenerate identifiers");
      },
      now: () => T1,
    });

    expect(reloaded).toEqual(first);
    expect(reloaded).toMatchObject({
      schemaVersion: 3,
      draftId: "draft-created-once",
      transferKey: "transfer-created-once",
      revision: 0,
    });
  });

  it("persists supported content through the existing revision transport and reloads it", async () => {
    const store = new MemoryStore();
    let snapshot = draft();
    store.value = structuredClone(snapshot);
    const transport = createGuestDraftSaveTransport({
      store,
      getDraft: () => snapshot,
      acceptDraft: (next) => { snapshot = next; },
      now: () => T1,
    });
    const content = commitWelcome({});

    await expect(transport(content, 0)).resolves.toEqual({
      status: "saved",
      updatedAt: T1,
      revision: 1,
    });
    await expect(loadOrCreateGuestDraft({ store, createId: () => "unused" })).resolves.toMatchObject({
      revision: 1,
      content,
      draftId: "guest-draft-stable",
      transferKey: "guest-transfer-stable",
    });
  });

  it("keeps a stale tab blocked and preserves the winning tab", async () => {
    const store = new MemoryStore();
    const initial = draft();
    store.value = structuredClone(initial);
    let tabA = structuredClone(initial);
    let tabB = structuredClone(initial);
    const transportA = createGuestDraftSaveTransport({
      store,
      getDraft: () => tabA,
      acceptDraft: (next) => { tabA = next; },
      now: () => T1,
    });
    const transportB = createGuestDraftSaveTransport({
      store,
      getDraft: () => tabB,
      acceptDraft: (next) => { tabB = next; },
      now: () => T1,
    });

    const winner = { hero: { displayName: "A" } } as MemorialContent;
    const stale = { hero: { displayName: "B" } } as MemorialContent;
    await expect(transportA(winner, 0)).resolves.toMatchObject({ status: "saved", revision: 1 });
    await expect(transportB(stale, 0)).resolves.toEqual({ status: "conflict" });
    expect(store.value?.content).toEqual(winner);
    expect(tabB.revision).toBe(0);
  });

  it("surfaces storage failures without changing the previous valid draft", async () => {
    const store = new MemoryStore();
    let snapshot = draft();
    store.value = structuredClone(snapshot);
    store.failNext = { ok: false, reason: "quota_exceeded" };
    const transport = createGuestDraftSaveTransport({
      store,
      getDraft: () => snapshot,
      acceptDraft: (next) => { snapshot = next; },
      now: () => T1,
    });

    await expect(transport({ hero: { displayName: "Changed" } } as MemorialContent, 0)).rejects.toMatchObject({
      name: "GuestBuilderRuntimeError",
      reason: "quota_exceeded",
    });
    expect(store.value).toEqual(draft());
    expect(snapshot).toEqual(draft());
  });

  it("persists T01 locally without changing stable transfer identifiers", async () => {
    const store = new MemoryStore();
    let snapshot = draft();
    store.value = structuredClone(snapshot);

    const saved = await saveGuestDraftLanguage({
      store,
      getDraft: () => snapshot,
      acceptDraft: (next) => { snapshot = next; },
      now: () => T1,
    }, "fr");

    expect(saved.response).toEqual({ status: "saved" });
    expect(snapshot).toMatchObject({
      language: "fr",
      revision: 1,
      draftId: "guest-draft-stable",
      transferKey: "guest-transfer-stable",
    });
  });

  it("reuses the canonical predicates and reaches the local Hero photo step", () => {
    let current = draft();
    expect(resolveGuestBuilderStage(current)).toBe("language");

    let updated = updateGuestDraftV3(current, { language: "fr", now: T1 });
    if (!updated.ok) throw new GuestBuilderRuntimeError(updated.reason);
    current = updated.draft;
    expect(resolveGuestBuilderStage(current)).toBe("welcome");

    updated = updateGuestDraftV3(current, { content: commitWelcome(current.content), now: T1 });
    if (!updated.ok) throw new GuestBuilderRuntimeError(updated.reason);
    current = updated.draft;
    expect(resolveGuestBuilderStage(current)).toBe("identity");

    const named = writeDisplayName(current.content, "Jeanne Dupont");
    if (!named.ok) throw new Error(named.reason);
    const identity = commitPageA(named.content);
    if (!identity.ok) throw new Error(identity.reason);
    updated = updateGuestDraftV3(current, { content: identity.content, now: T1 });
    if (!updated.ok) throw new GuestBuilderRuntimeError(updated.reason);
    current = updated.draft;
    expect(resolveGuestBuilderStage(current)).toBe("announcementChoice");

    const announcement = commitA00(current.content, "no");
    if (!announcement.ok) throw new Error(announcement.reason);
    updated = updateGuestDraftV3(current, { content: announcement.content, now: T1 });
    if (!updated.ok) throw new GuestBuilderRuntimeError(updated.reason);
    current = updated.draft;
    expect(resolveGuestBuilderStage(current)).toBe("phrase");

    const phrase = commitPageB(current.content);
    if (!phrase.ok) throw new Error(phrase.reason);
    updated = updateGuestDraftV3(current, { content: phrase.content, now: T1 });
    if (!updated.ok) throw new GuestBuilderRuntimeError(updated.reason);
    expect(resolveGuestBuilderStage(updated.draft)).toBe("heroPhoto");
  });

  it.each([
    ["yes", "announcementText"],
    ["no", "ceremonyMoment"],
    ["later", "ceremonyMoment"],
  ] as const)("uses the canonical post-T08 catalog when A00 = %s", (answer, expected) => {
    const guest = postHeroDraft(answer);
    const before = structuredClone(guest);

    expect(resolveGuestPostHeroScreen(guest)).toBe(expected);
    expect(guest).toEqual(before);
    expect(JSON.stringify(guest)).not.toMatch(/mediaId|memorialId/);
    expect(resolveGuestBuilderStage(guest)).toBe("postRevealPending");
  });

  it.each([
    ["no", "personSheet"],
    ["undecided", "personSheet"],
    ["yes", "ceremonyDateTime"],
  ] as const)("uses the canonical ceremony branch when A04 = %s", (answer, expected) => {
    const guest = postHeroDraft("no", { A04: { status: "completed", answer } });
    expect(resolveGuestPostHeroScreen(guest)).toBe(expected);
  });

  it("does not expose post-Hero navigation before the real local Hero is complete", () => {
    const guest = postHeroDraft("yes");
    expect(resolveGuestPostHeroScreen({ ...guest, photos: [] })).toBeNull();
    expect(resolveGuestPostHeroScreen({ ...guest, skinVariant: null })).toBeNull();
  });

  it("keeps hidden branch data intact while resolving the next guest screen", () => {
    const guest = postHeroDraft("no", { A01: { status: "completed" } });
    guest.content.deathNotice = { text: "Contenu conservé" };
    const before = structuredClone(guest.content);

    expect(resolveGuestPostHeroScreen(guest)).toBe("ceremonyMoment");
    expect(guest.content).toEqual(before);
  });

  it("contains no guest network/Supabase/server-media boundary and is not publicly routed", () => {
    const implementation = [
      "guest-builder-runtime.ts",
      "guest-hero-media.ts",
      "../media/local-photo.ts",
      "../../components/builder/guest/GuestBuilderRuntime.tsx",
    ].map((path) => readFileSync(join(import.meta.dirname, path), "utf8")).join("\n");
    expect(implementation).not.toMatch(/@supabase|lib\/supabase|fetch\s*\(|XMLHttpRequest|WebSocket|server-media|media-actions/);

    const appRoot = join(import.meta.dirname, "../../app");
    const publicRouteSources = readdirSync(appRoot, { recursive: true })
      .filter((path) => typeof path === "string" && /\.(?:ts|tsx)$/.test(path))
      .map((path) => readFileSync(join(appRoot, String(path)), "utf8"))
      .join("\n");
    expect(publicRouteSources).not.toMatch(/GuestBuilderRuntime/);

    const authenticatedPage = readFileSync(join(appRoot, "builder/[memorialId]/page.tsx"), "utf8");
    expect(authenticatedPage).toMatch(/authorizeMemorialForRequest/);
    expect(authenticatedPage).toMatch(/saveDraftAction\.bind\(null, access\.memorialId\)/);
    expect(authenticatedPage).not.toMatch(/guest-draft|GuestBuilderRuntime/);
  });
});
