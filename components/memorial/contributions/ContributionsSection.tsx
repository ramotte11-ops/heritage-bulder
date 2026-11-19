"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Language } from "@/config/languages";
import type { ContributionsTheme } from "@/config/contributions-master-measurements";
import { CONTRIBUTIONS_MOBILE_LAYOUTS } from "@/config/contributions-mobile-v1";
import type { ContributionsAlbumFrame } from "@/config/contributions-album-v1";
import { translate } from "@/lib/i18n/translate";
import { solveContributionsScene, type ContributionSceneItem } from "@/lib/memorial/contributions/contributions-scene";
import { createContributionsAlbumComposer, type ContributionsAlbumComposer, type ContributionsAlbumResult } from "@/lib/memorial/contributions/contributions-album";
import { ContributionsSceneDesktop, type ContributionContent } from "./ContributionsSceneDesktop";
import { ContributionsSceneMobileP1 } from "./ContributionsSceneMobileP1";
import { ContributionsAlbum } from "./ContributionsAlbum";
import { ContributionsSceneEmpty } from "./ContributionsSceneEmpty";
import styles from "./ContributionsSection.module.css";

/**
 * M6 — hôte de la rubrique « Contributions des proches » : la scène
 * principale (Desktop M5-A ou Mobile P1 M5-C) et, par « Voir tous les
 * messages », l'Album complet.
 *
 * Même convention que l'hôte de la Galerie A13 (`GalleryIntemporel`, QG D3) :
 *  - bascule scène ↔ Album en ÉTAT LOCAL : ni route, ni entrée d'historique ;
 *  - la scène est GARÉE (montée, sans hauteur, invisible : hors de l'ordre du
 *    focus et de l'arbre d'accessibilité), jamais démontée : au retour, sa
 *    composition et ses mesures sont celles d'avant ;
 *  - ouverture : la position de défilement est gardée, l'Album est amené en
 *    haut de la rubrique, le focus va sur « Retour » (`common.back`, libellé
 *    HERITAGE déjà validé) ;
 *  - retour : la scène revient, la position de défilement est restaurée, le
 *    focus revient sur « Voir tous les messages » ;
 *  - un Album que le moteur ne sait pas composer (STOP) n'est jamais
 *    ouvert : la scène reste en place, focus sur son bouton ; un STOP sur
 *    une planche tardive ramène à la scène comme « Retour ».
 * Composition progressive : les premières planches à l'ouverture, les
 * suivantes par tranches de 8 ms (un grand Album ne gèle jamais la page).
 * Aucun gestionnaire Échap global : Échap ferme la lecture agrandie (la
 * fenêtre native), rien d'autre.
 *
 * Repère : la largeur de la rubrique (mesurée avant le premier rendu et à
 * chaque redimensionnement) choisit Desktop (≥ 1024 px, comme le pont A13)
 * ou Mobile.
 */

export interface ContributionsSectionProps {
  theme: ContributionsTheme;
  /** Contributions publiées, dans l'ordre de la source. */
  items: readonly ContributionSceneItem[];
  contents: Readonly<Record<string, ContributionContent>>;
  title: string;
  subtitle: string;
  closing: string;
  language?: Language;
  /**
   * M8-E3 — la scène principale (sélection O8, au plus 4). Absente : les 4
   * premiers de `items`, comme en M6. `items` reste l'Album complet (P1).
   */
  sceneItems?: readonly ContributionSceneItem[];
  /** M8-E3 — phrase finale de l'état vide (Master M0) ; sans elle, `closing`. */
  closingEmpty?: string;
}

type View = "scene" | "album";

/** Seuil Desktop / Mobile : celui du pont responsive A13 (1024 px). */
export const CONTRIBUTIONS_DESKTOP_FROM = 1024;

