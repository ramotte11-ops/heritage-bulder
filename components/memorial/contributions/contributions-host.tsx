"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  PublicContribution,
  PublicContributionsInitial,
  PublicContributionsPage,
  RenewPhotosResult,
} from "@/lib/memorial/contributions/public-contribution-types";
import type { ContributionDepositActions } from "./deposit-transport";

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

/** M8-E6-F — le dépôt, transmis par la page SEULEMENT quand le verrou de publication est ouvert. */
export interface PublicContributionDeposit {
  slug: string;
  actions: ContributionDepositActions;
}

export type ContributionsHostValue =
  | { mode: "preview" }
  | { mode: "public"; initial: PublicContributionsInitial | null; loadMore?: LoadMoreContributions; renewPhotos?: RenewContributionPhotos; deposit?: PublicContributionDeposit };

const ContributionsHostContext = createContext<ContributionsHostValue>({ mode: "preview" });

export function PublicContributionsProvider({
  initial,
  loadMore,
  renewPhotos,
  deposit,
  children,
}: {
  initial: PublicContributionsInitial | null;
  loadMore?: LoadMoreContributions;
  renewPhotos?: RenewContributionPhotos;
  deposit?: PublicContributionDeposit;
  children: ReactNode;
}) {
  return <ContributionsHostContext.Provider value={{ mode: "public", initial, loadMore, renewPhotos, deposit }}>{children}</ContributionsHostContext.Provider>;
}

export function useContributionsHost(): ContributionsHostValue {
  return useContext(ContributionsHostContext);
}

/** Regroupement des demandes de renouvellement (plusieurs photos expirent ensemble). */
const RENEW_DEBOUNCE_MS = 250;
/** Une même photo n'est jamais redemandée plus de deux fois : un fichier réellement illisible n'entraîne pas de boucle. */
const RENEW_MAX_ATTEMPTS = 2;

export interface LivePublicContributions {
  initial: PublicContributionsInitial | null;
  /** L'Album déjà lu, continu, ordre P1. */
  items: PublicContribution[];
  /** Pour la scène O8 : les plus récentes des catégories absentes des pages lues. */
  sceneExtras: PublicContribution[];
  /** D'autres pages existent. */
  hasMore: boolean;
  /** Lit la page suivante (une seule requête à la fois ; sans effet s'il n'y en a plus). */
  loadNextPage: () => void;
  recoverPhoto: (contributionId: string) => void;
  /**
   * M8-E6-F — relit la première page (après une condoléance publiée par le
   * visiteur) : la nouvelle contribution apparaît aussitôt, en tête (P1).
   */
  refresh: () => void;
}

/**
 * M8-E3/E4 — l'état vivant des contributions publiques d'une visite.
 *
 *  - Pagination réelle, SANS plafond (P1) : la première page arrive avec la
 *    page ; chaque page suivante (100) n'est lue que lorsque le visiteur
 *    approche de la fin de l'Album (`loadNextPage`, une requête à la fois).
 *    Mémoire et requêtes suivent donc ce qui est réellement consulté, jamais
 *    le nombre total de contributions ; les photographies se chargent à
 *    l'approche de l'écran (`loading="lazy"`).
 *  - Liens expirés : une photo qui ne se charge plus est signalée
 *    (`recoverPhoto`) ; les demandes sont regroupées, le serveur relit ces
 *    contributions précises et ne rend un lien que pour une photo toujours
 *    publiée et autorisée. Une photo retirée entre-temps (`gone`) disparaît.
 */
export function useLivePublicContributions(host: ContributionsHostValue): LivePublicContributions {
  const initial = host.mode === "public" ? host.initial : null;
  const loadMore = host.mode === "public" ? host.loadMore : undefined;
  const renewPhotos = host.mode === "public" ? host.renewPhotos : undefined;
  const [pages, setPages] = useState<PublicContribution[]>([]);
  const [fresh, setFresh] = useState<PublicContribution[]>([]);
  const [cursor, setCursor] = useState<string | null>(initial && !initial.complete ? initial.nextCursor : null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());
  const inFlight = useRef(false);

  const loadNextPage = useCallback(() => {
    if (!loadMore || cursor === null || inFlight.current) return;
    inFlight.current = true;
    const from = cursor;
    void loadMore(from)
      .then((page) => {
        if (!("items" in page)) return;
        setPages((previous) => [...previous, ...page.items]);
        setCursor(page.nextCursor);
      })
      .catch(() => undefined)
      .finally(() => {
        inFlight.current = false;
      });
  }, [loadMore, cursor]);

  const refresh = useCallback(() => {
    if (!loadMore) return;
    void loadMore("")
      .then((page) => {
        if ("items" in page) setFresh(page.items);
      })
      .catch(() => undefined);
  }, [loadMore]);

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

  // Identités stables tant que rien ne change : la scène et l'Album ne sont recomposés qu'à bon escient.
  const live = useCallback(
    (c: PublicContribution) => (c.photo && urls[c.id] ? { ...c, photo: { ...c.photo, url: urls[c.id] } } : c),
    [urls],
  );
  const items = useMemo(() => {
    const seen = new Set<string>();
    return (initial ? [...fresh, ...initial.items, ...pages] : [])
      .filter((c) => !gone.has(c.id) && !seen.has(c.id) && (seen.add(c.id), true))
      .map(live);
  }, [initial, fresh, pages, gone, live]);
  const sceneExtras = useMemo(() => {
    const inAlbum = new Set(items.map((c) => c.id));
    return (initial?.sceneExtras ?? []).filter((c) => !gone.has(c.id) && !inAlbum.has(c.id)).map(live);
  }, [initial, items, gone, live]);
  return { initial, items, sceneExtras, hasMore: cursor !== null, loadNextPage, recoverPhoto, refresh };
}
