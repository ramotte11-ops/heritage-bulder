"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { ContributionsTheme } from "@/config/contributions-master-measurements";
import { CONTRIBUTIONS_PALETTE, CONTRIBUTIONS_RENDER_ASSETS as ASSETS } from "@/config/contributions-render-v1";
import { CONTRIBUTIONS_ALBUM_BACKGROUND, type ContributionsAlbumFrame } from "@/config/contributions-album-v1";
import type { ContributionSceneItem } from "@/lib/memorial/contributions/contributions-scene";
import { solveContributionsAlbum, type ContributionsAlbumPlate, type ContributionsAlbumResult } from "@/lib/memorial/contributions/contributions-album";
import type { ContributionContent } from "./ContributionsSceneDesktop";
import { PreviewCard, PreviewPolaroid, ReadingSheet, type ContributionPreviewType, type OpenedContribution } from "./ContributionCards";
import base from "./ContributionsSceneMobile.module.css";
import styles from "./ContributionsAlbum.module.css";

/**
 * M6 — ALBUM COMPLET des Contributions des proches : toutes les
 * contributions, dans l'ordre de la source, composées planche par planche
 * par le moteur A13 étendu (`solveContributionsAlbum`).
 *
 * - Cartes : celles de la scène Mobile P1 (M5-C), partagées
 *   (`ContributionCards`) — bleu pétrole, ivoire, pêche, Polaroid, bords
 *   déchirés, ornements, signatures, ombres, inclinaisons du moteur.
 * - Toucher / cliquer une carte ouvre la lecture agrandie de M5-C ; à la
 *   fermeture, le focus revient sur la carte, sans défilement.
 * - Accessibilité : une liste ordonnée par planche (`start` continue la
 *   numérotation), dans l'ordre de la source ; chaque carte est un bouton
 *   nommé. La profondeur (z-index) ne change jamais l'ordre du DOM.
 * - Photographies : chargées à l'approche de l'écran (`loading="lazy"`),
 *   l'image entière n'est demandée qu'à l'ouverture.
 *
 * L'Album ne compose rien lui-même : un STOP du moteur est rendu tel quel
 * (`data-album-status`), sans carte inventée ; l'hôte n'ouvre pas l'Album
 * dans ce cas.
 */

export interface ContributionsAlbumProps {
  frame: ContributionsAlbumFrame;
  theme: ContributionsTheme;
  /** Toutes les contributions publiées, dans l'ordre de la source. */
  items: readonly ContributionSceneItem[];
  contents: Readonly<Record<string, ContributionContent>>;
  title: string;
  subtitle: string;
  /** Composition déjà calculée par l'hôte (sinon calculée ici). */
  album?: ContributionsAlbumResult;
}

/** Aperçus de l'Album (px CSS fixes) : un corps un peu plus généreux que la scène, mêmes minima. */
export const ALBUM_PREVIEW_TYPE: Record<ContributionsAlbumFrame, ContributionPreviewType> = {
  desktop: { body: 15, overline: { max: 12, min: 9.5 }, signature: { max: 26, min: 17 }, caption: { max: 18, min: 14 } },
  mobile: { body: 15, overline: { max: 11.5, min: 9.5 }, signature: { max: 24, min: 17 }, caption: { max: 17, min: 14 } },
};

