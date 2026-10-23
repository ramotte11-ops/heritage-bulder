"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { OfferingKind } from "@/config/symbolic-offerings-v1-tokens";

/**
 * Offrandes symboliques V1 — M3 : le seul hôte qui fait exister la
 * rubrique, la Preview du Builder.
 *
 * Sans ce contexte, `SymbolicOfferingsV1Section` ne dessine rien (fail
 * closed) : aucun geste de visiteur n'est public tant que sa persistance
 * n'existe pas. La Preview (`BuilderPreviewHost`) le fournit, avec une
 * transmission SIMULÉE : la famille essaie librement les trois gestes,
 * revient aux cartes et recommence ; rien n'est envoyé, rien n'est
 * enregistré, aucun compteur, aucune notification.
 */
export interface OfferingsPreviewValue {
  /** Toujours simulée en M3 : aucune requête réseau, aucune écriture. */
  transmit: (offering: OfferingKind) => Promise<boolean>;
}

/** Délai de la réponse simulée : le temps d'un aller-retour serveur
 * ordinaire. La confirmation attend de toute façon la fin du mouvement. */
export const SIMULATED_RESPONSE_MS = 400;

/** La réponse serveur simulée de la Preview : favorable, après un court
 * délai. Ne touche ni au réseau ni à Supabase. */
export function simulatedOfferingTransmit(): Promise<boolean> {
  return new Promise((resolve) => setTimeout(() => resolve(true), SIMULATED_RESPONSE_MS));
}

const PREVIEW_VALUE: OfferingsPreviewValue = { transmit: simulatedOfferingTransmit };

const OfferingsPreviewContext = createContext<OfferingsPreviewValue | null>(null);

export function OfferingsPreviewProvider({ children }: { children: ReactNode }) {
  return <OfferingsPreviewContext.Provider value={PREVIEW_VALUE}>{children}</OfferingsPreviewContext.Provider>;
}

export function useOfferingsPreview(): OfferingsPreviewValue | null {
  return useContext(OfferingsPreviewContext);
}
