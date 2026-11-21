"use client";

import { createContext, useContext } from "react";

/**
 * M8-E3 — une photographie dont le lien signé a expiré (ou qui ne se charge
 * pas) le signale à l'hôte, par l'identifiant de sa contribution. L'hôte
 * public demande alors au serveur un nouveau lien (renewContributionPhotos) ;
 * sans hôte (Builder, pages pilotes), rien ne se passe.
 */
const PhotoRecoveryContext = createContext<(contributionId: string) => void>(() => {});

export const ContributionsPhotoRecoveryProvider = PhotoRecoveryContext.Provider;

export function useContributionsPhotoRecovery(): (contributionId: string) => void {
  return useContext(PhotoRecoveryContext);
}
