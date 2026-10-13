import type { Language } from "@/config/languages";
import { translate } from "@/lib/i18n/translate";
import styles from "./PreviewLoading.module.css";

/**
 * « Voir l'aperçu » — the wait between the click and the opened Preview
 * (autosave drain + server read + assembly), shown by
 * `BuilderPreviewHost` for exactly as long as that real work lasts: no
 * minimum duration, no delay before it appears.
 *
 * A small keepsake album opening, its pages turning — pure CSS, no
 * image, no animation library. Under `prefers-reduced-motion` the album
 * is drawn already open and still; only the sentence remains.
 *
 * The veil covers the Builder so the control cannot be clicked twice and
 * no field is edited while the saved draft is being read.
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
