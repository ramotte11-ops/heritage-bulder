"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { ContributionsTheme } from "@/config/contributions-master-measurements";
import { CONTRIBUTIONS_CARD_INK, CONTRIBUTIONS_LINE_HEIGHT, CONTRIBUTIONS_PALETTE, CONTRIBUTIONS_RENDER_ASSETS as ASSETS } from "@/config/contributions-render-v1";
import { CONTRIBUTIONS_MOBILE_BACKGROUND, CONTRIBUTIONS_MOBILE_FRAME_WIDTH as W, CONTRIBUTIONS_MOBILE_TYPE_CSS as TYPE, type ContributionsMobileLayout } from "@/config/contributions-mobile-v1";
import type { Rect } from "@/lib/memorial/gallery/dynamic-polaroid-layout";
import type { ContributionScenePlacement } from "@/lib/memorial/contributions/contributions-scene";
import type { CardLayout } from "@/lib/memorial/contributions/contribution-shapes";
import { deckledEdge, type ContributionContent } from "./ContributionsSceneDesktop";
import base from "./ContributionsSceneMobile.module.css";
import styles from "./ContributionsSceneMobileP1.module.css";

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
}

/** Bornes des aperçus (px CSS) : jamais en dessous du minimum lisible. */
export const P1_PREVIEW_TYPE = {
  body: 14,
  overline: { max: 11, min: 9.5 },
  signature: { max: 22, min: 17 },
  caption: { max: 16, min: 14 },
} as const;

const LABELS = {
  leaveMessage: "Laisser un message",
  viewAll: "Voir tous les messages",
  close: "Fermer",
  condolenceOverline: "Pour la famille",
  open: { condolence: "Lire les condoléances de", story: "Lire le récit de", photo: "Voir la photographie de" },
};

const u = (v: number) => `calc(var(--u) * ${Math.round(v * 100) / 100})`;
const box = (r: Rect): CSSProperties => ({ left: u(r.x), top: u(r.y), width: u(r.width), height: u(r.height) });
const fromBox = (b: { x0: number; y0: number; x1: number; y1: number }): CSSProperties => box({ x: b.x0, y: b.y0, width: b.x1 - b.x0, height: b.y1 - b.y0 });
const px = (v: number) => `${v}px`;

type Opened = { placement: ContributionScenePlacement; content: ContributionContent; trigger: HTMLElement };

