"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { ContributionsTheme } from "@/config/contributions-master-measurements";
import { CONTRIBUTIONS_CARD_INK, CONTRIBUTIONS_LINE_HEIGHT, CONTRIBUTIONS_PALETTE, CONTRIBUTIONS_RENDER_ASSETS as ASSETS } from "@/config/contributions-render-v1";
import {
  CONTRIBUTIONS_MOBILE_BACKGROUND,
  CONTRIBUTIONS_MOBILE_FRAME_WIDTH as W,
  CONTRIBUTIONS_MOBILE_TYPE_CSS as TYPE,
  type ContributionsMobileLayout,
} from "@/config/contributions-mobile-v1";
import type { Rect } from "@/lib/memorial/gallery/dynamic-polaroid-layout";
import type { ContributionScenePlacement } from "@/lib/memorial/contributions/contributions-scene";
import type { CardLayout } from "@/lib/memorial/contributions/contribution-shapes";
import { deckledEdge, type ContributionContent } from "./ContributionsSceneDesktop";
import styles from "./ContributionsSceneMobile.module.css";

/**
 * M5-B — PROTOTYPE Mobile de la scène des Contributions des proches.
 *
 * Même identité graphique que le rendu Desktop M5-A (matières, ornements,
 * ombres, bords déchirés, Polaroids A13), sur une géométrie Mobile
 * EXPLORATOIRE (`config/contributions-mobile-v1.ts`). La géométrie suit la
 * largeur (repère 941 px source, `--u`) ; le TEXTE garde une taille fixe en
 * px CSS — jamais réduite. La capacité d'une zone de texte (en lignes
 * entières) est mesurée dans le navigateur ; au-delà, extrait et « Lire plus ».
 */

export interface ContributionsSceneMobileProps {
  theme: ContributionsTheme;
  layout: ContributionsMobileLayout;
  placements: readonly ContributionScenePlacement[];
  contents: Readonly<Record<string, ContributionContent>>;
  viewAll: boolean;
  title: string;
  subtitle: string;
  closing: string;
}

const LABELS = { leaveMessage: "Laisser un message", viewAll: "Voir tous les messages", readMore: "Lire plus", close: "Fermer", condolenceOverline: "Pour la famille" };

const u = (v: number) => `calc(var(--u) * ${Math.round(v * 100) / 100})`;
const box = (r: Rect): CSSProperties => ({ left: u(r.x), top: u(r.y), width: u(r.width), height: u(r.height) });
const fromBox = (b: { x0: number; y0: number; x1: number; y1: number }): CSSProperties => box({ x: b.x0, y: b.y0, width: b.x1 - b.x0, height: b.y1 - b.y0 });
const px = (v: number) => `${v}px`;

