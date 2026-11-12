"use client";

import { useContext } from "react";
import { translate } from "@/lib/i18n/translate";
import { PendingActionLabel } from "../PendingActionLabel";
import { PreviewEntryContext } from "./BuilderPreviewHost";
import styles from "./PreviewPublicationPanel.module.css";

/**
 * QG 008 Lot 3 — the end of the authenticated Builder's Guided Flow leads
 * to the private Preview first: the only place where « Publier » exists.
 * Opens the Preview through the surrounding BuilderPreviewHost (same
 * three steps as « Voir l'aperçu »: drain the autosave, read the saved
 * draft server-side, assemble). Renders nothing outside a host or while
 * the Preview is not available.
 */
export function PausePreviewCta() {
  const entry = useContext(PreviewEntryContext);
  if (entry === null) return null;
  const { language, busy, open } = entry;
  return (
    <button type="button" className={styles.primary} aria-busy={busy} disabled={busy} onClick={open} data-pause-preview="">
      <PendingActionLabel pending={busy} pendingLabel={translate(language, "preview.loading")}>
        {translate(language, "flowPause.openPreview")}
      </PendingActionLabel>
    </button>
  );
}
