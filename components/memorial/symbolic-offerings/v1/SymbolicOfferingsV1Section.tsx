"use client";

import type { SkinVariant } from "@/config/skins";
import { SymbolicOfferingsV1 } from "./SymbolicOfferingsSceneV1";
import { useOfferingsPreview } from "./offerings-preview";
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
 * mention posée AU-DESSUS de la composition (jamais dans les Masters).
 */
export const OFFERINGS_PREVIEW_NOTICE_FR =
  "Aperçu — essai libre des gestes. La confirmation est simulée : aucun geste n’est enregistré.";

export interface SymbolicOfferingsV1SectionProps {
  skinVariant: SkinVariant;
}

export function SymbolicOfferingsV1Section({ skinVariant }: SymbolicOfferingsV1SectionProps) {
  const preview = useOfferingsPreview();
  if (preview === null) return null;

  return (
    <div data-offerings-preview="" lang="fr">
      <p role="note" className={styles.notice} data-variant={skinVariant}>
        {OFFERINGS_PREVIEW_NOTICE_FR}
      </p>
      <SymbolicOfferingsV1 skinVariant={skinVariant} transmit={preview.transmit} continueAction="returnToCards" />
    </div>
  );
}
