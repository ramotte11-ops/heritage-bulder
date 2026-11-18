"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { CONTRIBUTIONS_CHROME, CONTRIBUTIONS_FRAMES, CONTRIBUTIONS_TYPOGRAPHY, type ContributionsTheme } from "@/config/contributions-master-measurements";
import {
  bodyLineCapacity,
  CONTRIBUTIONS_CARD_INK,
  CONTRIBUTIONS_LINE_HEIGHT,
  CONTRIBUTIONS_PALETTE,
  CONTRIBUTIONS_RENDER_ASSETS as ASSETS,
} from "@/config/contributions-render-v1";
import type { Rect } from "@/lib/memorial/gallery/dynamic-polaroid-layout";
import type { ContributionScenePlacement } from "@/lib/memorial/contributions/contributions-scene";
import type { CardLayout } from "@/lib/memorial/contributions/contribution-shapes";
import styles from "./ContributionsSceneDesktop.module.css";

/**
 * M5-A — PREMIER RENDU Desktop de la scène des Contributions des proches.
 *
 * Pure présentation d'une scène déjà résolue par le moteur M4.2
 * (`solveContributionsScene`) : chaque carte est posée à SON centre, avec SON
 * inclinaison et SA profondeur ; rien n'est recalculé ici. La scène vit dans
 * le repère des Masters (1671 × 941 px source) et suit la largeur de son
 * conteneur (`--u` = 1 px source). Le corps du texte n'est jamais réduit : un
 * texte trop long est coupé à la dernière ligne entière et « Lire plus »
 * ouvre la lecture complète.
 */

export interface ContributionContent {
  author: string;
  text: string | null;
  caption: string | null;
  photo: { src: string; width: number; height: number } | null;
}

export interface ContributionsSceneDesktopProps {
  theme: ContributionsTheme;
  placements: readonly ContributionScenePlacement[];
  contents: Readonly<Record<string, ContributionContent>>;
  viewAll: boolean;
  title: string;
  subtitle: string;
  closing: string;
  labels?: { leaveMessage: string; viewAll: string; readMore: string; close: string; condolenceOverline: string };
}

const FR_LABELS = {
  leaveMessage: "Laisser un message",
  viewAll: "Voir tous les messages",
  readMore: "Lire plus",
  close: "Fermer",
  condolenceOverline: "Pour la famille",
};

const W = CONTRIBUTIONS_FRAMES.desktop.width;
const H = CONTRIBUTIONS_FRAMES.desktop.height;
const TYPE = CONTRIBUTIONS_TYPOGRAPHY.sizesSourcePx.desktop;

/** Longueur en px source → CSS (suit la largeur de la scène). */
const u = (v: number) => `calc(var(--u) * ${Math.round(v * 100) / 100})`;
const box = (r: Rect): CSSProperties => ({ left: u(r.x), top: u(r.y), width: u(r.width), height: u(r.height) });

