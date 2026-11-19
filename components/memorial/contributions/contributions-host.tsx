"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  PublicContribution,
  PublicContributionsInitial,
  PublicContributionsPage,
  RenewPhotosResult,
} from "@/lib/memorial/contributions/public-contribution-types";

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
 * Les fonctions sont des Server Actions liées au slug par la page : le
 * navigateur ne choisit ni l'hommage ni ce qui est lisible.
 */
export type LoadMoreContributions = (cursor: string) => Promise<PublicContributionsPage | { status: string }>;
export type RenewContributionPhotos = (ids: string[]) => Promise<RenewPhotosResult | { status: string }>;

export type ContributionsHostValue =
  | { mode: "preview" }
  | { mode: "public"; initial: PublicContributionsInitial | null; loadMore?: LoadMoreContributions; renewPhotos?: RenewContributionPhotos };

const ContributionsHostContext = createContext<ContributionsHostValue>({ mode: "preview" });

export function PublicContributionsProvider({
  initial,
  loadMore,
  renewPhotos,
  children,
}: {
  initial: PublicContributionsInitial | null;
  loadMore?: LoadMoreContributions;
  renewPhotos?: RenewContributionPhotos;
  children: ReactNode;
}) {
  return <ContributionsHostContext.Provider value={{ mode: "public", initial, loadMore, renewPhotos }}>{children}</ContributionsHostContext.Provider>;
}

export function useContributionsHost(): ContributionsHostValue {
  return useContext(ContributionsHostContext);
}

/** Plafond absolu de l'Album dans une page (au-delà : l'hommage reste lisible, l'Album s'arrête). */
export const PUBLIC_ALBUM_HARD_CAP = 5000;
/** Délai entre deux pages chargées en arrière-plan : la page reste fluide. */
const PAGE_PAUSE_MS = 150;
/** Regroupement des demandes de renouvellement (plusieurs photos expirent ensemble). */
const RENEW_DEBOUNCE_MS = 250;
/** Une même photo n'est jamais redemandée plus de deux fois : un fichier réellement illisible n'entraîne pas de boucle. */
const RENEW_MAX_ATTEMPTS = 2;

/**
 * M8-E3 — l'état vivant des contributions publiques d'une visite.
 *
 *  - Pagination progressive (P1) : au-delà des 500 premières, les pages
 *    suivantes sont lues en arrière-plan, une à une, et ajoutées à la fin
 *    (ordre P1 conservé) jusqu'à la dernière ou au plafond.
 *  - Liens expirés : une photo qui ne se charge plus est signalée
 *    (`recoverPhoto`) ; les demandes sont regroupées, le serveur ne rend un
 *    nouveau lien que pour une photo toujours publiée et autorisée. Une photo
 *    retirée entre-temps (`gone`) disparaît de l'affichage. Les photos déjà
 *    affichées gardent leur lien : rien ne se recharge inutilement.
 */
export function useLivePublicContributions(host: ContributionsHostValue): {
  initial: PublicContributionsInitial | null;
  items: PublicContribution[];
  complete: boolean;
  recoverPhoto: (contributionId: string) => void;
} {
  const initial = host.mode === "public" ? host.initial : null;
  const loadMore = host.mode === "public" ? host.loadMore : undefined;
  const renewPhotos = host.mode === "public" ? host.renewPhotos : undefined;
  const [extra, setExtra] = useState<PublicContribution[]>([]);
  const [complete, setComplete] = useState(initial?.complete ?? true);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());

  // Pagination progressive.
  useEffect(() => {
    if (!initial || initial.complete || !initial.nextCursor || !loadMore) return;
    let cancelled = false;
    let cursor: string | null = initial.nextCursor;
    let count = initial.items.length;
    const step = async () => {
      while (!cancelled && cursor !== null && count < PUBLIC_ALBUM_HARD_CAP) {
        let page: PublicContributionsPage | { status: string };
        try {
          page = await loadMore(cursor);
        } catch {
          return;
        }
        if (cancelled || !("items" in page)) return;
        count += page.items.length;
        const items = page.items;
        setExtra((previous) => [...previous, ...items]);
        cursor = page.nextCursor;
        if (cursor === null) setComplete(true);
        await new Promise((r) => setTimeout(r, PAGE_PAUSE_MS));
      }
    };
    void step();
    return () => {
      cancelled = true;
    };
  }, [initial, loadMore]);

  // Renouvellement des liens.
  const pending = useRef(new Set<string>());
  const attempts = useRef(new Map<string, number>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = useCallback(async () => {
    timer.current = null;
    const ids = [...pending.current];
    pending.current.clear();
    if (ids.length === 0 || !renewPhotos) return;
    let result: RenewPhotosResult | { status: string };
    try {
      result = await renewPhotos(ids);
    } catch {
      return;
    }
    if (result.status !== "ok" || !("renewed" in result)) return;
    const { renewed, gone: removed } = result;
    setUrls((previous) => ({ ...previous, ...renewed }));
    if (removed.length > 0) setGone((previous) => new Set([...previous, ...removed]));
  }, [renewPhotos]);
  const recoverPhoto = useCallback(
    (id: string) => {
      if (!renewPhotos) return;
      const n = attempts.current.get(id) ?? 0;
      if (n >= RENEW_MAX_ATTEMPTS) return;
      attempts.current.set(id, n + 1);
      pending.current.add(id);
      if (timer.current === null) timer.current = setTimeout(() => void flush(), RENEW_DEBOUNCE_MS);
    },
    [renewPhotos, flush],
  );
  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
  }, []);

  // Identité stable tant que rien ne change : la scène et l'Album ne sont recomposés qu'à bon escient.
  const items = useMemo(
    () =>
      (initial ? [...initial.items, ...extra] : [])
        .filter((c) => !gone.has(c.id))
        .map((c) => (c.photo && urls[c.id] ? { ...c, photo: { ...c.photo, url: urls[c.id] } } : c)),
    [initial, extra, urls, gone],
  );
  return { initial, items, complete, recoverPhoto };
}