export function ContributionsSceneMobile({ theme, layout, placements, contents, viewAll, title, subtitle, closing }: ContributionsSceneMobileProps) {
  const palette = CONTRIBUTIONS_PALETTE[theme];
  const bg = CONTRIBUTIONS_MOBILE_BACKGROUND[theme];
  const chrome = layout.chrome;
  const [reading, setReading] = useState<{ author: string; text: string } | null>(null);
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
    backgroundSize: `100% auto, 100% auto, 100% auto`,
    backgroundPosition: `top center, bottom center, top center`,
    backgroundRepeat: "no-repeat, no-repeat, repeat-y",
  } as CSSProperties;
  const dividerX = (chrome.leafDivider.x0 + chrome.leafDivider.x1) / 2;
  const dividerY = (chrome.leafDivider.y0 + chrome.leafDivider.y1) / 2;

  return (
    <div className={styles.frame} data-contributions-scene="mobile" data-layout={layout.id} data-theme-variant={theme}>
      <section className={styles.stage} style={vars} aria-label={title}>
        {/* eslint-disable-next-line @next/next/no-img-element -- ornement statique */}
        <img className={styles.ornament} src={ASSETS.emblem[theme]} alt="" style={fromBox(chrome.emblem)} />
        <h2 className={styles.title} style={{ ...fromBox(chrome.title), fontSize: px(TYPE.title) }}>
          {title}
        </h2>
        <p className={styles.subtitle} style={{ ...fromBox(chrome.subtitle), fontSize: px(TYPE.subtitle) }}>
          {subtitle}
        </p>
        <span className={styles.rule} style={{ left: u(dividerX - 230), top: u(dividerY), width: u(170) }} aria-hidden="true" />
        <span className={styles.rule} style={{ left: u(dividerX + 60), top: u(dividerY), width: u(170) }} aria-hidden="true" />
        {/* eslint-disable-next-line @next/next/no-img-element -- ornement statique */}
        <img className={styles.ornament} src={ASSETS.dividerSprig[theme]} alt="" style={fromBox(chrome.leafDivider)} />

        <ul className={styles.cards}>
          {sorted.map((p) => (
            <li key={p.itemId} className={styles.cardSlot} style={{ zIndex: p.zIndex }} data-contribution={p.kind} data-format={p.format} data-anchor={p.anchorId}>
              {p.layout.kind === "card" ? (
                <TextCard placement={p} card={p.layout.card} content={contents[p.itemId]} onRead={setReading} />
              ) : (
                <PolaroidCard placement={p} content={contents[p.itemId]} />
              )}
            </li>
          ))}
        </ul>

        <button type="button" className={styles.primaryAction} style={{ ...fromBox(chrome.leaveMessageButton), fontSize: px(TYPE.button) }} data-action="leave-message">
          <QuillIcon />
          <span>{LABELS.leaveMessage}</span>
        </button>
        {viewAll ? (
          <button type="button" className={styles.secondaryAction} style={{ ...fromBox(chrome.viewAllButton), fontSize: px(TYPE.viewAll) }} data-action="view-all">
            <span>{LABELS.viewAll}</span>
            <span aria-hidden="true">→</span>
          </button>
        ) : null}
        <span className={styles.rule} style={{ left: u(W / 2 - 230), top: u(chrome.heartDividerY), width: u(180) }} aria-hidden="true" />
        <span className={styles.rule} style={{ left: u(W / 2 + 50), top: u(chrome.heartDividerY), width: u(180) }} aria-hidden="true" />
        <svg className={styles.ornament} viewBox="0 0 24 22" aria-hidden="true" style={{ left: u(W / 2 - 20), top: u(chrome.heartDividerY - 18), width: u(40), height: u(36) }}>
          <path d="M12 20.3 3.6 12.2A5.2 5.2 0 0 1 11 4.9l1 1 1-1a5.2 5.2 0 0 1 7.4 7.3Z" fill="none" stroke="var(--title)" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
        <p className={styles.closing} style={{ ...fromBox(chrome.closingPhrase), fontSize: px(TYPE.closing) }}>
          {closing}
        </p>
      </section>
      <ReadingDialog reading={reading} onClose={() => setReading(null)} />
    </div>
  );
}

function placedBox(p: ContributionScenePlacement, local: Rect): CSSProperties {
  return {
    left: u(p.center.x + local.x),
    top: u(p.center.y + local.y),
    width: u(local.width),
    height: u(local.height),
    transformOrigin: `${u(-local.x)} ${u(-local.y)}`,
    transform: `rotate(${p.rotationDeg}deg)`,
  };
}

function fitOrnament(zone: Rect, ratio: number): Rect {
  const width = Math.min(zone.width, zone.height * ratio);
  const height = width / ratio;
  return { x: zone.x + (zone.width - width) / 2, y: zone.y + zone.height - height, width, height };
}