export function ContributionsSceneDesktop({ theme, placements, contents, viewAll, title, subtitle, closing, labels = FR_LABELS }: ContributionsSceneDesktopProps) {
  const chrome = CONTRIBUTIONS_CHROME["with-contributions"].desktop[theme];
  const palette = CONTRIBUTIONS_PALETTE[theme];
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
  } as CSSProperties;

  const fromBox = (b: { x0: number; y0: number; x1: number; y1: number }): CSSProperties => box({ x: b.x0, y: b.y0, width: b.x1 - b.x0, height: b.y1 - b.y0 });
  const dividerCenterX = (chrome.leafDivider.x0 + chrome.leafDivider.x1) / 2;
  const dividerCenterY = (chrome.leafDivider.y0 + chrome.leafDivider.y1) / 2;

  return (
    <div className={styles.frame} data-contributions-scene="desktop" data-theme-variant={theme}>
      <section className={styles.stage} style={{ ...vars, aspectRatio: `${W} / ${H}`, backgroundImage: `url(${ASSETS.background[theme]})` }} aria-label={title}>
        {/* En-tête */}
        {/* eslint-disable-next-line @next/next/no-img-element -- ornement statique de la scène, dimensionné en unités de scène */}
        <img className={styles.ornament} src={ASSETS.emblem[theme]} alt="" style={fromBox(chrome.emblem)} />
        <h2 className={styles.title} style={{ ...fromBox(chrome.title), fontSize: u(TYPE.title) }}>
          {title}
        </h2>
        <p className={styles.subtitle} style={{ ...fromBox(chrome.subtitle), fontSize: u(TYPE.subtitle) }}>
          {subtitle}
        </p>
        <span className={styles.rule} style={{ left: u(dividerCenterX - 175), top: u(dividerCenterY), width: u(125) }} aria-hidden="true" />
        <span className={styles.rule} style={{ left: u(dividerCenterX + 50), top: u(dividerCenterY), width: u(125) }} aria-hidden="true" />
        {/* eslint-disable-next-line @next/next/no-img-element -- ornement statique */}
        <img className={styles.ornament} src={ASSETS.dividerSprig[theme]} alt="" style={fromBox(chrome.leafDivider)} />

        {/* Contributions : profondeur du moteur */}
        <ul className={styles.cards}>
          {sorted.map((p) => (
            <li key={p.itemId} className={styles.cardSlot} style={{ zIndex: p.zIndex }} data-contribution={p.kind} data-format={p.format} data-anchor={p.anchorId}>
              {p.layout.kind === "card" ? (
                <TextCard placement={p} card={p.layout.card} content={contents[p.itemId]} labels={labels} onRead={setReading} />
              ) : (
                <PolaroidCard placement={p} content={contents[p.itemId]} />
              )}
            </li>
          ))}
        </ul>

        {/* Actions et pied */}
        <button type="button" className={styles.primaryAction} style={{ ...fromBox(chrome.leaveMessageButton), fontSize: u(TYPE.button) }}>
          <QuillIcon />
          <span>{labels.leaveMessage}</span>
        </button>
        {viewAll && chrome.viewAllButton ? (
          <button type="button" className={styles.secondaryAction} style={{ ...fromBox(chrome.viewAllButton), fontSize: u(TYPE.viewAll) }}>
            <span>{labels.viewAll}</span>
            <span aria-hidden="true">→</span>
          </button>
        ) : null}
        <HeartRule y={chrome.heartDividerY} />
        <p className={styles.closing} style={{ ...fromBox(chrome.closingPhrase), fontSize: u(TYPE.closing) }}>
          {closing}
        </p>
      </section>
      <ReadingDialog reading={reading} onClose={() => setReading(null)} closeLabel={labels.close} />
    </div>
  );
}

/** Rectangle local du slot (origine = centre du slot) → boîte de la scène, pivot au centre du slot. */
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

