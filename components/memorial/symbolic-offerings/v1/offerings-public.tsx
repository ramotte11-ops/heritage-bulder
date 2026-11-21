"use client";

import { useMemo, useRef, type ReactNode } from "react";
import type { OfferingKind } from "@/config/symbolic-offerings-v1-tokens";
import { OfferingsPreviewContext, type OfferingsPreviewValue } from "./offerings-preview";

/**
 * QG 016 — Offrandes symboliques V1 sur la page publique `/hommage/[slug]`.
 *
 * L'hôte public de la rubrique : il transmet le geste du visiteur au
 * serveur (`deposit`, l'action serveur de la page), qui l'enregistre par
 * `record_symbolic_offering_v1` — seule autorité sur ce qui est accepté
 * (mémorial publié et visible, rubrique non désactivée par la famille dans
 * la copie PUBLIÉE, ouverture, plafonds par mémorial, idempotence).
 *
 * Ce que l'hôte garantit en plus, côté visiteur :
 *  - UNE clé d'idempotence par geste : « Réessayer » après un échec renvoie
 *    la MÊME clé, donc une réponse perdue ne compte jamais deux fois ;
 *  - UN geste par visite de la page : « Poursuivre la visite » ne ramène
 *    pas aux cartes, il fait défiler vers la suite du mémorial ;
 *  - toute erreur (réseau, refus, exception) devient un simple échec :
 *    la scène affiche son message validé et « Réessayer » ;
 *  - Lot 2 : la signature facultative est envoyée APRÈS l'enregistrement,
 *    avec la MÊME clé que le geste : elle se rattache à cette ligne, sans
 *    en créer une autre. Sans geste enregistré (aucune clé), rien n'est
 *    envoyé ; un échec ne touche jamais au geste.
 */
export type DepositSymbolicOffering = (slug: string, kind: OfferingKind, idempotencyKey: string) => Promise<boolean>;

/** Lot 2 — rattache la signature facultative au geste DÉJÀ enregistré,
 * désigné par sa clé d'idempotence (connue de ce seul navigateur). */
export type SignSymbolicOffering = (slug: string, idempotencyKey: string, signature: string) => Promise<boolean>;

function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

/** « Poursuivre la visite » : vers la rubrique suivante, sinon la fin de page. */
export function continueVisitAfterOfferings(): void {
  const section = document.querySelector<HTMLElement>('[data-memorial-section="symbolicOfferings"]');
  const next = section?.nextElementSibling as HTMLElement | null | undefined;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const behavior: ScrollBehavior = reduced ? "auto" : "smooth";
  if (next) {
    next.scrollIntoView({ behavior, block: "start" });
    return;
  }
  const bottom = (section?.getBoundingClientRect().bottom ?? 0) + window.scrollY;
  window.scrollTo({ top: bottom, behavior });
}

export function PublicOfferingsProvider({
  slug,
  deposit,
  sign,
  children,
}: {
  slug: string;
  deposit: DepositSymbolicOffering;
  sign?: SignSymbolicOffering;
  children: ReactNode;
}) {
  const keys = useRef(new Map<OfferingKind, string>());
  const value = useMemo<OfferingsPreviewValue>(
    () => ({
      mode: "public",
      transmit: async (offering) => {
        let key = keys.current.get(offering);
        if (key === undefined) {
          key = newIdempotencyKey();
          keys.current.set(offering, key);
        }
        try {
          return (await deposit(slug, offering, key)) === true;
        } catch {
          return false;
        }
      },
      continueAction: () => continueVisitAfterOfferings(),
      ...(sign !== undefined && {
        sign: async (offering: OfferingKind, signature: string) => {
          const key = keys.current.get(offering);
          if (key === undefined) return false;
          try {
            return (await sign(slug, key, signature)) === true;
          } catch {
            return false;
          }
        },
      }),
    }),
    [slug, deposit, sign],
  );
  return <OfferingsPreviewContext.Provider value={value}>{children}</OfferingsPreviewContext.Provider>;
}