function TextCard({ placement, card, content, onRead }: { placement: ContributionScenePlacement; card: CardLayout; content: ContributionContent | undefined; onRead: (r: { author: string; text: string }) => void }) {
  const condolence = card.format === "condolence";
  const paper = condolence ? ASSETS.paper.petrol : card.format === "story-tall" ? ASSETS.paper.ivory : ASSETS.paper.peach;
  const ornament = card.ornaments[condolence ? 1 : 0];
  const ruleY = card.format === "story-tall" ? 0.76 : card.format === "story-wide" ? 0.72 : null;
  return (
    <div className={styles.cardShadow} style={placedBox(placement, card.paper)}>
      <article
        className={`${styles.card} ${condolence ? styles.condolence : ""}`}
        style={{ backgroundImage: `url(${paper})`, ...(condolence ? {} : { clipPath: deckledEdge(placement.itemId, card.paper.width, card.paper.height) }) }}
        aria-label={content ? `${condolence ? "Condoléances" : "Récit"} de ${content.author}` : undefined}
      >
        {condolence ? <CondolenceFrame /> : null}
        {condolence && card.ornaments[0] ? <HeartIcon rect={card.ornaments[0]} /> : null}
        {ornament ? (
          // eslint-disable-next-line @next/next/no-img-element -- ornement statique de la carte
          <img className={styles.cardOrnament} src={condolence ? ASSETS.condolenceSprig : ASSETS.storySprig} alt="" style={box(fitOrnament(ornament, condolence ? 72 / 95 : 87 / 135))} />
        ) : null}
        {condolence && card.overline ? (
          <p className={styles.overline} style={{ ...box(card.overline), fontSize: px(TYPE.overline) }}>
            {LABELS.condolenceOverline}
          </p>
        ) : null}
        {content?.text ? <ClampedBody rect={card.body} text={content.text} author={content.author} onRead={onRead} condolence={condolence} /> : null}
        {ruleY !== null ? <span className={styles.signatureRule} style={{ left: u(card.paper.width * 0.43), width: u(card.paper.width * 0.16), top: u(card.paper.height * ruleY) }} aria-hidden="true" /> : null}
        {content ? (
          <p className={`${styles.signature} ${condolence ? styles.signatureGold : ""}`} style={{ ...box(card.signature), fontSize: px(TYPE.signature) }}>
            {content.author}
          </p>
        ) : null}
      </article>
    </div>
  );
}

/**
 * Corps de texte à taille fixe (px CSS). La capacité est mesurée : nombre de
 * lignes entières que la zone contient au corps nominal ; si le texte entier
 * dépasse, il est coupé une ligne plus tôt et « Lire plus » prend la dernière.
 */
function ClampedBody({ rect, text, author, onRead, condolence }: { rect: Rect; text: string; author: string; onRead: (r: { author: string; text: string }) => void; condolence: boolean }) {
  const zoneRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLParagraphElement>(null);
  const [state, setState] = useState<{ capacity: number; overflowing: boolean }>({ capacity: 99, overflowing: false });
  useLayoutEffect(() => {
    const zone = zoneRef.current;
    const m = measureRef.current;
    if (!zone || !m) return;
    const measure = () => {
      const lh = parseFloat(getComputedStyle(m).lineHeight);
      if (!(lh > 0)) return;
      const capacity = Math.max(0, Math.floor(zone.clientHeight / lh + 1e-6));
      const lines = Math.round(m.scrollHeight / lh);
      setState((s) => (s.capacity === capacity && s.overflowing === lines > capacity ? s : { capacity, overflowing: lines > capacity }));
    };
    measure();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    ro?.observe(zone);
    let alive = true;
    document.fonts?.ready.then(() => alive && measure());
    return () => {
      alive = false;
      ro?.disconnect();
    };
  }, [text]);
  const lines = state.overflowing ? Math.max(1, state.capacity - 1) : state.capacity;
  return (
    <div
      ref={zoneRef}
      className={styles.body}
      style={{ ...box(rect), fontSize: px(condolence ? TYPE.condolenceBody : TYPE.storyBody), lineHeight: CONTRIBUTIONS_LINE_HEIGHT, color: condolence ? CONTRIBUTIONS_CARD_INK.condolence : CONTRIBUTIONS_CARD_INK.story }}
      data-overflowing={state.overflowing ? "" : undefined}
      data-capacity={state.capacity}
    >
      <p ref={measureRef} className={styles.bodyMeasure} aria-hidden="true">
        {text}
      </p>
      <p className={styles.bodyText} style={{ WebkitLineClamp: lines }}>
        {text}
      </p>
      {state.overflowing ? (
        <button type="button" className={styles.readMore} onClick={() => onRead({ author, text })}>
          {LABELS.readMore}
        </button>
      ) : null}
    </div>
  );
}