function TextCard({
  placement,
  card,
  content,
  labels,
  onRead,
}: {
  placement: ContributionScenePlacement;
  card: CardLayout;
  content: ContributionContent | undefined;
  labels: typeof FR_LABELS;
  onRead: (r: { author: string; text: string }) => void;
}) {
  const condolence = card.format === "condolence";
  const tall = card.format === "story-tall";
  const paper = condolence ? ASSETS.paper.petrol : tall ? ASSETS.paper.ivory : ASSETS.paper.peach;
  const bodySize = condolence ? TYPE.condolenceBody : TYPE.storyBody;
  const ornament = card.ornaments[condolence ? 1 : 0];
  const ruleY = card.format === "story-tall" ? 0.76 : card.format === "story-wide" ? 0.72 : null;
  return (
    <div className={styles.cardShadow} style={placedBox(placement, card.paper)}>
      <article
        className={`${styles.card} ${condolence ? styles.condolence : styles.story}`}
        style={{ backgroundImage: `url(${paper})`, ...(condolence ? {} : { clipPath: deckledEdge(placement.itemId, card.paper.width, card.paper.height) }) }}
        aria-label={content ? `${condolence ? "Condoléances" : "Récit"} de ${content.author}` : undefined}
      >
        {condolence ? <CondolenceFrame /> : null}
        {condolence && card.ornaments[0] ? <HeartIcon rect={card.ornaments[0]} color={CONTRIBUTIONS_CARD_INK.condolenceSignature} /> : null}
        {ornament ? (
          // eslint-disable-next-line @next/next/no-img-element -- ornement statique de la carte
          <img className={styles.cardOrnament} src={condolence ? ASSETS.condolenceSprig : ASSETS.storySprig} alt="" style={box(fitOrnament(ornament, condolence ? 72 / 95 : 87 / 135))} />
        ) : null}
        {condolence && card.overline ? (
          <p className={styles.overline} style={{ ...box(card.overline), fontSize: u(TYPE.overline) }}>
            {labels.condolenceOverline}
          </p>
        ) : null}
        {content?.text ? (
          <ClampedBody rect={card.body} fontSize={bodySize} text={content.text} author={content.author} labels={labels} onRead={onRead} condolence={condolence} />
        ) : null}
        {ruleY !== null ? <span className={styles.signatureRule} style={{ left: u(card.paper.width * 0.43), width: u(card.paper.width * 0.16), top: u(card.paper.height * ruleY) }} aria-hidden="true" /> : null}
        {content ? (
          <p className={`${styles.signature} ${condolence ? styles.signatureGold : ""}`} style={{ ...box(card.signature), fontSize: u(TYPE.signature) }}>
            {content.author}
          </p>
        ) : null}
      </article>
    </div>
  );
}

/**
 * Bord déchiré d'un papier de récit : contour irrégulier, toujours VERS
 * L'INTÉRIEUR (jamais au-delà de la géométrie du moteur) et d'au plus
 * `DECKLE_PX` px source — bien moins que la marge hors texte de la carte.
 * Déterministe : tiré de l'identifiant de la contribution (même contenu, même
 * bord).
 */
const DECKLE_PX = 5;
export function deckledEdge(seed: string, w: number, h: number): string {
  let s = 2166136261;
  for (let i = 0; i < seed.length; i++) s = Math.imul(s ^ seed.charCodeAt(i), 16777619);
  const rnd = () => {
    s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909);
    return ((s ^= s >>> 16) >>> 0) / 4294967296;
  };
  const pts: string[] = [];
  const pct = (x: number, y: number) => pts.push(`${((x / w) * 100).toFixed(3)}% ${((y / h) * 100).toFixed(3)}%`);
  const edge = (len: number, at: (t: number, d: number) => [number, number]) => {
    const n = Math.max(8, Math.round(len / 7));
    for (let i = 0; i < n; i++) {
      const d = DECKLE_PX * (0.15 + 0.85 * rnd()) * (rnd() < 0.18 ? 1 : 0.55);
      const [x, y] = at(i / n, d);
      pct(x, y);
    }
  };
  edge(w, (t, d) => [t * w, d]);
  edge(h, (t, d) => [w - d, t * h]);
  edge(w, (t, d) => [w - t * w, h - d]);
  edge(h, (t, d) => [d, h - t * h]);
  return `polygon(${pts.join(", ")})`;
}

/** Ornement inscrit dans sa zone, ratio de l'image conservé, collé au bas de la zone. */
function fitOrnament(zone: Rect, ratio: number): Rect {
  const width = Math.min(zone.width, zone.height * ratio);
  const height = width / ratio;
  return { x: zone.x + (zone.width - width) / 2, y: zone.y + zone.height - height, width, height };
}

