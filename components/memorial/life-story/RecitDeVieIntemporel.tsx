"use client";

import type { CSSProperties } from "react";
import type { Language } from "@/config/languages";
import type { SkinVariant } from "@/config/skins";
import type { MemorialContent } from "@/types/memorial";
import { resolveLifeStoryContent } from "@/lib/memorial/life-story-content";
import { translate } from "@/lib/i18n/translate";
import { SkinScope } from "@/components/memorial/SkinScope";
import { ebGaramond, ebGaramondItalic } from "@/components/builder/fonts";
import {
  RECIT_RUNTIME_SCENE_SRC,
  RECIT_RUNTIME_INK,
  RECIT_MOBILE_CANVAS,
  RECIT_MOBILE_OVERLAYS,
  RECIT_DESKTOP_CANVAS,
  RECIT_DESKTOP_OVERLAYS,
  type RecitOverlayBox,
  type RecitDesktopOverlayBox,
} from "@/config/recit-de-vie-runtime-tokens";
import styles from "./RecitDeVieIntemporel.module.css";

/**
 * Récit de vie ("Life Story") Intemporel — the real Memorial renderer for
 * A10/A11/A12, Handoff GREEN QG `HERITAGE_RDV_HANDOFF_RUNTIME_V1_0_QG_AUDIT`
 * (transmitted via `HERITAGE_RDV_OPUS_RUNTIME_PACKAGE_LIGHT_V1`). This
 * supersedes the withdrawn V1.3.1 renderer in full — see
 * `config/recit-de-vie-runtime-tokens.ts`'s own docstring for the
 * architecture this component implements and why it differs from the
 * withdrawn package (fixed-height single scene vs. dynamic growth, baked
 * icons/rail vs. runtime ones, always-3-matters-with-fallback vs.
 * conditional presence).
 *
 * ## One shared overlay DOM tree, CSS-switched at 1024px
 *
 * Mirrors `CeremonyIntemporel.tsx`'s own established technique exactly:
 * the ART layer renders BOTH the Mobile image stack and the Desktop
 * image (only one ever visible, via `.mobileOnly`/`.desktopOnly`), and
 * every text overlay (title, 3×(label+body), microcopy) is a SINGLE
 * element carrying both a Mobile and a Desktop position as CSS custom
 * properties, switched by the same 1024px media query — never
 * duplicated markup, so a query like `getByText` only ever matches once.
 * `.wrap` is `position:relative`; its rendered height comes entirely
 * from whichever image stack is currently in normal flow (the other has
 * `display:none` and contributes nothing) — the same mechanism that
 * makes `HeroIntemporel.tsx`'s dual masters and Ceremony's own overlay
 * boxes work without any JS measurement.
 *
 * ## Always three matters — never a fourth, hidden, or partial state
 *
 * `resolveLifeStoryContent` (lib/memorial/life-story-content.ts) always
 * returns exactly three resolved matters, each either the family's own
 * normalized words or the matter's own localized HERITAGE fallback —
 * this component has no branch that removes a matter, its label, or its
 * body box. Fixed-height boxes (`max_lines`-worth of space already
 * reserved by the ART itself) mean neither a short fallback nor a
 * 240-character stress case ever changes the layout.
 *
 * ## Icons, medallions and the connecting line are baked ART — never
 * redrawn
 *
 * `execution-contract.json` lists no icon overlay, and the ART-ONLY
 * assets already carry the medallion/glyph/line pixels (verified by
 * inspection) — this component never renders a separate icon `<img>`
 * or a CSS-drawn rail, unlike the withdrawn V1.3.1 renderer.
 *
 * ## Typography — EB Garamond, same lock as before
 *
 * Title and labels: `EB_Garamond` Regular 400 + `font-variant-caps:
 * small-caps`. Body (family text or fallback): the same family, no caps
 * variant. Microcopy: `ebGaramondItalic` (EB Garamond Italic 400) — see
 * `components/builder/fonts.ts`.
 *
 * ## Ink — measured glyph-core colors, Light/Dark parity
 *
 * `RECIT_RUNTIME_INK` is the Handoff's own single Light/Dark pair,
 * applied to every text role identically (the Handoff specifies no
 * per-role color, unlike the withdrawn V1.3.1 contract) — "seule
 * l'image ART-ONLY et la couleur typographique changent selon le
 * thème... aucun layout conditionnel au thème."
 */
export interface RecitDeVieIntemporelProps {
  content: MemorialContent;
  language: Language;
  skinVariant: SkinVariant;
}

function pxBoxToPct(box: { x: number; y: number; w: number; h: number }, canvasW: number, canvasH: number) {
  return {
    leftPct: (box.x / canvasW) * 100,
    topPct: (box.y / canvasH) * 100,
    widthPct: (box.w / canvasW) * 100,
    heightPct: (box.h / canvasH) * 100,
  };
}

type Pct = ReturnType<typeof pxBoxToPct>;

/** Sets both breakpoints' position as CSS custom properties, consumed
 * by `.posBox` (module stylesheet) — mirrors
 * `CeremonyIntemporel.tsx`'s own `zoneVars` exactly. */