/** Composition à l'ouverture : au moins ces planches (l'écran rempli), dans ce budget. */
const ALBUM_FIRST_PLATES = 3;
const ALBUM_FIRST_BUDGET_MS = 24;
/**
 * Puis une tranche par tâche, rendant la main au navigateur entre deux. Le
 * nombre de planches par tranche est borné aussi : en cache, une tranche de
 * 8 ms en produirait des dizaines, et leurs cartes se mesurent au rendu.
 */
const ALBUM_SLICE_BUDGET_MS = 8;
const ALBUM_SLICE_MAX_PLATES = 3;

export function ContributionsSection({ theme, items, contents, title, subtitle, closing, language = "fr", sceneItems, closingEmpty }: ContributionsSectionProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const sceneScrollY = useRef(0);
  const previousView = useRef<View>("scene");
  const [width, setWidth] = useState<number | null>(null);
  const [view, setView] = useState<View>("scene");
  const [album, setAlbum] = useState<ContributionsAlbumResult | null>(null);
  /** La liste dont l'Album affiché est issu (M8-E3 : recomposé si elle change). */
  const [albumSource, setAlbumSource] = useState<readonly ContributionSceneItem[]>(items);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const read = () => setWidth(el.getBoundingClientRect().width);
    read();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(read) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);
  const frame: ContributionsAlbumFrame | null = width === null ? null : width >= CONTRIBUTIONS_DESKTOP_FROM ? "desktop" : "mobile";

  const scene = useMemo(() => {
    if (!frame) return null;
    const visible = (sceneItems ?? items).slice(0, 4);
    if (visible.length === 0) return null;
    return frame === "desktop"
      ? solveContributionsScene(visible, { frame: "desktop", theme })
      : solveContributionsScene(visible, { frame: "mobile", theme, geometry: CONTRIBUTIONS_MOBILE_LAYOUTS["grille-2x2"].geometry[theme] });
  }, [frame, items, sceneItems, theme]);
  // « Voir tous » suit la règle PO sur le TOTAL (dès 4), pas sur la tranche visible.
  const viewAll = items.length >= 4;

  // Composition PROGRESSIVE : les premières planches à l'ouverture (l'écran est rempli
  // aussitôt), les suivantes par tranches de quelques ms, sans bloquer la page.
  const composerRef = useRef<ContributionsAlbumComposer | null>(null);
  const startComposer = useCallback(
    (f: ContributionsAlbumFrame) => {
      const composer = createContributionsAlbumComposer(items, { frame: f, theme });
      composer.run(ALBUM_FIRST_BUDGET_MS);
      while (!composer.done && composer.result().plates.length < ALBUM_FIRST_PLATES) composer.step();
      composerRef.current = composer;
      return composer.result();
    },
    [items, theme],
  );

  const openAlbum = useCallback(
    (trigger: HTMLElement) => {
      if (!frame) return;
      const first = startComposer(frame);
      if (first.status !== "PASS") {
        console.error("Contributions : Album non composé — la scène reste affichée.", first.status, first.detail);
        trigger.focus({ preventScroll: true });
        return;
      }
      triggerRef.current = trigger;
      setAlbumSource(items);
      sceneScrollY.current = window.scrollY;
      setAlbum(first);
      setView("album");
    },
    [frame, items, startComposer],
  );
  const closeAlbum = useCallback(() => setView("scene"), []);

  // Le repère change (rotation, redimensionnement) pendant la consultation : l'Album est recomposé pour lui.
  // M8-E3 : de même quand de nouvelles contributions arrivent (pagination progressive) ou qu'une photo
  // retirée disparaît : l'Album suit toujours la liste courante, dans l'ordre P1.
  useEffect(() => {
    if (view !== "album" || !frame || (album?.frame === frame && albumSource === items)) return;
    const first = startComposer(frame);
    // Effet de synchronisation avec la largeur mesurée et la liste reçue (sources externes) : une seule mise à jour.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAlbumSource(items);
    if (first.status === "PASS") setAlbum(first);
    else setView("scene");
  }, [view, frame, album, albumSource, items, startComposer]);

  // Suite de la composition, tranche par tranche, tant que l'Album est ouvert.
  useEffect(() => {
    if (view !== "album" || !album || album.complete) return;
    const composer = composerRef.current;
    if (!composer) return;
    const timer = setTimeout(() => {
      composer.run(ALBUM_SLICE_BUDGET_MS, undefined, ALBUM_SLICE_MAX_PLATES);
      const r = composer.result();
      // Un STOP tardif : retour à la scène, exactement comme « Retour » (jamais un Album tronqué).
      if (r.status !== "PASS") {
        console.error("Contributions : Album non composé — retour à la scène.", r.status, r.detail);
        setView("scene");
      } else setAlbum(r);
    }, 0);
    return () => clearTimeout(timer);
  }, [view, album]);

  // Focus et défilement : aux transitions seulement.
  useEffect(() => {
    const previous = previousView.current;
    previousView.current = view;
    const root = rootRef.current;
    if (!root || previous === view) return;
    if (view === "album") {
      const host = root.querySelector<HTMLElement>("[data-contributions-album-host]") ?? root;
      // L'Album en haut de l'écran. Dans la pile des cartes mémorielles, l'épinglage de la
      // rubrique est recalculé après le changement de hauteur : on réajuste une fois la mise
      // en page stabilisée — sauf si le visiteur a défilé entre-temps.
      const reveal = () => {
        const off = host.getBoundingClientRect().top;
        if (Math.abs(off) > 1) window.scrollTo({ left: 0, top: window.scrollY + off, behavior: "instant" });
        return window.scrollY;
      };
      let landed = reveal();
      backRef.current?.focus({ preventScroll: true });
      let raf = 0;
      let passes = 0;
      const again = () => {
        if (Math.abs(window.scrollY - landed) > 1 || ++passes > 4) return;
        landed = reveal();
        raf = requestAnimationFrame(again);
      };
      raf = requestAnimationFrame(again);
      return () => cancelAnimationFrame(raf);
    } else {
      window.scrollTo({ left: 0, top: sceneScrollY.current, behavior: "instant" });
      triggerRef.current?.focus({ preventScroll: true });
    }
  }, [view]);

  const back = translate(language, "common.back");
  return (
    <div ref={rootRef} data-contributions-section="" data-contributions-view={view} data-contributions-frame={frame ?? "pending"}>
      {frame && items.length === 0 ? (
        // M8-E3 — aucune contribution publiée : le Master M0 de l'état vide.
        <ContributionsSceneEmpty frame={frame} theme={theme} title={title} subtitle={subtitle} closing={closingEmpty ?? closing} />
      ) : frame && scene ? (
        <>
          <div className={view === "album" ? styles.parked : undefined} data-contributions-scene-host={view === "album" ? "parked" : "shown"}>
            {scene.status !== "PASS" ? null : frame === "desktop" ? (
              <ContributionsSceneDesktop theme={theme} placements={scene.placements} contents={contents} viewAll={viewAll} title={title} subtitle={subtitle} closing={closing} onViewAll={openAlbum} />
            ) : (
              <ContributionsSceneMobileP1
                theme={theme}
                layout={CONTRIBUTIONS_MOBILE_LAYOUTS["grille-2x2"]}
                placements={scene.placements}
                contents={contents}
                viewAll={viewAll}
                title={title}
                subtitle={subtitle}
                closing={closing}
                onViewAll={openAlbum}
              />
            )}
          </div>
          {view === "album" && album ? (
            <div data-contributions-album-host="" className={styles[`theme-${theme}`]}>
              <div className={styles.albumBar}>
                <button ref={backRef} type="button" className={styles.back} onClick={closeAlbum} data-album-back="">
                  <span aria-hidden="true">←</span>
                  <span>{back}</span>
                </button>
              </div>
              <ContributionsAlbum frame={album.frame} theme={theme} items={items} contents={contents} title={title} subtitle={subtitle} album={album} />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
