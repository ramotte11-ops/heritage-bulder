"use client";

import type { CSSProperties } from "react";
import {
  CONTRIBUTIONS_CHROME,
  CONTRIBUTIONS_FRAMES,
  CONTRIBUTIONS_TYPOGRAPHY,
  type ContributionsFormat,
  type ContributionsTheme,
} from "@/config/contributions-master-measurements";
import { CONTRIBUTIONS_EMPTY_CARD_ORNAMENTS, CONTRIBUTIONS_PALETTE, CONTRIBUTIONS_RENDER_ASSETS as ASSETS, type ContributionsEmptyCardOrnament } from "@/config/contributions-render-v1";
import desktop from "./ContributionsSceneDesktop.module.css";
import mobile from "./ContributionsSceneMobile.module.css";
import styles from "./ContributionsSceneEmpty.module.css";
import { useContributionsLabels } from "./contributions-labels-context";

/**
 * M8-E3 — l'état public SANS contribution (Masters M0 « état vide »).
 *
 * Aucune carte fictive : le fond nettoyé remis par la PO porte la carte
 * centrale et ses rameaux ; le runtime y pose, aux boîtes RELEVÉES du
 * Master (CONTRIBUTIONS_CHROME.empty), l'emblème, le titre, le sous-titre,
 * le filet au rameau, l'accueil, le filet au cœur, l'invitation, le bouton
 * « Laisser un message », le second filet au cœur et la phrase finale.
 * Mêmes feuilles de style que les scènes validées (polices, couleurs,
 * boutons) : rien n'est redessiné. Tailles de caractères : relevé M0
 * (`sizesSourcePx.welcome` / `invitation`).
 *
 * Le bouton « Laisser un message » reste sans action jusqu'à la fenêtre de
 * dépôt E4 (soumise à la PO), exactement comme dans la scène M5.
 */
export interface ContributionsSceneEmptyProps {
  frame: ContributionsFormat;
  theme: ContributionsTheme;
  title: string;
  subtitle: string;
  closing: string;
}

const u = (v: number) => `calc(var(--u) * ${Math.round(v * 100) / 100})`;
/**
 * Mobile : le Master (941 px source) ramené à 320–430 px rendrait les textes
 * illisibles (sous-titre ≈ 9 px). Chaque corps garde sa taille du Master
 * quand elle est lisible, et ne descend jamais sous un plancher CSS proche
 * de la scène Mobile P1 validée (CONTRIBUTIONS_MOBILE_TYPE_CSS).
 */
const MOBILE_FLOOR_PX = { title: 24, subtitle: 11.5, welcome: 14, invitation: 13, button: 14, closing: 11.5 } as const;
/** Le plancher vaut à 390 px de large et suit la largeur en dessous (320 px : même rendu, réduit). */
const MOBILE_FLOOR_AT_CSS_WIDTH = 390;
const fontFor = (frame: ContributionsFormat, key: keyof typeof MOBILE_FLOOR_PX, source: number) => {
  if (frame !== "mobile") return u(source);
  const floor = MOBILE_FLOOR_PX[key];
  const fluid = Math.round((floor / MOBILE_FLOOR_AT_CSS_WIDTH) * 100 * 1000) / 1000;
  return `max(min(${floor}px, ${fluid}cqw), ${u(source)})`;
};
const fromBox = (b: { x0: number; y0: number; x1: number; y1: number }): CSSProperties => ({
  left: u(b.x0),
  top: u(b.y0),
  width: u(b.x1 - b.x0),
  height: u(b.y1 - b.y0),
});

