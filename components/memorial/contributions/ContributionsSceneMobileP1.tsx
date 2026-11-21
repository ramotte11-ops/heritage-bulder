"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { ContributionsTheme } from "@/config/contributions-master-measurements";
import { CONTRIBUTIONS_PALETTE, CONTRIBUTIONS_RENDER_ASSETS as ASSETS } from "@/config/contributions-render-v1";
import { CONTRIBUTIONS_MOBILE_BACKGROUND, CONTRIBUTIONS_MOBILE_FRAME_WIDTH as W, CONTRIBUTIONS_MOBILE_TYPE_CSS as TYPE, type ContributionsMobileLayout } from "@/config/contributions-mobile-v1";
import type { Rect } from "@/lib/memorial/gallery/dynamic-polaroid-layout";
import type { ContributionScenePlacement } from "@/lib/memorial/contributions/contributions-scene";
import type { ContributionContent } from "./ContributionsSceneDesktop";
import { PreviewCard, PreviewPolaroid, ReadingSheet, type OpenedContribution } from "./ContributionCards";
import { useContributionsLabels } from "./contributions-labels-context";
import base from "./ContributionsSceneMobile.module.css";

/**
 * M5-C — Mobile P1 : scène 2 × 2 COMPACTE à contempler, cartes que l'on
 * touche pour les lire en grand (décision PO).
 *
 * - Aperçus : corps coupé à des lignes entières (points de suspension) ;
 *   signatures, en-tête et légendes ajustés à leur zone dans des bornes
 *   lisibles, puis coupés — aucun texte ne sort du papier. Le contenu complet
 *   n'est jamais perdu : il est dans la lecture agrandie.
 * - Chaque contribution est un vrai bouton (toute la carte), avec un repère
 *   discret « agrandir » ; au toucher, une fenêtre de lecture modale garde
 *   l'habillage de la carte (bleu pétrole, ivoire, pêche, Polaroid).
 * - La fenêtre est rendue HORS de la pile des cartes mémorielles (portail) :
 *   ni le stacking ni la position de défilement ne bougent. À la fermeture
 *   (bouton, Échap, toucher hors de la carte), le focus revient sur la carte,
 *   sans défilement.
 */

export interface ContributionsSceneMobileP1Props {
  theme: ContributionsTheme;
  layout: ContributionsMobileLayout;
  placements: readonly ContributionScenePlacement[];
  contents: Readonly<Record<string, ContributionContent>>;
  viewAll: boolean;
  title: string;
  subtitle: string;
  closing: string;
  /** M6 — « Voir tous les messages » ouvre l'Album complet (l'hôte) ; absent = bouton inerte, comme en M5-C. */
  onViewAll?: (trigger: HTMLElement) => void;
}

/** Bornes des aperçus : définies avec les cartes partagées (M6), inchangées. */
export { P1_PREVIEW_TYPE } from "./ContributionCards";

const u = (v: number) => `calc(var(--u) * ${Math.round(v * 100) / 100})`;
const box = (r: Rect): CSSProperties => ({ left: u(r.x), top: u(r.y), width: u(r.width), height: u(r.height) });
const fromBox = (b: { x0: number; y0: number; x1: number; y1: number }): CSSProperties => box({ x: b.x0, y: b.y0, width: b.x1 - b.x0, height: b.y1 - b.y0 });
const px = (v: number) => `${v}px`;

type Opened = OpenedContribution;

