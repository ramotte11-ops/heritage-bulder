"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { PublicContributionsInitial } from "@/lib/memorial/contributions/public-contribution-types";

/**
 * M8-E3 — O10 : l'hôte de la rubrique « Contributions des proches » a deux
 * modes, comme celui des Offrandes symboliques.
 *
 *  - `preview` (DÉFAUT, sans fournisseur) : le Builder et son Aperçu. La
 *    rubrique montre la démonstration M7 (cartes fictives, mention
 *    « aperçu »), jamais une contribution réelle.
 *  - `public` : la page `/hommage/[slug]` seulement. Les contributions
 *    RÉELLES lues par le serveur pour cette visite ; jamais de démonstration
 *    (même en cas d'échec de lecture : `initial` vaut alors `null` et la
 *    rubrique n'est pas dessinée).
 *
 * Le type importé ne l'est qu'en tant que type : aucun module serveur
 * n'entre dans le bundle client.
 */
export type ContributionsHostValue = { mode: "preview" } | { mode: "public"; initial: PublicContributionsInitial | null };

const ContributionsHostContext = createContext<ContributionsHostValue>({ mode: "preview" });

export function PublicContributionsProvider({ initial, children }: { initial: PublicContributionsInitial | null; children: ReactNode }) {
  return <ContributionsHostContext.Provider value={{ mode: "public", initial }}>{children}</ContributionsHostContext.Provider>;
}

export function useContributionsHost(): ContributionsHostValue {
  return useContext(ContributionsHostContext);
}