export function ContributionsSceneEmpty({ frame, theme, title, subtitle, closing }: ContributionsSceneEmptyProps) {
  const labels = useContributionsLabels();
  const chrome = CONTRIBUTIONS_CHROME.empty[frame][theme];
  const palette = CONTRIBUTIONS_PALETTE[theme];
  const type = CONTRIBUTIONS_TYPOGRAPHY.sizesSourcePx[frame];
  const base = frame === "desktop" ? desktop : mobile;
  const W = CONTRIBUTIONS_FRAMES[frame].width;
  const H = CONTRIBUTIONS_FRAMES[frame].height;
  const vars = {
    "--u": `calc(100cqw / ${W})`,
    "--title": palette.title,
    "--text": palette.text,
    "--rule": palette.rule,
    "--gold": palette.gold,
    "--button-fill": palette.buttonFill,
    "--button-border": palette.buttonBorder,
    "--button-text": palette.buttonText,
    // La carte centrale est un papier clair dans les deux ambiances (fonds
    // M0 Light et Dark) : son texte prend toujours l'encre du Master Light.
    "--card-title": CONTRIBUTIONS_PALETTE.light.title,
    "--card-text": CONTRIBUTIONS_PALETTE.light.text,
    "--card-rule": CONTRIBUTIONS_PALETTE.light.rule,
    aspectRatio: `${W} / ${H}`,
    backgroundImage: `url(${ASSETS.emptyBackground[frame][theme]})`,
    backgroundSize: "100% 100%",
    backgroundRepeat: "no-repeat",
  } as CSSProperties;
  const leafX = (chrome.leafDivider.x0 + chrome.leafDivider.x1) / 2;
  const leafY = (chrome.leafDivider.y0 + chrome.leafDivider.y1) / 2;
  const ruleSpan = frame === "desktop" ? { half: 170, len: 140 } : { half: 230, len: 180 };

  return (
    <div className={base.frame} data-contributions-scene={frame} data-contributions-state="empty" data-theme-variant={theme}>
      <section className={`${base.stage} ${styles.stage}`} style={vars} aria-label={title}>
        {/* eslint-disable-next-line @next/next/no-img-element -- ornement statique de la scène */}
        <img className={base.ornament} src={ASSETS.emblem[theme]} alt="" style={fromBox(chrome.emblem)} />
        <h2 className={`${base.title} ${frame === "mobile" ? styles.wrap : ""}`} style={{ ...fromBox(chrome.title), fontSize: fontFor(frame, "title", type.title) }}>
          {title}
        </h2>
        <p className={base.subtitle} style={{ ...fromBox(chrome.subtitle), fontSize: fontFor(frame, "subtitle", type.subtitle) }}>
          {subtitle}
        </p>
        <span className={base.rule} style={{ left: u(leafX - ruleSpan.half), top: u(leafY), width: u(ruleSpan.len - 15) }} aria-hidden="true" />
        <span className={base.rule} style={{ left: u(leafX + ruleSpan.half - ruleSpan.len + 15), top: u(leafY), width: u(ruleSpan.len - 15) }} aria-hidden="true" />
        {/* eslint-disable-next-line @next/next/no-img-element -- ornement statique */}
        <img className={base.ornament} src={ASSETS.dividerSprig[theme]} alt="" style={fromBox(chrome.leafDivider)} />

        {chrome.welcome ? (
          <p className={styles.welcome} style={{ ...fromBox(chrome.welcome), fontSize: fontFor(frame, "welcome", type.welcome) }}>
            {labels.emptyWelcome}
          </p>
        ) : null}
        {CONTRIBUTIONS_EMPTY_CARD_ORNAMENTS[frame][theme].map((o, i) => (
          <CardOrnament key={i} base={base} ornament={o} />
        ))}
        {chrome.invitation ? (
          <p className={styles.invitation} style={{ ...fromBox(chrome.invitation), fontSize: fontFor(frame, "invitation", type.invitation) }}>
            {labels.emptyInvitation}
          </p>
        ) : null}

        <button type="button" className={base.primaryAction} style={{ ...fromBox(chrome.leaveMessageButton), fontSize: fontFor(frame, "button", type.button) }} data-action="leave-message">
          <svg className={base.quill} viewBox="0 0 48 48" aria-hidden="true">
            <path d="M40 6c-9 2-19 9-25 20-2 4-3 8-4 12m29-32c-1 9-7 19-17 25-3 2-7 3-12 3m29-28L11 38m2 3c6 1 14 1 22-1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>{labels.leaveMessage}</span>
        </button>
        <Heart base={base} x={W / 2} y={chrome.heartDividerY} span={frame === "desktop" ? 170 : 230} />
        <p className={base.closing} style={{ ...fromBox(chrome.closingPhrase), fontSize: fontFor(frame, "closing", type.closing) }}>
          {closing}
        </p>
      </section>
    </div>
  );
}

function Heart({ base, x, y, span }: { base: Record<string, string>; x: number; y: number; span: number }) {
  const len = span - 30;
  return (
    <>
      <span className={base.rule} style={{ left: u(x - span), top: u(y), width: u(len) }} aria-hidden="true" />
      <span className={base.rule} style={{ left: u(x + 30), top: u(y), width: u(len) }} aria-hidden="true" />
      <svg className={base.ornament} viewBox="0 0 24 22" aria-hidden="true" style={{ left: u(x - 11), top: u(y - 10), width: u(22), height: u(20) }}>
        <path d="M12 20.3 3.6 12.2A5.2 5.2 0 0 1 11 4.9l1 1 1-1a5.2 5.2 0 0 1 7.4 7.3Z" fill="none" stroke="var(--gold)" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </>
  );
}

/** Ornement de la carte centrale, à la position relevée sur SON Master. */
function CardOrnament({ base, ornament }: { base: Record<string, string>; ornament: ContributionsEmptyCardOrnament }) {
  const rule = { background: "var(--card-rule)" };
  if (ornament.kind === "rule") {
    return <span className={base.rule} style={{ left: u(ornament.x0), top: u(ornament.y), width: u(ornament.x1 - ornament.x0), ...rule }} aria-hidden="true" />;
  }
  const [l0, l1] = ornament.left;
  const [r0, r1] = ornament.right;
  const gap = r0 - l1;
  const cx = (l1 + r0) / 2;
  const w = gap * 0.4;
  const h = w * (20 / 22);
  return (
    <>
      <span className={base.rule} style={{ left: u(l0), top: u(ornament.y), width: u(l1 - l0), ...rule }} aria-hidden="true" />
      <span className={base.rule} style={{ left: u(r0), top: u(ornament.y), width: u(r1 - r0), ...rule }} aria-hidden="true" />
      <svg className={base.ornament} viewBox="0 0 24 22" aria-hidden="true" style={{ left: u(cx - w / 2), top: u(ornament.y - h / 2), width: u(w), height: u(h) }}>
        <path d="M12 20.3 3.6 12.2A5.2 5.2 0 0 1 11 4.9l1 1 1-1a5.2 5.2 0 0 1 7.4 7.3Z" fill="none" stroke="var(--gold)" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </>
  );
}
