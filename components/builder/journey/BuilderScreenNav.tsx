"use client";

import { useContext } from "react";
import { PreviewEntry } from "../preview/PreviewEntry";
import { PreviewEntryContext } from "../preview/BuilderPreviewHost";
import { JourneyEntry, JourneyRevisingNotice } from "./JourneyEntry";
import { useJourney } from "./journey-context";
import styles from "./JourneyEntry.module.css";

/**
 * B03 — the Builder chrome's navigation row, under the progress/autosave
 * zone: « Mon parcours » and, when the Preview is available, « Voir
 * l'aperçu » (Étape 3, unchanged), then the revision notice when a
 * screen is open for revision. Renders nothing — no reserved space —
 * when neither applies (T01, the Welcome, a screen outside any host).
 */
export function BuilderScreenNav() {
  const preview = useContext(PreviewEntryContext);
  const journey = useJourney();
  if (preview === null && journey === null) return null;

  return (
    <div className={styles.nav}>
      <div className={styles.navRow}>
        <JourneyEntry
          key={`${journey?.snapshot.revising ?? "list"}-${journey?.snapshot.reviewingSection ?? "normal"}`}
        />
        <PreviewEntry />
      </div>
      <JourneyRevisingNotice />
    </div>
  );
}