function ClampedBody({
  rect,
  fontSize,
  text,
  author,
  labels,
  onRead,
  condolence,
}: {
  rect: Rect;
  fontSize: number;
  text: string;
  author: string;
  labels: typeof FR_LABELS;
  onRead: (r: { author: string; text: string }) => void;
  condolence: boolean;
}) {
  const capacity = bodyLineCapacity(rect.height, fontSize);
  const measureRef = useRef<HTMLParagraphElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    // Copie invisible, non bornée : le texte entier tient-il dans la capacité ?
    const measure = () => {
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
      setOverflowing(lineHeight > 0 && Math.round(el.scrollHeight / lineHeight) > capacity);
    };
    measure();
    let alive = true;
    document.fonts?.ready.then(() => alive && measure());
    return () => {
      alive = false;
    };
  }, [capacity, text]);
  // Trop long : dernière ligne réservée à « Lire plus » ; le corps garde sa taille.
  const lines = overflowing ? Math.max(1, capacity - 1) : capacity;
  return (
    <div className={styles.body} style={{ ...box(rect), fontSize: u(fontSize), lineHeight: CONTRIBUTIONS_LINE_HEIGHT, color: condolence ? CONTRIBUTIONS_CARD_INK.condolence : CONTRIBUTIONS_CARD_INK.story }} data-overflowing={overflowing ? "" : undefined}>
      <p ref={measureRef} className={styles.bodyMeasure} aria-hidden="true">
        {text}
      </p>
      <p className={styles.bodyText} style={{ WebkitLineClamp: lines }}>
        {text}
      </p>
      {overflowing ? (
        <button type="button" className={styles.readMore} onClick={() => onRead({ author, text })}>
          {labels.readMore}
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
          <figcaption className={styles.caption} style={{ ...box(l.band), fontSize: u(TYPE.caption) }}>
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
  // Double filet doré et petits retours d'angle (relevés sur les Masters).
  const corner = (x: number, y: number, sx: number, sy: number) => `M${x + sx * 4.2} ${y}h${-sx * 4.2}v${sy * 6.5}`;
  return (
    <svg className={styles.frameSvg} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <rect x="2.4" y="3.9" width="95.2" height="92.2" fill="none" stroke={c} strokeWidth="1.3" vectorEffect="non-scaling-stroke" />
      <rect x="3.5" y="5.7" width="93" height="88.6" fill="none" stroke={c} strokeWidth="0.7" vectorEffect="non-scaling-stroke" opacity="0.85" />
      <path d={[corner(5, 8.5, 1, 1), corner(95, 8.5, -1, 1), corner(5, 91.5, 1, -1), corner(95, 91.5, -1, -1)].join(" ")} fill="none" stroke={c} strokeWidth="0.9" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function HeartIcon({ rect, color }: { rect: Rect; color: string }) {
  const side = Math.min(rect.width, rect.height) * 0.7;
  return (
    <svg className={styles.cardOrnament} viewBox="0 0 24 22" aria-hidden="true" style={box({ x: rect.x + (rect.width - side) / 2, y: rect.y + (rect.height - side) / 2, width: side, height: side })}>
      <path d="M12 20.3 3.6 12.2A5.2 5.2 0 0 1 11 4.9l1 1 1-1a5.2 5.2 0 0 1 7.4 7.3Z" fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function HeartRule({ y }: { y: number }) {
  const cx = W / 2;
  return (
    <>
      <span className={styles.rule} style={{ left: u(cx - 170), top: u(y), width: u(140) }} aria-hidden="true" />
      <span className={styles.rule} style={{ left: u(cx + 30), top: u(y), width: u(140) }} aria-hidden="true" />
      <svg className={styles.ornament} viewBox="0 0 24 22" aria-hidden="true" style={{ left: u(cx - 11), top: u(y - 10), width: u(22), height: u(20) }}>
        <path d="M12 20.3 3.6 12.2A5.2 5.2 0 0 1 11 4.9l1 1 1-1a5.2 5.2 0 0 1 7.4 7.3Z" fill="none" stroke="var(--title)" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </>
  );
}

function QuillIcon() {
  return (
    <svg className={styles.quill} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M40 6c-9 2-19 9-25 20-2 4-3 8-4 12m29-32c-1 9-7 19-17 25-3 2-7 3-12 3m29-28L11 38m2 3c6 1 14 1 22-1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ReadingDialog({ reading, onClose, closeLabel }: { reading: { author: string; text: string } | null; onClose: () => void; closeLabel: string }): ReactNode {
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
            {closeLabel}
          </button>
        </>
      ) : null}
    </dialog>
  );
}
