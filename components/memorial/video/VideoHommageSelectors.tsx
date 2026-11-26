"use client";

import { formatVideoDuration, videoDisplayTitle, type VideoHommageItem } from "@/lib/memorial/video/video-hommage";
import type { VideoHommageTexts } from "./texts";
import styles from "./VideoHommageV1.module.css";

/**
 * VID-05A — les sélecteurs discrets (2 ou 3 vidéos ; jamais pour une seule).
 *
 * Un bouton par vidéo : icône de lecture, titre (ou « Souvenir n » selon la
 * position actuelle), durée. Le bouton de la vidéo affichée porte
 * `aria-pressed="true"`. Un clic est une action explicite du visiteur : la
 * rubrique arrête la vidéo précédente et lance celle choisie (décision PO).
 */
export function VideoHommageSelectors({
  items,
  selectedIndex,
  texts,
  onSelect,
}: {
  items: readonly VideoHommageItem[];
  selectedIndex: number;
  texts: VideoHommageTexts;
  onSelect(index: number): void;
}) {
  return (
    <ul className={styles.selectors} aria-label={texts.selectorsLabel} data-video-selectors={items.length}>
      {items.map((item, index) => {
        const title = videoDisplayTitle(item, index, texts.defaultTitle);
        const duration = formatVideoDuration(item.durationSeconds);
        const selected = index === selectedIndex;
        return (
          <li key={item.id} className={styles.selectorItem}>
            <button
              type="button"
              className={styles.selector}
              aria-pressed={selected}
              aria-label={texts.selectLabel(title, duration)}
              data-video-selector={index}
              onClick={() => onSelect(index)}
            >
              <span className={styles.selectorIcon} aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                  <path d="M9 7.5v9l7.5-4.5z" />
                </svg>
              </span>
              <span className={styles.selectorTitle}>{title}</span>
              {duration !== null && (
                <>
                  <span className={styles.selectorRule} aria-hidden="true" />
                  <span className={styles.selectorDuration}>{duration}</span>
                </>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
