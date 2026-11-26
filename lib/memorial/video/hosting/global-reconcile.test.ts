import { describe, expect, it, vi } from "vitest";
import { runGlobalVideoReconcile, sweepOrphanVideoAssets, type GlobalReconcileDeps } from "./global-reconcile";
import type { ClaimedReconcileRow } from "./hosted-video-repository";
import { MuxApiError } from "./mux-api";
import { scheduledVideoReconcile } from "./hosting-runtime";

/**
 * VID-08 — réconciliation globale, contre une fausse base qui applique les
 * mêmes règles de réservation que claim_memorial_videos_for_reconcile_v1
 * (prouvées en SQL, scripts/db/test-local.sh, V8-3). Aucun appel Mux réel.
 */

const row = (n: number, status: ClaimedReconcileRow["status"] = "processing"): ClaimedReconcileRow => ({
  videoId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  memorialId: "m",
  status,
  uploadId: `up-${n}`,
  assetId: `as-${n}`,
  uploadExpiresAt: null,
  attempts: 0,
});

/** Fausse base : un lot réservé n'est plus proposé, ni à cette exécution ni à une autre. */
function fakeDatabase(rows: ClaimedReconcileRow[]) {
  const claimed = new Map<string, string>();
  const finished: { holder: string; videoId: string; result: string }[] = [];
  const repository = {
    claimForReconcile: vi.fn(async ({ holder, limit }: { holder: string; limit: number }) => {
      const free = rows.filter((r) => !claimed.has(r.videoId)).slice(0, limit);
      for (const r of free) claimed.set(r.videoId, holder);
      return free;
    }),
    finishReconcile: vi.fn(async (input: { holder: string; videoId: string; result: "done" | "retry" }) => {
      finished.push(input);
    }),
  };
  return { repository, claimed, finished };
}

function deps(db: ReturnType<typeof fakeDatabase>, reconcileOne: GlobalReconcileDeps["reconcileOne"], clock = { t: 0 }): GlobalReconcileDeps & { logs: unknown[] } {
  const logs: unknown[] = [];
  let n = 0;
  return {
    repository: db.repository,
    reconcileOne,
    now: () => clock.t,
    wait: vi.fn(async (ms: number) => {
      clock.t += ms;
    }),
    newHolder: () => `holder-${++n}`,
    log: (event) => logs.push(event),
    logs,
  };
}

