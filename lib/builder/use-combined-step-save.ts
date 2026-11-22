"use client";

import { useCallback } from "react";
import type { MemorialContent } from "@/types/memorial";
import type { AutosaveStatus } from "./autosave-state";
import { DraftRevisionConflictError, useDraftRevisionCoordinator } from "./draft-revision";
import type { StepWrite, TextThenStepResponse } from "@/lib/memorial/save-text-then-step";

/**
 * Mission 04-J — EXPERIMENT (local only). A step's final write (Continue
 * or skip), with « deux écritures, une seule requête ».
 *
 *   - The autosave still OWES the typed text (scheduled, or failed —
 *     e.g. an answer lost on the way back): the combined request stands
 *     in for that save (`persistVia`), inside the revision coordinator's
 *     FIFO queue. Server side: write 1 (text), then write 2 (step).
 *   - Nothing owed (idle / saved): the same combined request; its write 1
 *     is then a no-op (no change, no write) — one write, as before — and
 *     a retry after an unconfirmed answer is reconciled server-side.
 *   - A save IN FLIGHT: the historical order, unchanged: flush(), then
 *     the final write through the historical transport.
 *   - The memorial was published since the page was rendered
 *     (`unsupported`): the historical path, two requests, audit intact.
 *   - No combined transport (guest Builder, demo, published memorial):
 *     the historical path.
 *
 * Outcomes:
 *   - resolves → text AND step durably saved;
 *   - rejects with DraftRevisionConflictError → nothing overwritten, the
 *     conflict notice shows (same as the historical second write);
 *   - rejects with StepNotValidatedError → the TEXT is saved (the autosave
 *     says so), the step is not: the screen stays, Continue can be retried;
 *   - rejects otherwise → nothing confirmed: the autosave is in error,
 *     the guard is up, nothing is shown as saved.
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
  status: AutosaveStatus;
  flush: () => Promise<void>;
  persistVia: (write: () => Promise<{ updatedAt: string }>) => Promise<void> | null;
}

export function useCombinedStepSave(
  autosave: Autosave,
  saveDraft: ((content: MemorialContent) => Promise<{ updatedAt: string; revision?: number }>) | undefined,
  combined: TextThenStepTransport | undefined,
): (text: MemorialContent, final: MemorialContent) => Promise<void> {
  const coordinator = useDraftRevisionCoordinator();
  const { status, flush, persistVia } = autosave;

  return useCallback(
    async (text: MemorialContent, final: MemorialContent) => {
      if (saveDraft === undefined) throw new Error("Draft persistence is unavailable.");

      const historical = async () => {
        await flush();
        await saveDraft(final);
      };
      if (combined === undefined || coordinator === null) return historical();

      const outcome: { step: StepWrite | null; unsupported: boolean } = { step: null, unsupported: false };
      const combinedWrite = async () => {
        try {
          return await coordinator.commit(text, async (expectedRevision) => {
            const response = await combined(text, final, expectedRevision);
            if (response.status === "unsupported") throw new UnsupportedSignal();
            if (response.text.status === "conflict") return { status: "conflict" as const };
            outcome.step = response.step;
            // The coordinator's revision follows what is durably stored.
            const last = response.step.status === "saved" ? response.step : response.text;
            return { status: "saved" as const, updatedAt: last.updatedAt, revision: last.revision };
          });
        } catch (error) {
          if (!(error instanceof UnsupportedSignal)) throw error;
          // Published meanwhile: the text goes through the historical transport.
          outcome.unsupported = true;
          return saveDraft(text);
        }
      };

      const handedOff = persistVia(combinedWrite);
      if (handedOff !== null) {
        await handedOff;
      } else if (status === "idle" || status === "saved") {
        await combinedWrite();
      } else {
        return historical(); // a save in flight: its order is kept
      }

      if (outcome.unsupported) {
        await saveDraft(final);
        return;
      }
      if (outcome.step?.status === "saved") return;
      if (outcome.step?.status === "conflict") {
        coordinator.reportConflict(final);
        throw new DraftRevisionConflictError();
      }
      throw new StepNotValidatedError();
    },
    [combined, coordinator, flush, persistVia, saveDraft, status],
  );
}
