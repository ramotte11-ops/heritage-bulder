import type { ClaimedReconcileRow, HostedVideoRepository } from "./hosted-video-repository";
import { MuxApiError, type MuxApi } from "./mux-api";

/**
 * SERVER ONLY. VID-08 — réconciliation GLOBALE des vidéos hébergées :
 * rattrape les notifications Mux perdues et les suppressions restées en
 * attente, pour tous les hommages. Préparée, NON planifiée : aucune fonction
 * Netlify n'est créée (voir docs/video-hosting-mise-en-service.md).
 *
 * Garanties :
 *  - Idempotente : chaque transition rejouée porte un identifiant
 *    d'événement stable (`reconcile:<ligne>:<transition>`) ; deux passages
 *    sur la même ligne n'ont pas plus d'effet qu'un seul.
 *  - Pas de travail en double : chaque lot est RÉSERVÉ en base
 *    (claim_memorial_videos_for_reconcile_v1, `for update skip locked`) ;
 *    deux exécutions simultanées ne traitent jamais la même ligne, et une
 *    exécution interrompue libère ses lignes à l'expiration de sa réservation.
 *  - Économe : seules les lignes restées sans nouvelle depuis `staleMs`
 *    sont examinées ; une ligne sans changement chez Mux, ou en erreur
 *    temporaire, n'est réexaminée qu'après un délai croissant (2, 4, 8 min…,
 *    plafond 6 h) ; lots limités, nombre de lots limité, durée bornée.
 *  - Débit : un appel Mux au plus tous les `muxIntervalMs` ; une réponse
 *    429 (limite de débit) arrête l'exécution, le reste attend la suivante.
 *  - Journal : uniquement des compteurs et des codes, jamais d'identifiant,
 *    d'adresse, de jeton ni de contenu d'hommage.
 */

export interface GlobalReconcileOptions {
  /** Une ligne n'est examinée que sans nouvelle depuis ce délai (défaut 15 min). */
  staleMs?: number;
  /** Lignes réservées par lot (défaut 25, plafond SQL 100). */
  batchSize?: number;
  /** Lots au plus par exécution (défaut 8, soit 200 lignes). */
  maxBatches?: number;
  /** Durée maximale d'une exécution (défaut 20 s : sous la limite d'une fonction planifiée). */
  maxDurationMs?: number;
  /** Intervalle minimal entre deux lignes, donc entre appels Mux (défaut 250 ms). */
  muxIntervalMs?: number;
  /** Durée de la réservation d'un lot (défaut 600 s). */
  claimSeconds?: number;
}

export interface GlobalReconcileDeps {
  repository: Pick<HostedVideoRepository, "claimForReconcile" | "finishReconcile">;
  reconcileOne: (row: ClaimedReconcileRow) => Promise<"applied" | "waiting">;
  now: () => number;
  wait: (ms: number) => Promise<void>;
  newHolder: () => string;
  log: (event: GlobalReconcileLog) => void;
}

export type GlobalReconcileStop = "nothing_left" | "max_batches" | "time_budget" | "rate_limited" | "database_unavailable";

export interface GlobalReconcileSummary {
  examined: number;
  applied: number;
  waiting: number;
  failed: number;
  stoppedBy: GlobalReconcileStop;
}

/** Ce qui est journalisé : des compteurs et des codes, rien d'autre. */
export type GlobalReconcileLog =
  | { event: "video_reconcile_row_failed"; operation: string; httpStatus: number | null }
  | { event: "video_reconcile_finished"; summary: GlobalReconcileSummary };

const DEFAULTS: Required<GlobalReconcileOptions> = {
  staleMs: 15 * 60_000,
  batchSize: 25,
  maxBatches: 8,
  maxDurationMs: 20_000,
  muxIntervalMs: 250,
  claimSeconds: 600,
};

function describeError(error: unknown): { operation: string; httpStatus: number | null } {
  if (error instanceof MuxApiError) return { operation: error.operation, httpStatus: error.httpStatus };
  return { operation: "database", httpStatus: null };
}