function PolaroidCard({ placement, content }: { placement: ContributionScenePlacement; content: ContributionContent | undefined }) {
  if (placement.layout.kind !== "polaroid") return null;
  const l = placement.layout.polaroid;
  const photo = content?.photo;
  return (
    <div className={styles.cardShadow} style={placedBox(placement, l.outer)}>
      <figure className={styles.polaroid} style={{ backgroundImage: `url(${ASSETS.paper.polaroid})` }}>
        <div className={styles.polaroidWindow} style={box(l.window)}>
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element -- photo de démonstration, cadre calculé par le moteur A13
            <img className={styles.polaroidPhoto} src={photo.src} alt={content?.caption ?? ""} style={box(l.photo)} />
          ) : null}
        </div>
        <span className={styles.tape} aria-hidden="true" />
        {content ? (
          <figcaption className={styles.caption} style={{ ...box(l.band), fontSize: px(TYPE.caption) }}>
            {content.caption ? <span>{content.caption}</span> : null}
            <span>{content.author}</span>
          </figcaption>
        ) : null}
      </figure>
    </div>
  );
}

function CondolenceFrame() {
  const c = CONTRIBUTIONS_CARD_INK.condolenceFrame;
  const corner = (x: number, y: number, sx: number, sy: number) => `M${x + sx * 4.2} ${y}h${-sx * 4.2}v${sy * 6.5}`;
  return (
    <svg className={styles.frameSvg} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <rect x="2.4" y="3.9" width="95.2" height="92.2" fill="none" stroke={c} strokeWidth="1.1" vectorEffect="non-scaling-stroke" />
      <rect x="3.5" y="5.7" width="93" height="88.6" fill="none" stroke={c} strokeWidth="0.6" vectorEffect="non-scaling-stroke" opacity="0.85" />
      <path d={[corner(5, 8.5, 1, 1), corner(95, 8.5, -1, 1), corner(5, 91.5, 1, -1), corner(95, 91.5, -1, -1)].join(" ")} fill="none" stroke={c} strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function HeartIcon({ rect }: { rect: Rect }) {
  const side = Math.min(rect.width, rect.height) * 0.7;
  return (
    <svg className={styles.cardOrnament} viewBox="0 0 24 22" aria-hidden="true" style={box({ x: rect.x + (rect.width - side) / 2, y: rect.y + (rect.height - side) / 2, width: side, height: side })}>
      <path d="M12 20.3 3.6 12.2A5.2 5.2 0 0 1 11 4.9l1 1 1-1a5.2 5.2 0 0 1 7.4 7.3Z" fill="none" stroke={CONTRIBUTIONS_CARD_INK.condolenceSignature} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function QuillIcon() {
  return (
    <svg className={styles.quill} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M40 6c-9 2-19 9-25 20-2 4-3 8-4 12m29-32c-1 9-7 19-17 25-3 2-7 3-12 3m29-28L11 38m2 3c6 1 14 1 22-1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ReadingDialog({ reading, onClose }: { reading: { author: string; text: string } | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (reading && !d.open) d.showModal?.();
    if (!reading && d.open) d.close();
  }, [reading]);
  return (
    <dialog ref={ref} className={styles.reading} onClose={onClose} aria-label={reading ? `Message de ${reading.author}` : undefined}>
      {reading ? (
        <>
          <p className={styles.readingText}>{reading.text}</p>
          <p className={styles.readingAuthor}>{reading.author}</p>
          <button type="button" className={styles.readingClose} onClick={onClose}>
            {LABELS.close}
          </button>
        </>
      ) : null}
    </dialog>
  );
}