describe("VID-08 — réconciliation globale", () => {
  it("traite tous les lots, une ligne après l'autre, au rythme prévu ; applied → done, rien de neuf → retry (délai croissant)", async () => {
    const db = fakeDatabase([1, 2, 3, 4, 5].map((n) => row(n)));
    const d = deps(db, async (r) => (r.videoId.endsWith("2") ? "waiting" : "applied"));
    const summary = await runGlobalVideoReconcile(d, { batchSize: 2, muxIntervalMs: 250 });
    expect(summary).toEqual({ released: 0, examined: 5, applied: 4, waiting: 1, failed: 0, stoppedBy: "nothing_left" });
    expect(db.repository.claimForReconcile).toHaveBeenCalledTimes(3);
    expect(db.finished.map((f) => f.result)).toEqual(["done", "retry", "done", "done", "done"]);
    expect(d.wait).toHaveBeenCalledWith(250);
  });

  it("deux exécutions simultanées : chaque ligne est traitée une seule fois", async () => {
    const db = fakeDatabase(Array.from({ length: 30 }, (_, i) => row(i + 1)));
    const seen: string[] = [];
    const reconcileOne = async (r: ClaimedReconcileRow) => {
      seen.push(r.videoId);
      await new Promise((resolve) => setTimeout(resolve, 0));
      return "applied" as const;
    };
    const fast = { wait: async () => {} };
    await Promise.all([
      runGlobalVideoReconcile({ ...deps(db, reconcileOne), ...fast }, { batchSize: 4 }),
      runGlobalVideoReconcile({ ...deps(db, reconcileOne), newHolder: () => "other", ...fast }, { batchSize: 4 }),
    ]);
    expect(seen).toHaveLength(30);
    expect(new Set(seen).size).toBe(30);
  });

  it("limite de débit Mux (429) : arrêt immédiat ; la ligne est différée, les suivantes rendues sans pénalité", async () => {
    const db = fakeDatabase([1, 2, 3].map((n) => row(n)));
    const d = deps(db, async (r) => {
      if (r.videoId.endsWith("2")) throw new MuxApiError("get_asset", 429);
      return "applied";
    });
    const summary = await runGlobalVideoReconcile(d, { batchSize: 10 });
    expect(summary).toMatchObject({ examined: 2, applied: 1, failed: 1, stoppedBy: "rate_limited" });
    expect(db.finished.map((f) => `${f.videoId.slice(-1)}:${f.result}`)).toEqual(["1:done", "2:retry", "3:done"]);
  });

  it("panne passagère sur une ligne : différée, l'exécution continue ; le journal ne contient que des codes", async () => {
    const db = fakeDatabase([1, 2].map((n) => row(n)));
    const d = deps(db, async (r) => {
      if (r.videoId.endsWith("1")) throw new MuxApiError("delete_asset", 503);
      return "applied";
    });
    const summary = await runGlobalVideoReconcile(d);
    expect(summary).toMatchObject({ examined: 2, applied: 1, failed: 1, stoppedBy: "nothing_left" });
    expect(d.logs[0]).toEqual({ event: "video_reconcile_row_failed", operation: "delete_asset", httpStatus: 503 });
    expect(JSON.stringify(d.logs)).not.toMatch(/as-|up-|00000000|m"/);
  });

  it("budget de temps : les lignes non traitées sont rendues pour la prochaine exécution", async () => {
    const db = fakeDatabase([1, 2, 3, 4].map((n) => row(n)));
    const clock = { t: 0 };
    const d = deps(db, async () => "applied", clock);
    const summary = await runGlobalVideoReconcile(d, { maxDurationMs: 600, muxIntervalMs: 250 });
    expect(summary.stoppedBy).toBe("time_budget");
    expect(summary.examined).toBe(3);
    expect(db.finished).toHaveLength(4);
  });

  it("nombre de lots plafonné ; base indisponible : arrêt sans exception", async () => {
    const db = fakeDatabase(Array.from({ length: 10 }, (_, i) => row(i + 1)));
    await expect(runGlobalVideoReconcile({ ...deps(db, async () => "applied"), wait: async () => {} }, { batchSize: 2, maxBatches: 2 })).resolves.toMatchObject({ examined: 4, stoppedBy: "max_batches" });
    const broken = { claimForReconcile: vi.fn(async () => Promise.reject(new Error("db"))), finishReconcile: vi.fn() };
    await expect(runGlobalVideoReconcile({ ...deps(fakeDatabase([]), async () => "applied"), repository: broken })).resolves.toMatchObject({ examined: 0, stoppedBy: "database_unavailable" });
  });

  it("VID-09 — les anciennes versions devenues inutiles sont libérées d'abord ; un échec est journalisé sans arrêter l'exécution", async () => {
    const db = fakeDatabase([row(1)]);
    const released = await runGlobalVideoReconcile({ ...deps(db, async () => "applied"), releaseSuperseded: async () => 2 });
    expect(released).toMatchObject({ released: 2, examined: 1 });
    const d = deps(fakeDatabase([row(1)]), async () => "applied");
    const failing = await runGlobalVideoReconcile({ ...d, releaseSuperseded: async () => Promise.reject(new MuxApiError("delete_asset", 503)) });
    expect(failing).toMatchObject({ released: 0, examined: 1, stoppedBy: "nothing_left" });
    expect(d.logs[0]).toEqual({ event: "video_reconcile_row_failed", operation: "delete_asset", httpStatus: 503 });
  });

  it("inactive par défaut : sans HERITAGE_VIDEO_RECONCILE=enabled, ou sans configuration Mux, rien ne s'exécute", async () => {
    await expect(scheduledVideoReconcile({})).resolves.toEqual({ status: "disabled" });
    await expect(scheduledVideoReconcile({ HERITAGE_VIDEO_RECONCILE: "enabled" })).resolves.toEqual({ status: "disabled" });
    await expect(scheduledVideoReconcile({ HERITAGE_VIDEO_HOSTING: "enabled", HERITAGE_VIDEO_RECONCILE: "yes" })).resolves.toEqual({ status: "disabled" });
  });
});

describe("VID-08 — assets orphelins (option)", () => {
  const DAY = 24 * 3_600_000;
  const NOW = 10 * DAY;
  const asset = (id: string, ageMs: number) => ({ id, createdAtMs: NOW - ageMs });

  it("par défaut : compte seulement ; jamais un asset connu ni un asset de moins de 24 h", async () => {
    const mux = { listAssets: vi.fn(async () => [asset("known", 2 * DAY), asset("orphan", 2 * DAY), asset("fresh", 3_600_000)]), deleteAsset: vi.fn() };
    const repository = { knownAssets: vi.fn(async () => new Set(["known"])) };
    const summary = await sweepOrphanVideoAssets({ mux, repository, now: () => NOW, wait: async () => {} });
    expect(summary).toEqual({ listed: 3, orphans: 1, deleted: 0, failed: 0, dryRun: true });
    expect(repository.knownAssets).toHaveBeenCalledWith(["known", "orphan"]);
    expect(mux.deleteAsset).not.toHaveBeenCalled();
  });

  it("dryRun: false : supprime seulement les orphelins, page par page, en s'arrêtant à la dernière page", async () => {
    const pages = [[asset("o1", 2 * DAY), asset("k", 2 * DAY)], [asset("o2", 3 * DAY)]];
    const mux = { listAssets: vi.fn(async ({ page }: { page: number }) => pages[page - 1] ?? []), deleteAsset: vi.fn(async () => {}) };
    const summary = await sweepOrphanVideoAssets(
      { mux, repository: { knownAssets: async () => new Set(["k"]) }, now: () => NOW, wait: async () => {} },
      { dryRun: false, pageSize: 2 },
    );
    expect(summary).toEqual({ listed: 3, orphans: 2, deleted: 2, failed: 0, dryRun: false });
    expect(mux.deleteAsset.mock.calls.map((c) => (c as unknown[])[0])).toEqual(["o1", "o2"]);
    expect(mux.listAssets).toHaveBeenCalledTimes(2);
  });
});