function zoneVars(mobile: Pct, desktop: Pct): CSSProperties {
  return {
    "--zx": `${mobile.leftPct}%`,
    "--zy": `${mobile.topPct}%`,
    "--zw": `${mobile.widthPct}%`,
    "--zh": `${mobile.heightPct}%`,
    "--zxd": `${desktop.leftPct}%`,
    "--zyd": `${desktop.topPct}%`,
    "--zwd": `${desktop.widthPct}%`,
    "--zhd": `${desktop.heightPct}%`,
  } as CSSProperties;
}

function mobileZone(box: RecitOverlayBox) {
  return pxBoxToPct(box, RECIT_MOBILE_CANVAS.width, RECIT_MOBILE_CANVAS.height);
}
function desktopZone(box: RecitDesktopOverlayBox) {
  return pxBoxToPct(box, RECIT_DESKTOP_CANVAS.width, RECIT_DESKTOP_CANVAS.height);
}

const ZONE_TITLE = zoneVars(mobileZone(RECIT_MOBILE_OVERLAYS.globalTitle), desktopZone(RECIT_DESKTOP_OVERLAYS.globalTitle));
const ZONE_MICROCOPY = zoneVars(mobileZone(RECIT_MOBILE_OVERLAYS.microcopy), desktopZone(RECIT_DESKTOP_OVERLAYS.microcopy));

const ZONE_LABEL = {
  a10: zoneVars(mobileZone(RECIT_MOBILE_OVERLAYS.a10Label), desktopZone(RECIT_DESKTOP_OVERLAYS.a10Label)),
  a11: zoneVars(mobileZone(RECIT_MOBILE_OVERLAYS.a11Label), desktopZone(RECIT_DESKTOP_OVERLAYS.a11Label)),
  a12: zoneVars(mobileZone(RECIT_MOBILE_OVERLAYS.a12Label), desktopZone(RECIT_DESKTOP_OVERLAYS.a12Label)),
} as const;

const ZONE_BODY = {
  a10: zoneVars(mobileZone(RECIT_MOBILE_OVERLAYS.a10Body), desktopZone(RECIT_DESKTOP_OVERLAYS.a10Body)),
  a11: zoneVars(mobileZone(RECIT_MOBILE_OVERLAYS.a11Body), desktopZone(RECIT_DESKTOP_OVERLAYS.a11Body)),
  a12: zoneVars(mobileZone(RECIT_MOBILE_OVERLAYS.a12Body), desktopZone(RECIT_DESKTOP_OVERLAYS.a12Body)),
} as const;

/** Desktop's own `rotation_deg: -10` on the microcopy card — the only
 * overlay with a rotation, applied only at the desktop breakpoint via
 * the same media query every other desktop-only value uses. */
const MICROCOPY_ROTATION_DEG = RECIT_DESKTOP_OVERLAYS.microcopy.rotationDeg ?? 0;

export function RecitDeVieIntemporel({ content, language, skinVariant }: RecitDeVieIntemporelProps) {
  const matters = resolveLifeStoryContent(content, language);
  const scenes = RECIT_RUNTIME_SCENE_SRC[skinVariant];
  const ink = RECIT_RUNTIME_INK[skinVariant];

  const inkVars = {
    "--recit-ink": ink,
    "--recit-microcopy-rotation": `${MICROCOPY_ROTATION_DEG}deg`,
  } as CSSProperties;

  return (
    <SkinScope skin="intemporel" skinVariant={skinVariant}>
      <div
        className={`${styles.wrap} ${ebGaramond.variable} ${ebGaramondItalic.variable}`}
        style={inkVars}
        data-testid="recit-de-vie-intemporel"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={scenes.mobileTop} alt="" aria-hidden="true" className={`${styles.mobileImg} ${styles.mobileOnly}`} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={scenes.mobileMiddle} alt="" aria-hidden="true" className={`${styles.mobileImg} ${styles.mobileOnly}`} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={scenes.mobileBottom} alt="" aria-hidden="true" className={`${styles.mobileImg} ${styles.mobileOnly}`} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={scenes.desktop} alt="" aria-hidden="true" className={`${styles.desktopImg} ${styles.desktopOnly}`} />

        <h2 className={`${styles.posBox} ${styles.title} ${ebGaramond.className}`} style={ZONE_TITLE}>
          {translate(language, "recit.title")}
        </h2>

        {matters.map((matter) => (
          <div key={matter.id} data-matter={matter.id} data-fallback={matter.isFallback}>
            <p
              className={`${styles.posBox} ${styles.label} ${ebGaramond.className}`}
              style={ZONE_LABEL[matter.id]}
            >
              {translate(language, matter.labelKey)}
            </p>
            <div className={`${styles.posBox} ${styles.body} ${ebGaramond.className}`} style={ZONE_BODY[matter.id]}>
              {matter.displayText}
            </div>
          </div>
        ))}

        <p className={`${styles.posBox} ${styles.microcopy} ${ebGaramondItalic.className}`} style={ZONE_MICROCOPY}>
          {translate(language, "recit.decorativeMemories")}
        </p>
      </div>
    </SkinScope>
  );
}
