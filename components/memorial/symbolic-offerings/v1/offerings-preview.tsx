"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { OfferingKind } from "@/config/symbolic-offerings-v1-tokens";

/**
 * Offrandes symboliques V1 — l'HÔTE qui fait exister la rubrique.
 *
 * Sans ce contexte, `SymbolicOfferingsV1Section` ne dessine rien (fail
 * closed). Deux hôtes, et deux seulement :
 *
 *  - la Preview du Builder (M3, `OfferingsPreviewProvider`) : transmission
 *    SIMULÉE — la famille essaie librement les trois gestes, revient aux
 *    cartes et recommence ; rien n'est envoyé, rien n'est enregistré, une
 *    mention « aperçu » est posée au-dessus de la composition ;
 *  - la page publique `/hommage/[slug]` (QG 016, `PublicOfferingsProvider`,
 *    ./offerings-public.tsx) : le geste du visiteur est RÉELLEMENT
 *    enregistré par le serveur (record_symbolic_offering_v1), un geste par
 *    visite de la page, sans mention d'aperçu.
 */
export interface OfferingsPreviewValue {
  /** Transmission du geste ; `true` = enregistré (ou simulé en Preview). */
  transmit: (offering: OfferingKind) => Promise<boolean>;
  /** `"preview"` (défaut) : mention d'aperçu, retour aux cartes.
   * `"public"` : aucune mention ; « Poursuivre la visite » = `continueAction`. */
  mode?: "preview" | "public";
  /** Hôte public seulement : action de « Poursuivre la visite ». */
  continueAction?: (offering: OfferingKind) => void;
}

/** Délai de la réponse simulée : le temps d'un aller-retour serveur
 * ordinaire. La confirmation attend de toute façon la fin du mouvement. */
export const SIMULATED_RESPONSE_MS = 400;

/** La réponse serveur simulée de la Preview : favorable, après un court
 * délai. Ne touche ni au réseau ni à Supabase. */
export function simulatedOfferingTransmit(): Promise<boolean> {
  return new Promise((resolve) => setTimeout(() => resolve(true), SIMULATED_RESPONSE_MS));
}

const PREVIEW_VALUE: OfferingsPreviewValue = { transmit: simulatedOfferingTransmit, mode: "preview" };

export const OfferingsPreviewContext = createContext<OfferingsPreviewValue | null>(null);

export function OfferingsPreviewProvider({ children }: { children: ReactNode }) {
  return <OfferingsPreviewContext.Provider value={PREVIEW_VALUE}>{children}</OfferingsPreviewContext.Provider>;
}

export function useOfferingsPreview(): OfferingsPreviewValue | null {
  return useContext(OfferingsPreviewContext);
}