export function ContributionsSceneMobileP1({ theme, layout, placements, contents, viewAll, title, subtitle, closing, onViewAll }: ContributionsSceneMobileP1Props) {
  const LABELS = useContributionsLabels();
  const palette = CONTRIBUTIONS_PALETTE[theme];
  const bg = CONTRIBUTIONS_MOBILE_BACKGROUND[theme];
  const chrome = layout.chrome;
  const [opened, setOpened] = useState<Opened | null>(null);
  const sorted = [...placements].sort((a, b) => a.zIndex - b.zIndex);
  const vars = {
    "--title": palette.title,
    "--text": palette.text,
    "--rule": palette.rule,
    "--gold": palette.gold,
    "--button-fill": palette.buttonFill,
    "--button-border": palette.buttonBorder,
    "--button-text": palette.buttonText,
    "--outline-border": palette.outlineBorder,
    "--outline-text": palette.outlineText,
    "--card-shadow": palette.cardShadow,
    aspectRatio: `${W} / ${layout.height}`,
    backgroundImage: `url(${bg.top}), url(${bg.bottom}), url(${bg.middle})`,
    backgroundSize: "100% auto, 100% auto, 100% auto",
    backgroundPosition: "top center, bottom center, top center",
    backgroundRepeat: "no-repeat, no-repeat, repeat-y",
  } as CSSProperties;
  const dividerX = (chrome.leafDivider.x0 + chrome.leafDivider.x1) / 2;
  const dividerY = (chrome.leafDivider.y0 + chrome.leafDivider.y1) / 2;
  const triggerRef = useRef<HTMLElement | null>(null);
  const open = useCallback((o: Opened) => {
    triggerRef.current = o.trigger;
    setOpened(o);
  }, []);
  const close = useCallback(() => setOpened(null), []);
  // Après la fermeture effective (fenêtre démontée, la carte n'est plus inerte) :
  // focus sur la carte, sans aucun défilement.
  useEffect(() => {
    if (opened || !triggerRef.current) return;
    triggerRef.current.focus({ preventScroll: true });
    triggerRef.current = null;
  }, [opened]);

  return (
    <div className={base.frame} data-contributions-scene="mobile" data-layout={layout.id} data-interactive="" data-theme-variant={theme}>
      <section className={base.stage} style={vars} aria-label={title}>
        {/* eslint-disable-next-line @next/next/no-img-element -- ornement statique */}
        <img className={base.ornament} src={ASSETS.emblem[theme]} alt="" style={fromBox(chrome.emblem)} />
        <h2 className={base.title} style={{ ...fromBox(chrome.title), fontSize: px(TYPE.title) }} data-fit-check="">
          {title}
        </h2>
        <p className={base.subtitle} style={{ ...fromBox(chrome.subtitle), fontSize: px(TYPE.subtitle) }} data-fit-check="">
          {subtitle}
        </p>
        <span className={base.rule} style={{ left: u(dividerX - 230), top: u(dividerY), width: u(170) }} aria-hidden="true" />
        <span className={base.rule} style={{ left: u(dividerX + 60), top: u(dividerY), width: u(170) }} aria-hidden="true" />
        {/* eslint-disable-next-line @next/next/no-img-element -- ornement statique */}
        <img className={base.ornament} src={ASSETS.dividerSprig[theme]} alt="" style={fromBox(chrome.leafDivider)} />

        <ul className={base.cards}>
          {sorted.map((p) => {
            const content = contents[p.itemId];
            return (
              <li key={p.itemId} className={base.cardSlot} style={{ zIndex: p.zIndex }} data-contribution={p.kind} data-format={p.format} data-anchor={p.anchorId}>
                {p.layout.kind === "card" ? (
                  <PreviewCard placement={p} card={p.layout.card} content={content} onOpen={(trigger) => content && open({ placement: p, content, trigger })} />
                ) : (
                  <PreviewPolaroid placement={p} content={content} onOpen={(trigger) => content && open({ placement: p, content, trigger })} />
                )}
              </li>
            );
          })}
        </ul>

        <button type="button" className={base.primaryAction} style={{ ...fromBox(chrome.leaveMessageButton), fontSize: px(TYPE.button) }} data-action="leave-message">
          <QuillIcon />
          <span>{LABELS.leaveMessage}</span>
        </button>
        {viewAll ? (
          <button type="button" className={base.secondaryAction} style={{ ...fromBox(chrome.viewAllButton), fontSize: px(TYPE.viewAll) }} data-action="view-all" onClick={onViewAll ? (e) => onViewAll(e.currentTarget) : undefined}>
            <span>{LABELS.viewAll}</span>
            <span aria-hidden="true">→</span>
          </button>
        ) : null}
        <span className={base.rule} style={{ left: u(W / 2 - 230), top: u(chrome.heartDividerY), width: u(180) }} aria-hidden="true" />
        <span className={base.rule} style={{ left: u(W / 2 + 50), top: u(chrome.heartDividerY), width: u(180) }} aria-hidden="true" />
        <svg className={base.ornament} viewBox="0 0 24 22" aria-hidden="true" style={{ left: u(W / 2 - 20), top: u(chrome.heartDividerY - 18), width: u(40), height: u(36) }}>
          <path d="M12 20.3 3.6 12.2A5.2 5.2 0 0 1 11 4.9l1 1 1-1a5.2 5.2 0 0 1 7.4 7.3Z" fill="none" stroke="var(--title)" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
        <p className={base.closing} style={{ ...fromBox(chrome.closingPhrase), fontSize: px(TYPE.closing) }} data-fit-check="">
          {closing}
        </p>
      </section>
      {opened ? <ReadingSheet opened={opened} onClose={close} /> : null}
    </div>
  );
}

function QuillIcon() {
  return (
    <svg className={base.quill} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M40 6c-9 2-19 9-25 20-2 4-3 8-4 12m29-32c-1 9-7 19-17 25-3 2-7 3-12 3m29-28L11 38m2 3c6 1 14 1 22-1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
