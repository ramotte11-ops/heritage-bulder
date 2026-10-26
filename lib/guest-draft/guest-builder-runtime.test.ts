import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { commitA00 } from "@/lib/builder/guided-flow/announcement-choice-step";
import { commitPageA, commitPageB, writeDisplayName } from "@/lib/builder/guided-flow/hero-step";
import { commitWelcome } from "@/lib/builder/guided-flow/welcome-step";
import { createGuestDraft, updateGuestDraft, type GuestDraftV2 } from "./guest-draft";
import type { MemorialContent } from "@/types/memorial";
import type { GuestDraftReadResult, GuestDraftWriteResult } from "./guest-draft-store";
import {
  GuestBuilderRuntimeError,
  createGuestDraftSaveTransport,
  loadOrCreateGuestDraft,
  resolveGuestBuilderStage,
  saveGuestDraftLanguage,
  type GuestBuilderDraftStore,
} from "./guest-builder-runtime";

const T0 = "2026-10-26T08:00:00.000Z";
const T1 = "2026-10-26T08:01:00.000Z";

class MemoryStore implements GuestBuilderDraftStore {
  value: GuestDraftV2 | null = null;
  failNext: GuestDraftWriteResult | null = null;

  async read(): Promise<GuestDraftReadResult> {
    return this.value === null
      ? { status: "empty" }
      : { status: "ready", draft: structuredClone(this.value) };
  }

  async save(draft: GuestDraftV2, expectedRevision: number | null): Promise<GuestDraftWriteResult> {
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

function draft(): GuestDraftV2 {
  const result = createGuestDraft({
    draftId: "guest-draft-stable",
    transferKey: "guest-transfer-stable",
    now: T0,
  });
  if (!result.ok) throw new Error(result.reason);
  return result.draft;
}

describe("guest Builder local runtime", () => {
  it("creates one active V2 draft and resumes the same identifiers after reload", async () => {
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
      schemaVersion: 2,
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

  it("reuses the canonical predicates and stops before the first media-dependent step", () => {
    let current = draft();
    expect(resolveGuestBuilderStage(current)).toBe("language");

    let updated = updateGuestDraft(current, { language: "fr", now: T1 });
    if (!updated.ok) throw new GuestBuilderRuntimeError(updated.reason);
    current = updated.draft;
    expect(resolveGuestBuilderStage(current)).toBe("welcome");

    updated = updateGuestDraft(current, { content: commitWelcome(current.content), now: T1 });
    if (!updated.ok) throw new GuestBuilderRuntimeError(updated.reason);
    current = updated.draft;
    expect(resolveGuestBuilderStage(current)).toBe("identity");

    const named = writeDisplayName(current.content, "Jeanne Dupont");
    if (!named.ok) throw new Error(named.reason);
    const identity = commitPageA(named.content);
    if (!identity.ok) throw new Error(identity.reason);
    updated = updateGuestDraft(current, { content: identity.content, now: T1 });
    if (!updated.ok) throw new GuestBuilderRuntimeError(updated.reason);
    current = updated.draft;
    expect(resolveGuestBuilderStage(current)).toBe("announcementChoice");

    const announcement = commitA00(current.content, "no");
    if (!announcement.ok) throw new Error(announcement.reason);
    updated = updateGuestDraft(current, { content: announcement.content, now: T1 });
    if (!updated.ok) throw new GuestBuilderRuntimeError(updated.reason);
    current = updated.draft;
    expect(resolveGuestBuilderStage(current)).toBe("phrase");

    const phrase = commitPageB(current.content);
    if (!phrase.ok) throw new Error(phrase.reason);
    updated = updateGuestDraft(current, { content: phrase.content, now: T1 });
    if (!updated.ok) throw new GuestBuilderRuntimeError(updated.reason);
    expect(resolveGuestBuilderStage(updated.draft)).toBe("mediaPending");
  });

  it("contains no guest network/Supabase/server-media boundary and is not publicly routed", () => {
    const implementation = [
      "guest-builder-runtime.ts",
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
