"use client";

import type { Language } from "@/config/languages";
import type { SkinVariant } from "@/config/skins";
import { SymbolicOfferingsV1 } from "./SymbolicOfferingsSceneV1";
import { useOfferingsPreview } from "./offerings-preview";
import { OFFERINGS_V1_TEXTS } from "./texts";
import styles from "./SymbolicOfferingsV1Section.module.css";

/**
 * Offrandes symboliques V1 — la rubrique du Memorial assemblé.
 *
 * Hors d'un hôte (`OfferingsPreviewContext`), elle ne dessine rien — ni
 * carte, ni scène, ni espace réservé (fail closed). Elle reprend tel quel
 * le composant M2 validé (douze compositions, transition A, animations) ;
 * les Masters ne sont jamais modifiés.
 *
 *  - Preview du Builder : essais libres des trois gestes, retour aux
 *    cartes par « Poursuivre la visite », réponse SIMULÉE annoncée par une
 *    mention posée AU-DESSUS de la composition, dans la langue du mémorial ;
 *  - page publique (QG 016) : aucune mention ; le geste est réellement
 *    transmis par l'hôte public ; « Poursuivre la visite » appelle l'action
 *    de l'hôte (la scène confirmée reste affichée : un geste par visite).
 */
export interface SymbolicOfferingsV1SectionProps {
  skinVariant: SkinVariant;
  language: Language;
}

export function SymbolicOfferingsV1Section({ skinVariant, language }: SymbolicOfferingsV1SectionProps) {
  const host = useOfferingsPreview();
  if (host === null) return null;

  if (host.mode === "public") {
    return (
      <div data-offerings-public="" lang={language}>
        <SymbolicOfferingsV1
          skinVariant={skinVariant}
          language={language}
          transmit={host.transmit}
          continueAction={host.continueAction ?? null}
        />
      </div>
    );
  }

  return (
    <div data-offerings-preview="" lang={language}>
      <p role="note" className={styles.notice} data-variant={skinVariant}>
        {OFFERINGS_V1_TEXTS[language].previewNotice}
      </p>
      <SymbolicOfferingsV1
        skinVariant={skinVariant}
        language={language}
        transmit={host.transmit}
        continueAction="returnToCards"
      />
    </div>
  );
}
