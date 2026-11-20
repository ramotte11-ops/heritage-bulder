"use client";

import { useMemo, type RefObject } from "react";
import type { Language } from "@/config/languages";
import type { ContributionsTheme } from "@/config/contributions-master-measurements";
import type { ContributionsFeatures } from "@/lib/memorial/contributions/contributions-settings";
import { ContributionDepositWindow } from "./ContributionDepositWindow";
import { createContributionDepositTransport, type ContributionDepositActions } from "./deposit-transport";

/**
 * M8-E6-F — la lettre raccordée au dépôt RÉEL (Server Actions E2), pour la
 * page publique. Module chargé à la demande par la rubrique, au premier clic
 * sur « Laisser un message » : ni la lettre, ni le transport (préparation
 * des photos, client de stockage) n'entrent dans le code initial de la page,
 * ni dans celui du Builder, dont l'Aperçu ne dépose jamais.
 */
export interface PublicDepositLetterProps {
  slug: string;
  actions: ContributionDepositActions;
  language: Language;
  theme: ContributionsTheme;
  categories: ContributionsFeatures;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLElement | null>;
  fontsClassName: string;
  onDeposited: (kind: string, status: "published" | "pending") => void;
}

export default function PublicDepositLetter({ slug, actions, ...window }: PublicDepositLetterProps) {
  const transport = useMemo(() => createContributionDepositTransport(slug, actions), [slug, actions]);
  return <ContributionDepositWindow {...window} transport={transport} />;
}
