"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { Language } from "@/config/languages";
import type { SkinVariant } from "@/config/skins";
import { CONTRIBUTIONS_MOBILE_LAYOUTS } from "@/config/contributions-mobile-v1";
import { builderDemoScene, visibleDemoPlacements, type BuilderDemoFrame } from "@/lib/memorial/contributions/builder-demo";
import type { ContributionsFeatures } from "@/lib/memorial/contributions/contributions-settings";
import { DEMO_CLOSING, DEMO_SUBTITLE, DEMO_TITLE } from "@/lib/memorial/contributions/demo-contributions";
import { ContributionsSceneDesktop } from "./ContributionsSceneDesktop";
import { ContributionsSceneMobileP1 } from "./ContributionsSceneMobileP1";
import { ebGaramond, ebGaramondItalic, laBelleAurore, offeringsMediumSerif } from "@/components/builder/fonts";
import { contributionsSignatureScript } from "./contribution-fonts";
import styles from "./ContributionsBuilderPreview.module.css";

/** Les polices de la scène (Masters), posées par l'aperçu lui-même : l'écran du Builder ne les charge pas. */
const SCENE_FONTS = [ebGaramond, ebGaramondItalic, offeringsMediumSerif, laBelleAurore, contributionsSignatureScript].map((f) => f.variable).join(" ");

/**
 * M7 — l'aperçu artistique de l'étape A15 : la scène VALIDÉE (Desktop M5-A
 * ou Mobile P1 M5-C, Light / Dark selon l'ambiance choisie en T08), avec
 * les exemples fictifs des fonctionnalités ouvertes, chacun à son
 * emplacement de Master (`builder-demo.ts`). Rien n'est recomposé : une carte
 * apparaît (fondu doux, désactivé si l'on préfère moins d'animation) ou
 * disparaît, les autres ne bougent pas.
 *
 * - Repère : Desktop dès 64 rem (1024 px) de fenêtre, comme la rubrique et
 *   le pont A13 ; l'aperçu mesure alors de 992 à 1180 px. En deçà, la scène
 *   Mobile P1, à la largeur de la fenêtre (au plus 430 px : la plage validée).
 * - Les cartes s'ouvrent au toucher (lecture agrandie M5-C) ; « Laisser un
 *   message » et « Voir tous » restent des boutons de démonstration inertes.
 * - Les textes de la scène sont ceux des Masters, en français : hors du
 *   français, l'aperçu n'est pas dessiné (aucune traduction non validée), un
 *   message neutre le dit (`unavailableLabel`).
 */

export interface ContributionsBuilderPreviewProps {
  features: ContributionsFeatures;
  skinVariant: SkinVariant;
  language: Language;
  /** Libellés de l'étape (Builder), dans la langue du mémorial. */
  labels: { region: string; note: string; empty: string; unavailable: string };
}

/** Langues dont les textes de la scène sont validés (ceux des Masters). */
export const CONTRIBUTIONS_SCENE_LANGUAGES: readonly Language[] = ["fr"];

/** La scène Desktop dès 64 rem (1024 px) de fenêtre : elle mesure alors de 992 à 1180 px. */
export const CONTRIBUTIONS_BUILDER_DESKTOP_QUERY = "(min-width: 64rem)";

export function ContributionsBuilderPreview({ features, skinVariant, language, labels }: ContributionsBuilderPreviewProps) {
  const ref = useRef<HTMLElement>(null);
  // Desktop ou Mobile : le point de rupture de la FENÊTRE (64 rem), celui de la mise en page de l'aperçu.
  const [desktop, setDesktop] = useState<boolean | null>(null);
  useLayoutEffect(() => {
    const mq = typeof window.matchMedia === "function" ? window.matchMedia(CONTRIBUTIONS_BUILDER_DESKTOP_QUERY) : null;
    const read = () => setDesktop(mq?.matches ?? false);
    read();
    mq?.addEventListener?.("change", read);
    return () => mq?.removeEventListener?.("change", read);
  }, []);

  const available = CONTRIBUTIONS_SCENE_LANGUAGES.includes(language);
  const frame: BuilderDemoFrame | null = desktop === null ? null : desktop ? "desktop" : "mobile";
  const scene = frame && available ? builderDemoScene(frame, skinVariant) : null;
  const placements = scene ? visibleDemoPlacements(scene, features) : [];

  return (
    <section ref={ref} className={`${styles.preview} ${SCENE_FONTS}`} aria-label={labels.region} data-contributions-builder-preview="" data-frame={frame ?? "pending"} data-visible-count={placements.length}>
      {!available ? (
        <p role="note" className={styles.notice}>
          {labels.unavailable}
        </p>
      ) : (
        <>
          <p role="note" className={styles.notice} data-variant={skinVariant}>
            {placements.length ? labels.note : labels.empty}
          </p>
          {scene ? (
            <div className={styles.stage} data-demo-scene="">
              {scene.frame === "desktop" ? (
                <ContributionsSceneDesktop theme={skinVariant} placements={placements} contents={scene.contents} viewAll={placements.length >= 4} title={DEMO_TITLE} subtitle={DEMO_SUBTITLE} closing={DEMO_CLOSING} />
              ) : (
                <ContributionsSceneMobileP1
                  theme={skinVariant}
                  layout={CONTRIBUTIONS_MOBILE_LAYOUTS["grille-2x2"]}
                  placements={placements}
                  contents={scene.contents}
                  viewAll={placements.length >= 4}
                  title={DEMO_TITLE}
                  subtitle={DEMO_SUBTITLE}
                  closing={DEMO_CLOSING}
                />
              )}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
