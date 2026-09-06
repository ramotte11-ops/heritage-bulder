import type { ReactNode } from "react";
import { ProgressBar } from "./ProgressBar";
import { playfairDisplay, inter } from "./fonts";
import styles from "./BuilderScreen.module.css";

interface BuilderScreenProps {
  /** 0 to 1 — see ProgressBar's own docstring for why this is a
   * fraction, never a step count. Each screen decides its own value. */
  progress: number;
  children: ReactNode;
}

/**
 * Mission 024 — the chrome every Builder Guided Flow screen shares:
 * the real Studio background (mobile/desktop, Mission 023C), the
 * HERITAGE Hommage logo, the "Stories live forever" signature, the
 * centered content frame, and the progress indicator.
 *
 * Extracted from Mission 023's `LanguageStep` (T01) — same markup, same
 * CSS values, nothing repositioned or re-tuned. T01 is locked and was
 * not redesigned by this extraction: `LanguageStep` now composes THIS
 * component instead of repeating its markup, but its rendered output
 * is the same (re-verified by screenshot, not just by inspection — see
 * the Mission 024 report). The point of pulling this out now, on the
 * second screen that needs it, is exactly what the mission brief asks
 * for ("le Builder utilise désormais la grammaire commune validée avec
 * T01"): one literal source for this chrome, so T01 and T02 (and every
 * future Guided Flow step) cannot silently drift apart the way two
 * hand-copied instances eventually would.
 *
 * Takes only `progress` and `children` — nothing about language,
 * editorial context, or any other domain concept. A screen's own body
 * (title, copy, options, CTA, form) is entirely its own concern,
 * composed as `children`.
 */
export function BuilderScreen({ progress, children }: BuilderScreenProps) {
  return (
    <main className={`${styles.page} ${playfairDisplay.variable} ${inter.variable}`}>
      <p className={styles.signature}>
        Stories
        <br />
        live
        <br />
        forever
      </p>

      <div className={styles.frame}>
        <header className={styles.brand}>
          <p className={styles.wordmark}>HERITAGE</p>
          <p className={styles.wordmarkSub}>Hommage</p>
        </header>

        <ProgressBar value={progress} />

        {children}
      </div>
    </main>
  );
}
