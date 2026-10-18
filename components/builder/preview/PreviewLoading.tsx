import type { Language } from "@/config/languages";
import { translate } from "@/lib/i18n/translate";
import styles from "./PreviewLoading.module.css";

/**
 * « Voir l'aperçu » — the wait between the click and the opened Preview
 * (autosave drain + server read + assembly), shown by
 * `BuilderPreviewHost` for exactly as long as that real work lasts: no
 * minimum duration, no delay before it appears.
 *
 * Reused from PR #52: a small keepsake album opening, its pages turning
 * in pure CSS. Under `prefers-reduced-motion` the album is already open
 * and still; only the sentence remains.
 */
export function PreviewLoading({ language }: { language: Language }) {
  return (
    <div className={styles.veil} data-preview-loading="">
      <div className={styles.card} role="status" aria-live="polite">
        <div className={styles.album} aria-hidden="true">
          <span className={styles.board} />
          <span className={`${styles.leaf} ${styles.leafOne}`} />
          <span className={`${styles.leaf} ${styles.leafTwo}`} />
          <span className={styles.cover} />
        </div>
        <p className={styles.text}>{translate(language, "preview.loading")}</p>
      </div>
    </div>
  );
}
