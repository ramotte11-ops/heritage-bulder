"use client";

import { useContext } from "react";
import { translate } from "@/lib/i18n/translate";
import { PendingActionLabel } from "../PendingActionLabel";
import { PreviewEntryContext } from "./BuilderPreviewHost";
import styles from "./BuilderPreviewHost.module.css";

/**
 * Étape 3 — "Voir l'aperçu", rendered by `BuilderScreen` under the
 * progress/autosave zone (QG Q4). Renders nothing at all — no reserved
 * space — outside a `BuilderPreviewHost`, before T08, for a skin with no
 * Hero renderer, and on the Reveal screens (the host decides all of
 * that; this control only reads it).
 */
export function PreviewEntry() {
  const entry = useContext(PreviewEntryContext);
  if (entry === null) return null;
  const { language, busy, unavailable, open, registerButton } = entry;

  return (
    <div className={styles.entry}>
      <button
        ref={registerButton}
        type="button"
        className={styles.entryButton}
        aria-label={busy ? translate(language, "preview.loading") : undefined}
        aria-busy={busy}
        disabled={busy}
        onClick={open}
      >
        <span aria-hidden={busy || undefined}>
          <PendingActionLabel pending={busy} pendingLabel={translate(language, "preview.loading")}>
            {translate(language, "preview.view")}
          </PendingActionLabel>
        </span>
      </button>
      {unavailable && (
        <p role="alert" className={styles.entryError}>
          {translate(language, "preview.unavailable")}
        </p>
      )}
    </div>
  );
}