export async function runGlobalVideoReconcile(deps: GlobalReconcileDeps, options: GlobalReconcileOptions = {}): Promise<GlobalReconcileSummary> {
  const o = { ...DEFAULTS, ...options };
  const holder = deps.newHolder();
  const startedAt = deps.now();
  const summary: GlobalReconcileSummary = { examined: 0, applied: 0, waiting: 0, failed: 0, stoppedBy: "nothing_left" };
  const outOfTime = () => deps.now() - startedAt >= o.maxDurationMs;

  run: for (let batch = 0; ; batch += 1) {
    if (batch >= o.maxBatches) {
      summary.stoppedBy = "max_batches";
      break;
    }
    if (outOfTime()) {
      summary.stoppedBy = "time_budget";
      break;
    }
    let rows: ClaimedReconcileRow[];
    try {
      rows = await deps.repository.claimForReconcile({
        holder,
        staleBefore: new Date(deps.now() - o.staleMs).toISOString(),
        limit: o.batchSize,
        claimSeconds: o.claimSeconds,
      });
    } catch {
      summary.stoppedBy = "database_unavailable";
      break;
    }
    if (rows.length === 0) break;

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]!;
      if (outOfTime()) {
        // Lignes non traitées : rendues sans pénalité, la prochaine exécution les reprend.
        await releaseAll(deps, holder, rows.slice(index), "done");
        summary.stoppedBy = "time_budget";
        break run;
      }
      summary.examined += 1;
      try {
        const result = await deps.reconcileOne(row);
        if (result === "applied") summary.applied += 1;
        else summary.waiting += 1;
        // Rien de nouveau chez Mux : réexaminée plus tard (délai croissant), jamais à chaque passage.
        await finish(deps, holder, row, result === "applied" ? "done" : "retry");
      } catch (error) {
        summary.failed += 1;
        const described = describeError(error);
        deps.log({ event: "video_reconcile_row_failed", ...described });
        await finish(deps, holder, row, "retry");
        if (described.httpStatus === 429) {
          await releaseAll(deps, holder, rows.slice(index + 1), "done");
          summary.stoppedBy = "rate_limited";
          break run;
        }
      }
      await deps.wait(o.muxIntervalMs);
    }
    if (rows.length < o.batchSize) break;
  }

  deps.log({ event: "video_reconcile_finished", summary: { ...summary } });
  return summary;
}

async function finish(deps: GlobalReconcileDeps, holder: string, row: ClaimedReconcileRow, result: "done" | "retry"): Promise<void> {
  // Un échec ici n'est pas grave : la réservation expire d'elle-même.
  await deps.repository.finishReconcile({ holder, videoId: row.videoId, result }).catch(() => undefined);
}

async function releaseAll(deps: GlobalReconcileDeps, holder: string, rows: readonly ClaimedReconcileRow[], result: "done" | "retry"): Promise<void> {
  for (const row of rows) await finish(deps, holder, row, result);
}

export interface OrphanSweepOptions {
  /** Par défaut `true` : compte seulement, ne supprime rien. */
  dryRun?: boolean;
  /** Un asset plus récent n'est jamais touché (envoi en cours, notification en route). Défaut 24 h. */
  minAgeMs?: number;
  maxPages?: number;
  pageSize?: number;
  muxIntervalMs?: number;
}

export interface OrphanSweepSummary {
  listed: number;
  orphans: number;
  deleted: number;
  failed: number;
  dryRun: boolean;
}

/**
 * VID-08 — assets ORPHELINS : présents chez Mux, inconnus de HERITAGE (par
 * exemple, créés pour un envoi dont la ligne a disparu lors d'un retour
 * arrière). Option à lancer à la main ou rarement (hebdomadaire) : chaque
 * page coûte un appel Mux. Par défaut, compte sans supprimer. Ne touche
 * jamais un asset de moins de 24 h.
 *
 * ATTENTION : l'environnement Mux doit être DÉDIÉ à HERITAGE ; dans un
 * environnement partagé, les assets d'autres applications seraient vus
 * comme orphelins.
 */
export async function sweepOrphanVideoAssets(
  deps: { mux: Pick<MuxApi, "listAssets" | "deleteAsset">; repository: Pick<HostedVideoRepository, "knownAssets">; now: () => number; wait: (ms: number) => Promise<void> },
  options: OrphanSweepOptions = {},
): Promise<OrphanSweepSummary> {
  const dryRun = options.dryRun ?? true;
  const minAgeMs = options.minAgeMs ?? 24 * 3_600_000;
  const maxPages = options.maxPages ?? 5;
  const pageSize = options.pageSize ?? 100;
  const interval = options.muxIntervalMs ?? 250;
  const summary: OrphanSweepSummary = { listed: 0, orphans: 0, deleted: 0, failed: 0, dryRun };

  for (let page = 1; page <= maxPages; page += 1) {
    const assets = await deps.mux.listAssets({ page, limit: pageSize });
    summary.listed += assets.length;
    const old = assets.filter((asset) => asset.createdAtMs !== null && deps.now() - asset.createdAtMs >= minAgeMs);
    const known = await deps.repository.knownAssets(old.map((asset) => asset.id));
    for (const asset of old) {
      if (known.has(asset.id)) continue;
      summary.orphans += 1;
      if (dryRun) continue;
      try {
        await deps.mux.deleteAsset(asset.id);
        summary.deleted += 1;
      } catch {
        summary.failed += 1;
      }
      await deps.wait(interval);
    }
    if (assets.length < pageSize) break;
    await deps.wait(interval);
  }
  return summary;
}