export function ContributionsAlbum({ frame, theme, items, contents, title, subtitle, album: given }: ContributionsAlbumProps) {
  const album = useMemo(() => given ?? solveContributionsAlbum(items, { frame, theme }), [given, items, frame, theme]);
  const palette = CONTRIBUTIONS_PALETTE[theme];
  const bg = CONTRIBUTIONS_ALBUM_BACKGROUND[frame][theme];
  const [opened, setOpened] = useState<OpenedContribution | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const open = useCallback((o: OpenedContribution) => {
    triggerRef.current = o.trigger;
    setOpened(o);
  }, []);
  const close = useCallback(() => setOpened(null), []);
  useEffect(() => {
    if (opened || !triggerRef.current) return;
    triggerRef.current.focus({ preventScroll: true });
    triggerRef.current = null;
  }, [opened]);

  const type = ALBUM_PREVIEW_TYPE[frame];
  const rank = useMemo(() => new Map(items.map((it, i) => [it.id, i])), [items]);
  const vars = {
    "--u": `calc(100cqw / ${album.width})`,
    "--title": palette.title,
    "--text": palette.text,
    "--rule": palette.rule,
    "--gold": palette.gold,
    "--card-shadow": palette.cardShadow,
    backgroundImage: `url(${bg.top}), url(${bg.bottom}), url(${bg.middle})`,
    backgroundSize: "100% auto, 100% auto, 100% auto",
    backgroundPosition: "top center, bottom center, top center",
    backgroundRepeat: "no-repeat, no-repeat, repeat-y",
  } as CSSProperties;

  return (
    <div className={styles.frame} data-contributions-album={frame} data-album-status={album.status} data-album-count={album.total} data-theme-variant={theme}>
      <section className={`${styles.stage} ${styles[frame]}`} style={vars} aria-labelledby="contributions-album-title">
        <header className={styles.header}>
          {/* eslint-disable-next-line @next/next/no-img-element -- ornement statique */}
          <img className={styles.emblem} src={ASSETS.emblem[theme]} alt="" />
          <h2 id="contributions-album-title" className={styles.title}>
            {title}
          </h2>
          <p className={styles.subtitle}>{subtitle}</p>
          <div className={styles.divider} aria-hidden="true">
            <span />
            {/* eslint-disable-next-line @next/next/no-img-element -- ornement statique */}
            <img src={ASSETS.dividerSprig[theme]} alt="" />
            <span />
          </div>
        </header>
        {album.status === "PASS" ? (
          <div className={styles.plates} aria-busy={album.complete ? undefined : true} data-album-complete={album.complete ? "" : undefined}>
            {album.plates.map((plate) => (
              <AlbumPlate key={plate.index} plate={plate} width={album.width} contents={contents} rank={rank} type={type} onOpen={open} />
            ))}
          </div>
        ) : null}
        <div className={styles.footer} aria-hidden="true">
          <span />
          <svg viewBox="0 0 24 22">
            <path d="M12 20.3 3.6 12.2A5.2 5.2 0 0 1 11 4.9l1 1 1-1a5.2 5.2 0 0 1 7.4 7.3Z" fill="none" stroke="var(--title)" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
          <span />
        </div>
      </section>
      {opened ? <ReadingSheet opened={opened} onClose={close} /> : null}
    </div>
  );
}

/**
 * Une planche : liste ordonnée dans l'ordre de la source. Mémoïsée : la
 * composition progressive ajoute des planches sans re-rendre les précédentes
 * (mêmes objets, mêmes props).
 */
const AlbumPlate = memo(function AlbumPlate({
  plate,
  width,
  contents,
  rank,
  type,
  onOpen,
}: {
  plate: ContributionsAlbumPlate;
  width: number;
  contents: Readonly<Record<string, ContributionContent>>;
  rank: ReadonlyMap<string, number>;
  type: ContributionPreviewType;
  onOpen: (o: OpenedContribution) => void;
}) {
  return (
    <ol
      className={styles.plate}
      start={plate.start + 1}
      style={{ aspectRatio: `${width} / ${plate.height}` }}
      data-plate={plate.index}
      data-phase={plate.phase}
      data-reading-order-kept={plate.readingOrderKept ? "" : undefined}
    >
      {/* Ordre du DOM = ordre de la source ; la profondeur passe par z-index. */}
      {plate.placements
        .slice()
        .sort((a, b) => (rank.get(a.itemId) ?? 0) - (rank.get(b.itemId) ?? 0))
        .map((p) => {
          const content = contents[p.itemId];
          const open = (trigger: HTMLElement) => content && onOpen({ placement: p, content, trigger });
          return (
            <li key={p.itemId} className={base.cardSlot} style={{ zIndex: p.zIndex }} data-contribution={p.kind} data-format={p.format} data-item-id={p.itemId}>
              {p.layout.kind === "card" ? (
                <PreviewCard placement={p} card={p.layout.card} content={content} onOpen={open} type={type} />
              ) : (
                <PreviewPolaroid placement={p} content={content} onOpen={open} type={type} lazy />
              )}
            </li>
          );
        })}
    </ol>
  );
});
