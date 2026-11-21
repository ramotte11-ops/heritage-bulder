import { describe, expect, it } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { MEDIA_PENDING_TTL_MS } from "@/config/media";
import { reserveMediaUpload } from "./upload-lifecycle";
import { JPEG_BYTES, MEMORIAL_A, OWNER_A, createTestEngine, ownerActor } from "./test-fixtures";
import {
  SWEEP_CLOCK_MARGIN_MS,
  cleanupLifecycleAllows,
  formatMediaSweepReport,
  readMediaSweepMode,
  runScheduledMediaSweep,
} from "./scheduled-media-sweep";

/** M8-E3/E4 — nettoyage préparé, jamais actif sans décision explicite ; revue de sécurité. */

async function abandoned(engine: ReturnType<typeof createTestEngine>) {
  const r = await reserveMediaUpload(engine, ownerActor(OWNER_A), { memorialId: MEMORIAL_A, purpose: "gallery", declaredMimeType: "image/jpeg" });
  if (!r.ok) throw new Error("reservation failed");
  engine.objectStore.put(r.value.storagePath, JPEG_BYTES);
  return r.value;
}

const PAST_SAFE = MEDIA_PENDING_TTL_MS + SWEEP_CLOCK_MARGIN_MS + 1000;
const ZERO = { examined: 0, reclaimable: 0, blockedLifecycle: 0, skipped: 0, reclaimed: 0 };

describe("M8-E3/E4 — tâche de nettoyage des médias abandonnés (préparée, non activée)", () => {
  it("inerte par défaut : sans HERITAGE_MEDIA_SWEEP_MODE, rien n'est lu ni supprimé", async () => {
    expect(readMediaSweepMode({})).toBe("off");
    expect(readMediaSweepMode({ HERITAGE_MEDIA_SWEEP_MODE: "yes" })).toBe("off");
    const engine = createTestEngine();
    const a = await abandoned(engine);
    engine.advance(PAST_SAFE);
    expect(await runScheduledMediaSweep(engine, { mode: readMediaSweepMode({}) })).toEqual({ mode: "off", ...ZERO });
    expect(engine.objectStore.objects.has(a.storagePath)).toBe(true);
  });

  it("dry-run : classe et compte seulement, ne supprime rien", async () => {
    const engine = createTestEngine();
    const a = await abandoned(engine);
    engine.advance(PAST_SAFE);
    expect(await runScheduledMediaSweep(engine, { mode: "dry-run" })).toEqual({ mode: "dry-run", ...ZERO, examined: 1, reclaimable: 1 });
    expect(engine.mediaRepository.rows.has(a.mediaId)).toBe(true);
    expect(engine.objectStore.objects.has(a.storagePath)).toBe(true);
  });

  it("apply : la primitive existante, au-delà de 3 h + 15 min de marge seulement", async () => {
    const engine = createTestEngine();
    const a = await abandoned(engine);
    // Passé 3 h mais dans la marge d'horloge : une réservation encore possiblement en cours n'est pas touchée.
    engine.advance(MEDIA_PENDING_TTL_MS + SWEEP_CLOCK_MARGIN_MS - 60_000);
    expect(await runScheduledMediaSweep(engine, { mode: "apply" })).toEqual({ mode: "apply", ...ZERO });
    expect(engine.objectStore.objects.has(a.storagePath)).toBe(true);
    engine.advance(120_000);
    expect(await runScheduledMediaSweep(engine, { mode: "apply" })).toEqual({ mode: "apply", ...ZERO, examined: 1, reclaimable: 1, reclaimed: 1 });
    expect(engine.objectStore.objects.has(a.storagePath)).toBe(false);
    expect(engine.mediaRepository.rows.has(a.mediaId)).toBe(false);
  });

  it("hommage archivé : compté à part, JAMAIS nettoyé, même en apply", async () => {
    const engine = createTestEngine();
    const a = await abandoned(engine);
    engine.mediaSecurityRepository.snapshots.set(MEMORIAL_A, { status: "archived", firstPublishedAt: "2026-09-01T00:00:00Z", draftRevision: 3 });
    engine.advance(PAST_SAFE);
    expect(await runScheduledMediaSweep(engine, { mode: "apply" })).toEqual({ mode: "apply", ...ZERO, examined: 1, blockedLifecycle: 1 });
    expect(engine.objectStore.objects.has(a.storagePath)).toBe(true);
    expect(engine.mediaRepository.rows.has(a.mediaId)).toBe(true);
  });

  it("un média prêt (photo publiée ou à examiner) n'est jamais vu", async () => {
    const engine = createTestEngine();
    const a = await abandoned(engine);
    const row = engine.mediaRepository.rows.get(a.mediaId)!;
    engine.mediaRepository.rows.set(a.mediaId, { ...row, status: "ready", sizeBytes: 100 });
    engine.advance(PAST_SAFE);
    expect(await runScheduledMediaSweep(engine, { mode: "apply" })).toEqual({ mode: "apply", ...ZERO });
    expect(engine.objectStore.objects.has(a.storagePath)).toBe(true);
  });

  it("un chemin hors de son hommage est ignoré et compté, jamais supprimé", async () => {
    const engine = createTestEngine();
    const a = await abandoned(engine);
    const row = engine.mediaRepository.rows.get(a.mediaId)!;
    engine.mediaRepository.rows.set(a.mediaId, { ...row, storagePath: `../${row.storagePath}` });
    engine.advance(PAST_SAFE);
    expect(await runScheduledMediaSweep(engine, { mode: "apply" })).toEqual({ mode: "apply", ...ZERO, examined: 1, skipped: 1 });
  });

  it("règle du cycle de vie identique à reserve_pending_media_cleanup_v1", () => {
    const at = "2026-09-01T00:00:00Z";
    expect(cleanupLifecycleAllows({ status: "draft", firstPublishedAt: null, draftRevision: 0 }, "gallery")).toBe(true);
    expect(cleanupLifecycleAllows({ status: "published", firstPublishedAt: at, draftRevision: 0 }, "contribution")).toBe(true);
    expect(cleanupLifecycleAllows({ status: "published", firstPublishedAt: at, draftRevision: 0 }, "hero")).toBe(false);
    expect(cleanupLifecycleAllows({ status: "archived", firstPublishedAt: at, draftRevision: 0 }, "contribution")).toBe(false);
    expect(cleanupLifecycleAllows({ status: "published", firstPublishedAt: null, draftRevision: 0 }, "gallery")).toBe(false);
  });

  it("journal : des nombres seulement", () => {
    expect(formatMediaSweepReport({ mode: "dry-run", examined: 3, reclaimable: 2, blockedLifecycle: 1, skipped: 0, reclaimed: 0 })).toBe(
      "media-sweep mode=dry-run examined=3 reclaimable=2 blocked=1 skipped=0 reclaimed=0",
    );
  });

  it("aucune fonction planifiée n'est déployée (activation = GO QG)", () => {
    const dir = path.resolve(import.meta.dirname, "..", "..", "netlify", "functions");
    const files = existsSync(dir) ? readdirSync(dir) : [];
    expect(files.filter((f) => /sweep/i.test(f))).toEqual([]);
  });
});
