"use client";

import { useCallback, useMemo, useRef } from "react";
import type { MemorialContent } from "@/types/memorial";
import type { AutosaveStatus } from "./autosave-state";
import { DraftRevisionConflictError, useDraftRevisionCoordinator } from "./draft-revision";
import { changedMemorialContentMutations } from "@/lib/memorial/edit-mutations";
import type { StepWrite, TextThenStepResponse } from "@/lib/memorial/save-text-then-step";

/**
 * Missions 04-J / 04-K — EXPERIMENT (local only). A step's final write
 * (Continue or skip) with « deux écritures, une seule requête ».
 *
 * One combined request (server: write 1 = the text, then write 2 = the
 * text plus the step, two separate commits) replaces the two historical
 * requests WHEN it can stand in for what the autosave owes:
 *   - the autosave owes the text (scheduled, or failed): the combined
 *     request stands in for that save (`persistVia`), inside the
 *     revision coordinator's FIFO queue;
 *   - nothing owed (idle / saved): the combined request alone — write 1
 *     is then a no-op (no change, no write);
 *   - a save IN FLIGHT: the historical order, unchanged (flush(), then
 *     the final write through the historical transport);
 *   - `unsupported` (published since the page was rendered), or no
 *     combined transport: the historical path.
 *
 * ## Mission 04-K — an unconfirmed operation
 *
 * A network error leaves the outcome unknown (the server may have done
 * write 1, write 2, both or none). The operation is remembered with its
 * own text and final content; the coordinator's revision is untouched
 * (still the operation's starting revision). The NEXT final write — the
 * step's Continue or skip, or the autosave's « Réessayer », which the
 * step routes here — first settles it with those SAME arguments and that
 * SAME revision: the server reconciles (revision-bounded identity, see
 * lib/memorial/save-text-then-step.ts) and never replays a done write.
 * Then:
 *   - step stored, nothing typed since → done, nothing more written;
 *   - step stored, new text typed since → the new final content is
 *     written as the text itself (write 1 carries the step, write 2 is a
 *     no-op): the stored step is never removed in between;
 *   - step not stored → the requested operation, normally (write 1 is a
 *     no-op when the text did not change).
 *
 * Outcomes:
 *   - resolves → text AND step durably saved (confirmed by the server);
 *   - rejects with DraftRevisionConflictError → nothing overwritten;
 *   - rejects with StepNotValidatedError → the TEXT is confirmed saved,
 *     the step is not (the « texte enregistré, étape non terminée »
 *     message may be shown);
 *   - rejects otherwise → nothing confirmed: never shown as saved.
 */

export type TextThenStepTransport = (
  text: MemorialContent,
  final: MemorialContent,
  expectedRevision: number,
) => Promise<TextThenStepResponse>;

export class StepNotValidatedError extends Error {
  constructor() {
    super("The text is saved; the step could not be validated.");
    this.name = "StepNotValidatedError";
  }
}

class UnsupportedSignal extends Error {}

interface Autosave {
  getStatus: () => AutosaveStatus;
  flush: () => Promise<void>;
  persistVia: (write: () => Promise<{ updatedAt: string }>) => Promise<void> | null;
}

type SaveDraft = (content: MemorialContent) => Promise<{ updatedAt: string; revision?: number }>;

interface Attempt {
  step: StepWrite | null;
  unsupported: boolean;
}

function sameContent(a: MemorialContent, b: MemorialContent): boolean {
  return changedMemorialContentMutations(a, b).length === 0;
}

export interface CombinedStepSave {
  save: (text: MemorialContent, final: MemorialContent) => Promise<void>;
  /** A previous combined request ended without a confirmed outcome. */
  hasUnconfirmed: () => boolean;
}

export function useCombinedStepSave(
  autosave: Autosave,
  saveDraft: SaveDraft | undefined,
  combined: TextThenStepTransport | undefined,
): CombinedStepSave {
  const coordinator = useDraftRevisionCoordinator();
  const unconfirmed = useRef<{ text: MemorialContent; final: MemorialContent } | null>(null);
  const { getStatus, flush, persistVia } = autosave;

  const save = useCallback(
    async (text: MemorialContent, final: MemorialContent) => {
      if (saveDraft === undefined) throw new Error("Draft persistence is unavailable.");
      const historical = async () => {
        await flush();
        await saveDraft(final);
      };
      if (combined === undefined || coordinator === null) return historical();

      /** One combined request, standing in for what the autosave owes.
       * `null` → a save is in flight: the caller keeps the historical order. */
      const attempt = async (opText: MemorialContent, opFinal: MemorialContent): Promise<Attempt | null> => {
        const outcome: Attempt = { step: null, unsupported: false };
        const write = async () => {
          try {
            return await coordinator.commit(opText, async (expectedRevision) => {
              const response = await combined(opText, opFinal, expectedRevision);
              if (response.status === "unsupported") throw new UnsupportedSignal();
              if (response.text.status === "conflict") return { status: "conflict" as const };
              outcome.step = response.step;
              const last = response.step.status === "saved" ? response.step : response.text;
              return { status: "saved" as const, updatedAt: last.updatedAt, revision: last.revision };
            });
          } catch (error) {
            if (!(error instanceof UnsupportedSignal)) throw error;
            outcome.unsupported = true; // published meanwhile: historical text write
            return saveDraft(opText);
          }
        };

        try {
          const handedOff = persistVia(write);
          if (handedOff !== null) await handedOff;
          else if (getStatus() === "idle" || getStatus() === "saved") await write();
          else return null;
        } catch (error) {
          // A conflict is a known outcome; anything else leaves it unknown.
          if (!(error instanceof DraftRevisionConflictError)) unconfirmed.current = { text: opText, final: opFinal };
          throw error;
        }
        unconfirmed.current = null;
        return outcome;
      };

      const conclude = async (outcome: Attempt, opFinal: MemorialContent) => {
        if (outcome.unsupported) {
          await saveDraft(opFinal);
          return;
        }
        if (outcome.step?.status === "saved") return;
        if (outcome.step?.status === "conflict") {
          coordinator.reportConflict(opFinal);
          throw new DraftRevisionConflictError();
        }
        throw new StepNotValidatedError();
      };

      let opText = text;
      const pending = unconfirmed.current;
      if (pending !== null) {
        // Settle the unconfirmed operation first, with ITS arguments and revision.
        const settled = await attempt(pending.text, pending.final);
        if (settled === null) return historical();
        if (settled.unsupported) {
          await saveDraft(pending.final);
          if (sameContent(pending.final, final)) return;
          await saveDraft(final);
          return;
        }
        if (settled.step?.status === "conflict") return conclude(settled, pending.final);
        if (settled.step?.status === "saved") {
          if (sameContent(pending.final, final)) return; // nothing typed since: the step is done
          opText = final; // the step is stored: never write a text that would remove it
        }
      }

      const outcome = await attempt(opText, final);
      if (outcome === null) return historical();
      return conclude(outcome, final);
    },
    [combined, coordinator, flush, getStatus, persistVia, saveDraft],
  );

  const hasUnconfirmed = useCallback(() => unconfirmed.current !== null, []);
  return useMemo(() => ({ save, hasUnconfirmed }), [save, hasUnconfirmed]);
}
