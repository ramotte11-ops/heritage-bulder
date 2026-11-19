"use client";

import { createContext, useContext } from "react";
import { contributionsLabels, type ContributionsLabels } from "@/lib/memorial/contributions/contributions-labels";

/**
 * M8-E3 — les libellés FR/EN/ES de la rubrique, fournis par l'hôte
 * (`ContributionsV1Section`). Sans hôte (pages pilotes, tests M4–M7), le
 * français des Masters, exactement comme avant.
 */
const ContributionsLabelsContext = createContext<ContributionsLabels>(contributionsLabels("fr"));

export const ContributionsLabelsProvider = ContributionsLabelsContext.Provider;

export function useContributionsLabels(): ContributionsLabels {
  return useContext(ContributionsLabelsContext);
}