export function ContributionsSceneMobileP1({ theme, layout, placements, contents, viewAll, title, subtitle, closing }: ContributionsSceneMobileP1Props) {
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
          <button type="button" className={base.secondaryAction} style={{ ...fromBox(chrome.viewAllButton), fontSize: px(TYPE.viewAll) }} data-action="view-all">
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

/**
 * Texte d'une ligne ajusté à sa zone : du corps nominal au minimum lisible,
 * par demi-pixel ; s'il ne tient toujours pas, il est coupé (points de
 * suspension) — il ne sort jamais du papier. `data-truncated` le signale.
 */
function FitLine({ children, max, min, className, style, title }: { children: string; max: number; min: number; className?: string; style?: CSSProperties; title?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState(max);
  const [truncated, setTruncated] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Largeur NATURELLE du texte, au sous-pixel (getComputedStyle ignore la rotation de la
    // carte ; scrollWidth, arrondi à l'entier, laisse passer l'ellipse d'un interlettrage).
    const overflows = () => {
      const zone = el.parentElement;
      if (!zone) return false;
      el.style.maxWidth = "none";
      const natural = parseFloat(getComputedStyle(el).width);
      el.style.maxWidth = "";
      return natural > parseFloat(getComputedStyle(zone).width) - 0.5;
    };
    const fit = () => {
      let s = max;
      el.style.fontSize = px(s);
      while (overflows() && s > min) {
        s = Math.max(min, s - 0.5);
        el.style.fontSize = px(s);
      }
      setSize(s);
      setTruncated(overflows());
    };
    fit();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(fit) : null;
    // La zone (et non la ligne, que l'ajustement redimensionne) : pas de boucle d'observation.
    if (el.parentElement) ro?.observe(el.parentElement);
    let alive = true;
    document.fonts?.ready.then(() => alive && fit());
    return () => {
      alive = false;
      ro?.disconnect();
    };
  }, [children, max, min]);
  return (
    <span ref={ref} className={`${styles.fitLine} ${className ?? ""}`} style={{ ...style, fontSize: px(size) }} data-fit-line="" data-truncated={truncated ? "" : undefined} title={truncated ? title ?? children : undefined}>
      {children}
    </span>
  );
}

/** Corps d'aperçu : lignes entières seulement (mesurées), points de suspension. */
function PreviewBody({ rect, text, color }: { rect: Rect; text: string; color: string }) {
  const zoneRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  const [lines, setLines] = useState(0);
  useLayoutEffect(() => {
    const zone = zoneRef.current;
    const t = textRef.current;
    if (!zone || !t) return;
    const measure = () => {
      const lh = parseFloat(getComputedStyle(t).lineHeight);
      if (lh > 0) setLines(Math.max(0, Math.floor(zone.clientHeight / lh + 1e-6)));
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
  return (
    <div ref={zoneRef} className={base.body} style={{ ...box(rect), fontSize: px(P1_PREVIEW_TYPE.body), lineHeight: CONTRIBUTIONS_LINE_HEIGHT, color }} data-capacity={lines} data-fit-check="">
      <p ref={textRef} className={base.bodyText} style={{ WebkitLineClamp: Math.max(1, lines), visibility: lines > 0 ? "visible" : "hidden" }}>
        {text}
      </p>
    </div>
  );
}

function CardButton({ label, onOpen }: { label: string; onOpen: (trigger: HTMLElement) => void }) {
  return <button type="button" className={styles.cardButton} aria-label={label} aria-haspopup="dialog" onClick={(e) => onOpen(e.currentTarget)} data-open-card="" />;
}

function ExpandGlyph({ rect, dark }: { rect: Rect; dark: boolean }) {
  return (
    <svg className={styles.expandGlyph} viewBox="0 0 24 24" aria-hidden="true" style={box(rect)} data-dark={dark ? "" : undefined}>
      <circle cx="12" cy="12" r="10.2" fill="none" strokeWidth="1.3" />
      <path d="M8.4 15.6 15.6 8.4M11 8.4h4.6V13" fill="none" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PreviewCard({ placement, card, content, onOpen }: { placement: ContributionScenePlacement; card: CardLayout; content: ContributionContent | undefined; onOpen: (trigger: HTMLElement) => void }) {
  const condolence = card.format === "condolence";
  const paper = condolence ? ASSETS.paper.petrol : card.format === "story-tall" ? ASSETS.paper.ivory : ASSETS.paper.peach;
  const ornament = card.ornaments[condolence ? 1 : 0];
  const ruleY = card.format === "story-tall" ? 0.76 : card.format === "story-wide" ? 0.72 : null;
  const w = card.paper.width;
  const h = card.paper.height;
  const glyph = Math.min(w, h) * 0.1;
  // En-tête et signature occupent toute la largeur de la zone de texte déjà
  // PROTÉGÉE par le moteur (enveloppe corps + signature + en-tête) : plus de
  // place pour les noms, sans rien changer à la géométrie.
  const hull = card.protectedText;
  const wide = (r: Rect): Rect => ({ x: hull.x, y: r.y, width: hull.width, height: r.height });
  return (
    <div className={base.cardShadow} style={placedBox(placement, card.paper)}>
      <article className={`${base.card} ${condolence ? base.condolence : ""}`} style={{ backgroundImage: `url(${paper})`, ...(condolence ? {} : { clipPath: deckledEdge(placement.itemId, w, h) }) }} data-card-paper="">
        {condolence ? <CondolenceFrame /> : null}
        {condolence && card.ornaments[0] ? <HeartIcon rect={card.ornaments[0]} /> : null}
        {ornament ? (
          // eslint-disable-next-line @next/next/no-img-element -- ornement statique de la carte
          <img className={base.cardOrnament} src={condolence ? ASSETS.condolenceSprig : ASSETS.storySprig} alt="" style={box(fitOrnament(ornament, condolence ? 72 / 95 : 87 / 135))} />
        ) : null}
        {condolence && card.overline ? (
          <p className={styles.lineZone} style={box(wide(card.overline))}>
            <FitLine className={styles.overline} max={P1_PREVIEW_TYPE.overline.max} min={P1_PREVIEW_TYPE.overline.min}>
              {LABELS.condolenceOverline}
            </FitLine>
          </p>
        ) : null}
        {content?.text ? <PreviewBody rect={card.body} text={content.text} color={condolence ? CONTRIBUTIONS_CARD_INK.condolence : CONTRIBUTIONS_CARD_INK.story} /> : null}
        {ruleY !== null ? <span className={base.signatureRule} style={{ left: u(w * 0.43), width: u(w * 0.16), top: u(h * ruleY) }} aria-hidden="true" /> : null}
        {content ? (
          <p className={styles.lineZone} style={box(wide(card.signature))}>
            <FitLine className={`${styles.signature} ${condolence ? styles.signatureGold : ""}`} max={P1_PREVIEW_TYPE.signature.max} min={P1_PREVIEW_TYPE.signature.min}>
              {content.author}
            </FitLine>
          </p>
        ) : null}
        <ExpandGlyph rect={{ x: w - glyph * 1.55, y: condolence ? h * 0.1 : glyph * 0.6, width: glyph, height: glyph }} dark={!condolence} />
      </article>
      {content ? <CardButton label={`${LABELS.open[condolence ? "condolence" : "story"]} ${content.author}`} onOpen={onOpen} /> : null}
    </div>
  );
}

function PreviewPolaroid({ placement, content, onOpen }: { placement: ContributionScenePlacement; content: ContributionContent | undefined; onOpen: (trigger: HTMLElement) => void }) {
  if (placement.layout.kind !== "polaroid") return null;
  const l = placement.layout.polaroid;
  const photo = content?.photo;
  const glyph = Math.min(l.outer.width, l.outer.height) * 0.09;
  return (
    <div className={base.cardShadow} style={placedBox(placement, l.outer)}>
      <figure className={base.polaroid} style={{ backgroundImage: `url(${ASSETS.paper.polaroid})` }} data-card-paper="">
        <div className={base.polaroidWindow} style={box(l.window)}>
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element -- photo de démonstration, cadre calculé par le moteur A13
            <img className={base.polaroidPhoto} src={photo.src} alt="" style={box(l.photo)} />
          ) : null}
        </div>
        <span className={base.tape} aria-hidden="true" />
        {content ? (
          // Aperçu : UNE ligne (la légende, sinon l'auteur) ; légende et auteur
          // sont entiers dans la lecture agrandie.
          <figcaption className={styles.captionZone} style={box({ x: l.band.x + l.margin, y: l.band.y + l.band.height * 0.03, width: l.band.width - 2 * l.margin, height: l.band.height * 0.94 })}>
            <FitLine className={styles.caption} max={P1_PREVIEW_TYPE.caption.max} min={P1_PREVIEW_TYPE.caption.min}>
              {content.caption ?? content.author}
            </FitLine>
          </figcaption>
        ) : null}
        <ExpandGlyph rect={{ x: l.window.x + l.window.width - glyph * 1.35, y: l.window.y + glyph * 0.35, width: glyph, height: glyph }} dark={false} />
      </figure>
      {content ? <CardButton label={`${LABELS.open.photo} ${content.author}${content.caption ? ` : ${content.caption}` : ""}`} onOpen={onOpen} /> : null}
    </div>
  );
}

/**
 * Lecture agrandie : fenêtre modale native (`showModal` : fond inerte, Échap,
 * piège de focus), rendue hors de la pile des cartes mémorielles. Habillage
 * de la carte d'origine, texte à taille confortable, contenu complet.
 */
/** Variables héritées de la scène, recopiées sur la fenêtre de lecture (rendue hors de l'arbre). */
const INHERITED_VARS = ["--font-heritage-ceremony-serif", "--font-heritage-contributions-signature", "--font-heritage-hero-script", "--gold"] as const;

function ReadingSheet({ opened, onClose }: { opened: Opened; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const trigger = opened.trigger;
  // Montée seulement après un toucher (jamais au rendu serveur) ; fermée en se démontant.
  useEffect(() => {
    const d = ref.current;
    // Le portail sort la fenêtre de l'arbre qui définit les polices (next/font) :
    // elle reprend leurs variables depuis la carte touchée — même typographie que la scène.
    if (d) {
      const cs = getComputedStyle(trigger);
      for (const v of INHERITED_VARS) {
        const value = cs.getPropertyValue(v);
        if (value) d.style.setProperty(v, value);
      }
    }
    if (d && !d.open) d.showModal?.();
    closeRef.current?.focus({ preventScroll: true });
  }, [trigger]);
  const p = opened.placement;
  const c = opened.content;
  let sheet: ReactNode = null;
  if (p && c) {
    const kind = p.kind;
    const heading = kind === "condolence" ? `Condoléances de ${c.author}` : kind === "story" ? `Récit de ${c.author}` : `Photographie partagée par ${c.author}`;
    if (p.layout.kind === "polaroid" && c.photo) {
      sheet = (
        <figure className={`${styles.sheet} ${styles.sheetPolaroid}`} style={{ backgroundImage: `url(${ASSETS.paper.polaroid})` }}>
          <h3 id={titleId} className={styles.visuallyHidden}>
            {heading}
          </h3>
          <span className={styles.sheetTape} aria-hidden="true" />
          {/* eslint-disable-next-line @next/next/no-img-element -- photographie entière, jamais recadrée */}
          <img className={styles.sheetPhoto} src={c.photo.src} alt={c.caption ?? heading} width={c.photo.width} height={c.photo.height} />
          <figcaption className={styles.sheetCaption}>
            {c.caption ? <span>{c.caption}</span> : null}
            <span>{c.author}</span>
          </figcaption>
        </figure>
      );
    } else if (p.layout.kind === "card") {
      const condolence = p.layout.card.format === "condolence";
      const paper = condolence ? ASSETS.paper.petrol : p.layout.card.format === "story-tall" ? ASSETS.paper.ivory : ASSETS.paper.peach;
      sheet = (
        <article
          className={`${styles.sheet} ${condolence ? styles.sheetCondolence : styles.sheetStory}`}
          style={{ backgroundImage: `url(${paper})`, ...(condolence ? {} : { clipPath: deckledEdge(`${p.itemId}-lecture`, 440, 560) }) }}
          aria-labelledby={titleId}
        >
          {condolence ? <CondolenceFrame /> : null}
          <h3 id={titleId} className={condolence ? styles.sheetOverline : styles.visuallyHidden}>
            {condolence ? LABELS.condolenceOverline : heading}
          </h3>
          {condolence ? <span className={styles.visuallyHidden}>{heading}</span> : null}
          <div className={styles.sheetText}>
            <p>{c.text}</p>
          </div>
          <span className={styles.sheetRule} aria-hidden="true" />
          <p className={`${styles.sheetSignature} ${condolence ? styles.signatureGold : ""}`}>{c.author}</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- ornement statique */}
          <img className={styles.sheetSprig} src={condolence ? ASSETS.condolenceSprig : ASSETS.storySprig} alt="" />
        </article>
      );
    }
  }
  return createPortal(
    <dialog
      ref={ref}
      className={styles.reading}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // Toucher le fond (hors de la carte agrandie) ferme la lecture.
        if (e.target === e.currentTarget) onClose();
      }}
      data-contribution-reading={p.kind}
    >
      {sheet}
      <button ref={closeRef} type="button" className={styles.close} onClick={onClose} data-reading-close="">
        <span aria-hidden="true">×</span>
        <span>{LABELS.close}</span>
      </button>
    </dialog>,
    document.body,
  );
}

function CondolenceFrame() {
  const c = CONTRIBUTIONS_CARD_INK.condolenceFrame;
  const corner = (x: number, y: number, sx: number, sy: number) => `M${x + sx * 4.2} ${y}h${-sx * 4.2}v${sy * 6.5}`;
  return (
    <svg className={base.frameSvg} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <rect x="2.4" y="3.9" width="95.2" height="92.2" fill="none" stroke={c} strokeWidth="1.1" vectorEffect="non-scaling-stroke" />
      <rect x="3.5" y="5.7" width="93" height="88.6" fill="none" stroke={c} strokeWidth="0.6" vectorEffect="non-scaling-stroke" opacity="0.85" />
      <path d={[corner(5, 8.5, 1, 1), corner(95, 8.5, -1, 1), corner(5, 91.5, 1, -1), corner(95, 91.5, -1, -1)].join(" ")} fill="none" stroke={c} strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function HeartIcon({ rect }: { rect: Rect }) {
  const side = Math.min(rect.width, rect.height) * 0.7;
  return (
    <svg className={base.cardOrnament} viewBox="0 0 24 22" aria-hidden="true" style={box({ x: rect.x + (rect.width - side) / 2, y: rect.y + (rect.height - side) / 2, width: side, height: side })}>
      <path d="M12 20.3 3.6 12.2A5.2 5.2 0 0 1 11 4.9l1 1 1-1a5.2 5.2 0 0 1 7.4 7.3Z" fill="none" stroke={CONTRIBUTIONS_CARD_INK.condolenceSignature} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function QuillIcon() {
  return (
    <svg className={base.quill} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M40 6c-9 2-19 9-25 20-2 4-3 8-4 12m29-32c-1 9-7 19-17 25-3 2-7 3-12 3m29-28L11 38m2 3c6 1 14 1 22-1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
