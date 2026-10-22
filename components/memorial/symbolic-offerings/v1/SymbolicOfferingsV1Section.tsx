"use client";

import type { Language } from "@/config/languages";
import type { SkinVariant } from "@/config/skins";
import { SymbolicOfferingsV1 } from "./SymbolicOfferingsSceneV1";
import { useOfferingsPreview } from "./offerings-preview";
import { OFFERINGS_V1_TEXTS } from "./texts";
import styles from "./SymbolicOfferingsV1Section.module.css";

/**
 * Offrandes symboliques V1 — la rubrique du Memorial assemblé (M3).
 *
 * Builder Preview SEULEMENT : hors du contexte fourni par la Preview
 * (`OfferingsPreviewProvider`), elle ne dessine rien — ni carte, ni
 * scène, ni espace réservé. Dans la Preview, elle reprend tel quel le
 * composant M2 validé (douze compositions, transition A, animations) :
 * essais libres des trois gestes et retour aux cartes par « Poursuivre
 * la visite », avec une réponse serveur SIMULÉE, annoncée par une
 * mention posée AU-DESSUS de la composition (jamais dans les Masters),
 * dans la langue du mémorial.
 */
export interface SymbolicOfferingsV1SectionProps {
  skinVariant: SkinVariant;
  language: Language;
}

export function SymbolicOfferingsV1Section({ skinVariant, language }: SymbolicOfferingsV1SectionProps) {
  const preview = useOfferingsPreview();
  if (preview === null) return null;

  return (
    <div data-offerings-preview="" lang={language}>
      <p role="note" className={styles.notice} data-variant={skinVariant}>
        {OFFERINGS_V1_TEXTS[language].previewNotice}
      </p>
      <SymbolicOfferingsV1
        skinVariant={skinVariant}
        language={language}
        transmit={preview.transmit}
        continueAction="returnToCards"
      />
    </div>
  );
}
