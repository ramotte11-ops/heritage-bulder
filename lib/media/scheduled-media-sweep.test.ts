import { describe, expect, it } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { MEDIA_PENDING_TTL_MS } from "@/config/media";
import { reserveMediaUpload } from "./upload-lifecycle";
import { JPEG_BYTES, MEMORIAL_A, OWNER_A, createTestEngine, ownerActor } from "./test-fixtures";
import { formatMediaSweepReport, readMediaSweepMode, runScheduledMediaSweep } from "./scheduled-media-sweep";

/** M8-E3 — nettoyage préparé, jamais actif sans décision explicite. */

async function abandoned(engine: ReturnType<typeof createTestEngine>) {
  const r = await reserveMediaUpload(engine, ownerActor(OWNER_A), { memorialId: MEMORIAL_A, purpose: "gallery", declaredMimeType: "image/jpeg" });
  if (!r.ok) throw new Error("reservation failed");
  engine.objectStore.put(r.value.storagePath, JPEG_BYTES);
  return r.value;
}

describe("M8-E3 — tâche de nettoyage des médias abandonnés (préparée, non activée)", () => {
  it("inerte par défaut : sans HERITAGE_MEDIA_SWEEP_MODE, rien n'est lu ni supprimé", async () => {
    expect(readMediaSweepMode({})).toBe("off");
    expect(readMediaSweepMode({ HERITAGE_MEDIA_SWEEP_MODE: "yes" })).toBe("off");
    const engine = createTestEngine();
    const a = await abandoned(engine);
    engine.advance(MEDIA_PENDING_TTL_MS + 1000);
    expect(await runScheduledMediaSweep(engine, { mode: readMediaSweepMode({}) })).toEqual({ mode: "off", examined: 0, reclaimed: 0 });
    expect(engine.objectStore.objects.has(a.storagePath)).toBe(true);
  });

  it("dry-run : compte seulement, ne supprime rien", async () => {
    const engine = createTestEngine();
    const a = await abandoned(engine);
    engine.advance(MEDIA_PENDING_TTL_MS + 1000);
    expect(await runScheduledMediaSweep(engine, { mode: "dry-run" })).toEqual({ mode: "dry-run", examined: 1, reclaimed: 0 });
    expect(engine.mediaRepository.rows.has(a.mediaId)).toBe(true);
    expect(engine.objectStore.objects.has(a.storagePath)).toBe(true);
  });

  it("apply : le mécanisme existant, réservations de plus de 3 h seulement", async () => {
    const engine = createTestEngine();
    const young = await abandoned(engine);
    engine.advance(MEDIA_PENDING_TTL_MS - 60_000);
    expect(await runScheduledMediaSweep(engine, { mode: "apply" })).toEqual({ mode: "apply", examined: 0, reclaimed: 0 });
    engine.advance(120_000);
    expect(await runScheduledMediaSweep(engine, { mode: "apply" })).toEqual({ mode: "apply", examined: 1, reclaimed: 1 });
    expect(engine.objectStore.objects.has(young.storagePath)).toBe(false);
  });

  it("journal : des nombres seulement", () => {
    expect(formatMediaSweepReport({ mode: "dry-run", examined: 3, reclaimed: 0 })).toBe("media-sweep mode=dry-run examined=3 reclaimed=0");
  });

  it("aucune fonction planifiée n'est déployée (activation = GO QG)", () => {
    const dir = path.resolve(import.meta.dirname, "..", "..", "netlify", "functions");
    const files = existsSync(dir) ? readdirSync(dir) : [];
    expect(files.filter((f) => /sweep/i.test(f))).toEqual([]);
  });
});
