import type { A13Slot } from "@/config/gallery-a13-pilot-manifest";
import { A13_PILOT_BACKGROUND_SRC, A13_PILOT_LAYER_Z } from "@/config/gallery-a13-pilot-manifest";
import type { PolaroidLayout } from "@/lib/memorial/gallery/dynamic-polaroid-layout";
import { ebGaramond, ebGaramondItalic, laBelleAurore } from "@/components/builder/fonts";
import { DynamicPolaroid } from "./DynamicPolaroid";
import styles from "./A13PilotScene.module.css";

/**
 * A13 G6 Desktop Light — PILOT scene: photo-free GREEN background + six
 * `DynamicPolaroid` + runtime title. Nothing else.
 *
 * - FOREGROUND O1/O2: DEFERRED — POST PILOT (QG). Not rendered, not approximated.
 * - One canvas, 1670 × 941, scaled uniformly with the rendered width and
 *   capped at 1670 (`.stage` max-width): `--k = 100cqw / 1670`.
 * - Slots render in manifest order; stacking is the manifest z-index only
 *   (V2: D1 30 → D6 35 → D2 40 → D4 50 → D3 60 → D5 70).
 */

export interface A13PilotSceneEntry {
  slot: A13Slot;
  layout: PolaroidLayout | null;
  src: string | null;
  alt: string;
  caption: string | null;
}

export interface A13PilotSceneProps {
  entries: A13PilotSceneEntry[];
  title: string;
  subtitle: string;
  qa?: boolean;
}

export function A13PilotScene({ entries, title, subtitle, qa = false }: A13PilotSceneProps) {
  return (
    <div className={`${styles.stage} ${laBelleAurore.variable}`} data-testid="a13-pilot-scene">
      <div className={styles.canvas}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={A13_PILOT_BACKGROUND_SRC}
          alt=""
          aria-hidden="true"
          className={styles.background}
          style={{ zIndex: A13_PILOT_LAYER_Z.background }}
          draggable={false}
        />
        {entries.map(({ slot, layout, src, alt, caption }) =>
          layout && src ? (
            <DynamicPolaroid key={slot.slotId} slot={slot} layout={layout} src={src} alt={alt} caption={caption} qa={qa} />
          ) : null,
        )}
        <header className={styles.titleBlock} style={{ zIndex: A13_PILOT_LAYER_Z.runtimeText }}>
          <h2 className={`${styles.title} ${ebGaramond.className}`}>{title}</h2>
          <p className={`${styles.subtitle} ${ebGaramondItalic.className}`}>{subtitle}</p>
        </header>
        {qa ? <div className={styles.qaTitleZone} aria-hidden="true" /> : null}
      </div>
    </div>
  );
}
