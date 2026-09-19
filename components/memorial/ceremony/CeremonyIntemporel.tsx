"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import type { Language } from "@/config/languages";
import type { SkinVariant } from "@/config/skins";
import type { MemorialContent } from "@/types/memorial";
import { readCeremony } from "@/lib/memorial/ceremony";
import { formatCeremonyDate, formatCeremonyTime } from "@/lib/memorial/format-ceremony-datetime";
import { translate } from "@/lib/i18n/translate";
import { SkinScope } from "@/components/memorial/SkinScope";
import {
  CEREMONY_INTEMPOREL_ASSET_SRC,
  CEREMONY_INTEMPOREL_BREAKPOINT_DESKTOP_PX,
  CEREMONY_INTEMPOREL_CANONICAL_DIMENSIONS,
  CEREMONY_INTEMPOREL_GEOMETRY,
  CEREMONY_INTEMPOREL_INK,
  CEREMONY_INTEMPOREL_MASTER_SRC,
  CEREMONY_INTEMPOREL_TYPOGRAPHY,
  type CeremonyPxBox,
  type CeremonyRuleLine,
} from "@/config/ceremony-intemporel-tokens";
import { ebGaramond } from "@/components/builder/fonts";
import styles from "./CeremonyIntemporel.module.css";

/**
 * Mission 040B — the real Ceremony ("Cérémonie") Memorial renderer,
 * Intemporel skin, Studio pack
 * `CEREMONIE_RUNTIME_STUDIO_QG_CANDIDATE_V3_CORRECTED` (GREEN QG).
 *
 * Architecturally the closest existing precedent is `HeroIntemporel.tsx`,
 * not `DeathNoticeIntemporel.tsx`: this package is `single_scene_per_
 * variant` (one fixed master per skinVariant × breakpoint, its own
 * `geometry.json`'s own words), never A03's dynamic SCENE TOP/MIDDLE×N/
 * BOTTOM tiling. So this component renders both master `<img>`s (only
 * one ever visible, CSS-switched at `CEREMONY_INTEMPOREL_BREAKPOINT_
 * DESKTOP_PX`) and positions every content zone as an absolutely-
 * positioned percentage box derived from `config/ceremony-intemporel-
 * tokens.ts`'s own pixel geometry — the exact technique
 * `HeroIntemporel.tsx`'s `photoWindowBox`/`textZoneBox`/`boxStyleVars`
 * already establish, reused here as `zoneVars` below.
 *
 * ## Fail-safe on corrupted content — never crashes
 *
 * Takes the whole `content: MemorialContent`, not a pre-validated
 * `CeremonyContent`, and reads it through `readCeremony` — the same
 * fail-safe read `lib/memorial/ceremony.ts` already defines, which
 * collapses a corrupted `content.ceremony` to the empty content rather
 * than throwing. A future composing page decides WHETHER to mount this
 * component at all (via `lib/memorial/ceremony-section.ts`'s
 * `isCeremonySectionActive`, itself reusing A04's own answer through
 * `section-selection.ts` — never duplicated here); this component's own
 * job, once mounted, is to never crash on whatever `content.ceremony`
 * actually contains, corrupted or not.
 *
 * ## FULL vs NO_PRACTICAL_INFO (mission brief's own closed state list)
 *
 * `hasPracticalContent = access !== null || note !== null` is the ONE
 * condition that decides: whether `practicalInfo` (icon + label + text)
 * renders at all, whether `ruleBottomFull`/`rulePracticalFull` renders,
 * and which `closing` box (`closingFull` vs `closingNoPractical`) the
 * `closing-heart-sprig.png` asset sits in — exactly `geometry.json`'s own
 * `states` block, never a third, invented state.
 *
 * ## Individually-empty dateTime/placeAddress zones (beyond the Studio's
 * own QA references)
 *
 * The Studio's QA set only exercises `practicalInfo` being absent, never
 * `dateTime`/`placeAddress` being entirely empty (every A05-A07 field
 * skipped). No Studio-defined state or geometry accounts for hiding
 * `dateTime`/`placeAddress` outright. This component's own choice, kept
 * consistent with `DeathNoticeIntemporel.tsx`'s existing "un bloc absent
 * disparaît totalement, jamais une ligne vide artificielle" doctrine: if
 * a zone's own fields are ALL null, that zone (icon + label + text)
 * renders nothing at all — never an empty label with nothing under it.
 * This is this component's own extrapolation, not a Studio-verified
 * pixel reference; flagged as such in the mission report.
 *
 * ## Typography — EB Garamond (see components/builder/fonts.ts)
 *
 * `title`/`primary`/`secondary`/`practical` render in `EB_Garamond`;
 * `label` (small-caps zone headings) reuses the SAME family with
 * `font-variant-caps: small-caps` — see `fonts.ts`'s own docstring for
 * why "EB Garamond SC" itself is not obtainable through this project's
 * existing font-loading mechanism.
 *
 * ## Overflow — shrink to 88%, never clip/ellipsis/truncate
 *
 * `useFitTextBlock` mirrors `HeroIntemporel.tsx`'s `useFitDisplayName`/
 * `DeathNoticeIntemporel.tsx`'s `useFitLongName` exactly: measure real
 * wrapped line count via the DOM `Range` technique, shrink in 1px steps
 * down to `minScale` (0.88) of nominal while the block still wraps past
 * its role's `maxLines`, then STOP — full text always renders, never
 * clipped or ellipsized, even if still over `maxLines` at the floor
 * (`spec/runtime-tokens.json`'s own `overflow.ifStillOverflow`: "fail
 * QA; do not clip, overlap, or silently truncate" — this hook's honest
 * floor-and-stop behavior is exactly what keeps that failure VISIBLE
 * rather than silently hidden). Applied only to `primary`/`secondary`/
 * `practical` (`CEREMONY_INTEMPOREL_OVERFLOW.shrinkableRoles`) — never to
 * `title`/`label`, short fixed HERITAGE-authored i18n strings.
 */
export interface CeremonyIntemporelProps {
  content: MemorialContent;
  language: Language;
  skinVariant: SkinVariant;
}

function pxBoxToPct(box: CeremonyPxBox, canvasW: number, canvasH: number) {
  return {
    leftPct: (box.x / canvasW) * 100,
    topPct: (box.y / canvasH) * 100,
    widthPct: (box.w / canvasW) * 100,
    heightPct: (box.h / canvasH) * 100,
  };
}

function iconCenterToPct(cx: number, cy: number, sizePx: number, canvasW: number, canvasH: number) {
  return pxBoxToPct({ x: cx - sizePx / 2, y: cy - sizePx / 2, w: sizePx, h: sizePx }, canvasW, canvasH);
}

function ruleToPct(rule: CeremonyRuleLine, strokePx: number, canvasW: number, canvasH: number) {
  const x = Math.min(rule.x1, rule.x2);
  const w = Math.abs(rule.x2 - rule.x1);
  return pxBoxToPct({ x, y: rule.y1 - strokePx / 2, w, h: strokePx }, canvasW, canvasH);
}

type Pct = ReturnType<typeof pxBoxToPct>;

/** Sets both breakpoints' position as CSS custom properties, consumed by
 * `.posBoxAuto`/`.posBoxFixed` (module stylesheet) — the same technique
 * `HeroIntemporel.tsx`'s own `boxStyleVars` uses, generic var names here
 * since each zone element carries its own scoped inline style rather
 * than sharing one parent scope. */
function zoneVars(desktop: Pct, mobile: Pct, withHeight: boolean): CSSProperties {
  const vars: Record<string, string> = {
    "--zx": `${desktop.leftPct}%`,
    "--zy": `${desktop.topPct}%`,
    "--zw": `${desktop.widthPct}%`,
    "--zxm": `${mobile.leftPct}%`,
    "--zym": `${mobile.topPct}%`,
    "--zwm": `${mobile.widthPct}%`,
  };
  if (withHeight) {
    vars["--zh"] = `${desktop.heightPct}%`;
    vars["--zhm"] = `${mobile.heightPct}%`;
  }
  return vars as CSSProperties;
}

const { desktop: D, mobile: M } = CEREMONY_INTEMPOREL_GEOMETRY;
const CANVAS_D = CEREMONY_INTEMPOREL_CANONICAL_DIMENSIONS.desktop;
const CANVAS_M = CEREMONY_INTEMPOREL_CANONICAL_DIMENSIONS.mobile;
const TYPO_D = CEREMONY_INTEMPOREL_TYPOGRAPHY.desktop;
const TYPO_M = CEREMONY_INTEMPOREL_TYPOGRAPHY.mobile;

const ZONE_TITLE = { d: pxBoxToPct(D.title, CANVAS_D.width, CANVAS_D.height), m: pxBoxToPct(M.title, CANVAS_M.width, CANVAS_M.height) };
const ZONE_TITLE_SPRIG = { d: pxBoxToPct(D.titleSprig, CANVAS_D.width, CANVAS_D.height), m: pxBoxToPct(M.titleSprig, CANVAS_M.width, CANVAS_M.height) };
const ZONE_DATE_TIME = { d: pxBoxToPct(D.dateTime, CANVAS_D.width, CANVAS_D.height), m: pxBoxToPct(M.dateTime, CANVAS_M.width, CANVAS_M.height) };
const ZONE_PLACE_ADDRESS = { d: pxBoxToPct(D.placeAddress, CANVAS_D.width, CANVAS_D.height), m: pxBoxToPct(M.placeAddress, CANVAS_M.width, CANVAS_M.height) };
const ZONE_PRACTICAL = { d: pxBoxToPct(D.practicalInfo, CANVAS_D.width, CANVAS_D.height), m: pxBoxToPct(M.practicalInfo, CANVAS_M.width, CANVAS_M.height) };
const ZONE_CLOSING_FULL = { d: pxBoxToPct(D.closingFull, CANVAS_D.width, CANVAS_D.height), m: pxBoxToPct(M.closingFull, CANVAS_M.width, CANVAS_M.height) };
const ZONE_CLOSING_NO_PRACTICAL = { d: pxBoxToPct(D.closingNoPractical, CANVAS_D.width, CANVAS_D.height), m: pxBoxToPct(M.closingNoPractical, CANVAS_M.width, CANVAS_M.height) };

const ICON_DATE = { d: iconCenterToPct(D.iconDate.cx, D.iconDate.cy, TYPO_D.iconCircleSizePx, CANVAS_D.width, CANVAS_D.height), m: iconCenterToPct(M.iconDate.cx, M.iconDate.cy, TYPO_M.iconCircleSizePx, CANVAS_M.width, CANVAS_M.height) };
const ICON_PLACE = { d: iconCenterToPct(D.iconPlace.cx, D.iconPlace.cy, TYPO_D.iconCircleSizePx, CANVAS_D.width, CANVAS_D.height), m: iconCenterToPct(M.iconPlace.cx, M.iconPlace.cy, TYPO_M.iconCircleSizePx, CANVAS_M.width, CANVAS_M.height) };
const ICON_PRACTICAL = { d: iconCenterToPct(D.iconPractical.cx, D.iconPractical.cy, TYPO_D.iconCircleSizePx, CANVAS_D.width, CANVAS_D.height), m: iconCenterToPct(M.iconPractical.cx, M.iconPractical.cy, TYPO_M.iconCircleSizePx, CANVAS_M.width, CANVAS_M.height) };

const VERTICAL_SEPARATOR_PCT = pxBoxToPct(D.verticalSeparator, CANVAS_D.width, CANVAS_D.height);

const RULE_TOP_PCT = ruleToPct(D.ruleTop, TYPO_D.ruleStrokePx, CANVAS_D.width, CANVAS_D.height);
const RULE_MID_PCT = ruleToPct(D.ruleMid, TYPO_D.ruleStrokePx, CANVAS_D.width, CANVAS_D.height);
const RULE_BOTTOM_FULL_PCT = ruleToPct(D.ruleBottomFull, TYPO_D.ruleStrokePx, CANVAS_D.width, CANVAS_D.height);
const RULE_DATE_PCT = ruleToPct(M.ruleDate, TYPO_M.ruleStrokePx, CANVAS_M.width, CANVAS_M.height);
const RULE_PLACE_PCT = ruleToPct(M.rulePlace, TYPO_M.ruleStrokePx, CANVAS_M.width, CANVAS_M.height);
const RULE_PRACTICAL_FULL_PCT = ruleToPct(M.rulePracticalFull, TYPO_M.ruleStrokePx, CANVAS_M.width, CANVAS_M.height);

function pctStyle(box: Pct): CSSProperties {
  return {
    position: "absolute",
    left: `${box.leftPct}%`,
    top: `${box.topPct}%`,
    width: `${box.widthPct}%`,
    height: `${box.heightPct}%`,
  };
}

/** Same DOM `Range` technique `HeroIntemporel.tsx`/`DeathNoticeIntemporel.tsx`
 * already use — fails safe to "1 line" where a real layout engine isn't
 * available (jsdom in tests), never throws. */
function countVisualLines(el: HTMLElement): number {
  const range = document.createRange();
  range.selectNodeContents(el);
  if (typeof range.getClientRects !== "function") return 1;
  const rects = range.getClientRects();
  return rects.length || 1;
}

interface FitTextBlockResult {
  ref: RefObject<HTMLDivElement | null>;
  fontSizePx: number | null;
}

/**
 * Shrinks a text block's font size (never below `minScale` × nominal)
 * until it wraps within its role's `maxLines`, or stops at the floor —
 * see this file's own top docstring, "Overflow" section.
 *
 * The "nominal" size this starts from is NOT a hardcoded desktop/mobile
 * px pair: it is whatever `CeremonyIntemporel.module.css`'s own fluid
 * `clamp(floorPx, Nvw, ceilingPx)` rule already resolved to at the
 * CURRENT real rendered width (`getComputedStyle(el).fontSize`, read
 * once per `fit()` call after clearing any previous JS override) — the
 * single source of truth for "what size is this text at this width" is
 * the CSS itself, never a second, duplicated width→size table that could
 * silently drift from it (this is also what fixed an initial QA pass's
 * real bug: a hardcoded desktop/mobile px pair rendered comically large
 * at real phone widths, which only ever render a FRACTION of the 941px
 * mobile canonical canvas — see the module stylesheet's own docstring).
 */
function useFitTextBlock(
  deps: readonly unknown[],
  maxLinesByBreakpoint: { desktopMaxLines: number; mobileMaxLines: number },
  minScale: number,
): FitTextBlockResult {
  const ref = useRef<HTMLDivElement | null>(null);
  const [fontSizePx, setFontSizePx] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    function fit() {
      if (!el) return;
      const isDesktop = window.innerWidth >= CEREMONY_INTEMPOREL_BREAKPOINT_DESKTOP_PX;
      const maxLines = isDesktop ? maxLinesByBreakpoint.desktopMaxLines : maxLinesByBreakpoint.mobileMaxLines;

      // Clear any earlier inline override so the CSS clamp's own value
      // (at the CURRENT real width) is what gets measured as "nominal".
      el.style.fontSize = "";
      const nominalPx = parseFloat(window.getComputedStyle(el).fontSize);
      const floorPx = nominalPx * minScale;

      let size = nominalPx;
      el.style.fontSize = `${size}px`;
      let lines = countVisualLines(el);
      while (lines > maxLines && size > floorPx) {
        size -= 1;
        el.style.fontSize = `${size}px`;
        lines = countVisualLines(el);
      }
      setFontSizePx(size);
    }

    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ref, fontSizePx };
}

export function CeremonyIntemporel({ content, language, skinVariant }: CeremonyIntemporelProps) {
  const ceremony = readCeremony(content);

  const dateTimeLines: string[] = [];
  if (ceremony.date !== null) dateTimeLines.push(formatCeremonyDate(ceremony.date, language));
  if (ceremony.time !== null) dateTimeLines.push(formatCeremonyTime(ceremony.time, language));
  const hasDateTime = dateTimeLines.length > 0;

  const hasPlaceAddress = ceremony.venueName !== null || ceremony.address !== null;
  const hasPracticalContent = ceremony.access !== null || ceremony.note !== null;

  const closingBox = hasPracticalContent ? ZONE_CLOSING_FULL : ZONE_CLOSING_NO_PRACTICAL;
  const assets = CEREMONY_INTEMPOREL_ASSET_SRC[skinVariant];
  const masterSrc = CEREMONY_INTEMPOREL_MASTER_SRC[skinVariant];
  const ink = CEREMONY_INTEMPOREL_INK[skinVariant];

  const { ref: dateTimeRef, fontSizePx: dateTimeFontSizePx } = useFitTextBlock(
    [ceremony.date, ceremony.time, language],
    { desktopMaxLines: TYPO_D.primary.maxLines, mobileMaxLines: TYPO_M.primary.maxLines },
    0.88,
  );
  const { ref: venueRef, fontSizePx: venueFontSizePx } = useFitTextBlock(
    [ceremony.venueName],
    { desktopMaxLines: TYPO_D.primary.maxLines, mobileMaxLines: TYPO_M.primary.maxLines },
    0.88,
  );
  const { ref: addressRef, fontSizePx: addressFontSizePx } = useFitTextBlock(
    [ceremony.address],
    { desktopMaxLines: TYPO_D.secondary.maxLines, mobileMaxLines: TYPO_M.secondary.maxLines },
    0.88,
  );
  const { ref: practicalRef, fontSizePx: practicalFontSizePx } = useFitTextBlock(
    [ceremony.access, ceremony.note],
    { desktopMaxLines: TYPO_D.practical.maxLines, mobileMaxLines: TYPO_M.practical.maxLines },
    0.88,
  );

  const inkVars = {
    "--ceremony-ink-text-primary": ink.textPrimary,
    "--ceremony-ink-text-secondary": ink.textSecondary,
  } as CSSProperties;

  return (
    <SkinScope skin="intemporel" skinVariant={skinVariant}>
      <div className={`${styles.wrap} ${ebGaramond.variable}`} style={inkVars} data-testid="ceremony-intemporel">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={masterSrc.desktop} alt="" aria-hidden="true" className={styles.masterDesktop} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={masterSrc.mobile} alt="" aria-hidden="true" className={styles.masterMobile} />

        <div className={styles.posBoxAuto} style={zoneVars(ZONE_TITLE.d, ZONE_TITLE.m, false)}>
          <h2 className={`${styles.title} ${ebGaramond.className}`}>{translate(language, "ceremony.sectionTitle")}</h2>
        </div>

        <div className={styles.posBoxAuto} style={zoneVars(ZONE_TITLE_SPRIG.d, ZONE_TITLE_SPRIG.m, false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={assets.titleSprig} alt="" aria-hidden="true" className={styles.decorImgAuto} />
        </div>

        {/* Date/heure */}
        {hasDateTime && (
          <>
            <div className={styles.posBoxFixed} style={zoneVars(ICON_DATE.d, ICON_DATE.m, true)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={assets.iconCalendar} alt="" aria-hidden="true" className={styles.decorImg} />
            </div>
            <div className={styles.posBoxAuto} style={zoneVars(ZONE_DATE_TIME.d, ZONE_DATE_TIME.m, false)}>
              <div className={styles.zoneRow}>
                <p className={`${styles.zoneLabel} ${ebGaramond.className}`}>
                  {translate(language, "ceremony.zoneDateTime")}
                </p>
                <div
                  ref={dateTimeRef}
                  className={`${styles.primaryText} ${ebGaramond.className}`}
                  style={dateTimeFontSizePx !== null ? { fontSize: `${dateTimeFontSizePx}px` } : undefined}
                >
                  {dateTimeLines.map((line) => (
                    <p key={line} className={styles.zoneBody}>
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Lieu / adresse */}
        {hasPlaceAddress && (
          <>
            <div className={styles.posBoxFixed} style={zoneVars(ICON_PLACE.d, ICON_PLACE.m, true)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={assets.iconLocation} alt="" aria-hidden="true" className={styles.decorImg} />
            </div>
            <div className={styles.posBoxAuto} style={zoneVars(ZONE_PLACE_ADDRESS.d, ZONE_PLACE_ADDRESS.m, false)}>
              <div className={styles.zoneRow}>
                <p className={`${styles.zoneLabel} ${ebGaramond.className}`}>
                  {translate(language, "ceremony.zonePlace")}
                </p>
                {ceremony.venueName !== null && (
                  <div
                    ref={venueRef}
                    className={`${styles.primaryText} ${ebGaramond.className}`}
                    style={venueFontSizePx !== null ? { fontSize: `${venueFontSizePx}px` } : undefined}
                  >
                    {ceremony.venueName}
                  </div>
                )}
                {ceremony.address !== null && (
                  <div
                    ref={addressRef}
                    className={`${styles.secondaryText} ${ebGaramond.className}`}
                    style={addressFontSizePx !== null ? { fontSize: `${addressFontSizePx}px` } : undefined}
                  >
                    {ceremony.address}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Desktop-only vertical separator between the two columns above */}
        <div className={`${styles.posBoxFixed} ${styles.desktopOnly}`} style={zoneVars(VERTICAL_SEPARATOR_PCT, VERTICAL_SEPARATOR_PCT, true)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={assets.separatorVertical} alt="" aria-hidden="true" className={styles.decorImg} />
        </div>

        {/* Rules — desktop set */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={assets.separatorHorizontal} alt="" aria-hidden="true" className={`${styles.rule} ${styles.desktopOnly}`} style={pctStyle(RULE_TOP_PCT)} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={assets.separatorHorizontal} alt="" aria-hidden="true" className={`${styles.rule} ${styles.desktopOnly}`} style={pctStyle(RULE_MID_PCT)} />
        {hasPracticalContent && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={assets.separatorHorizontal} alt="" aria-hidden="true" className={`${styles.rule} ${styles.desktopOnly}`} style={pctStyle(RULE_BOTTOM_FULL_PCT)} />
        )}

        {/* Rules — mobile set */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={assets.separatorHorizontal} alt="" aria-hidden="true" className={`${styles.rule} ${styles.mobileOnly}`} style={pctStyle(RULE_DATE_PCT)} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={assets.separatorHorizontal} alt="" aria-hidden="true" className={`${styles.rule} ${styles.mobileOnly}`} style={pctStyle(RULE_PLACE_PCT)} />
        {hasPracticalContent && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={assets.separatorHorizontal} alt="" aria-hidden="true" className={`${styles.rule} ${styles.mobileOnly}`} style={pctStyle(RULE_PRACTICAL_FULL_PCT)} />
        )}

        {/* Informations pratiques */}
        {hasPracticalContent && (
          <>
            <div className={styles.posBoxFixed} style={zoneVars(ICON_PRACTICAL.d, ICON_PRACTICAL.m, true)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={assets.iconInfo} alt="" aria-hidden="true" className={styles.decorImg} />
            </div>
            <div className={styles.posBoxAuto} style={zoneVars(ZONE_PRACTICAL.d, ZONE_PRACTICAL.m, false)}>
              <div className={styles.zoneRow}>
                <p className={`${styles.zoneLabel} ${ebGaramond.className}`}>{translate(language, "ceremony.zonePractical")}</p>
                <div
                  ref={practicalRef}
                  className={ebGaramond.className}
                  style={practicalFontSizePx !== null ? { fontSize: `${practicalFontSizePx}px` } : undefined}
                >
                  {ceremony.access !== null && <p className={styles.practicalText}>{ceremony.access}</p>}
                  {ceremony.note !== null && <p className={styles.practicalText}>{ceremony.note}</p>}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Closing — ONE composited asset (rule + heart + sprig), Studio-verbatim */}
        <div className={styles.posBoxAuto} style={zoneVars(closingBox.d, closingBox.m, false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={assets.closingHeartSprig} alt="" aria-hidden="true" className={styles.decorImgAuto} />
        </div>
      </div>
    </SkinScope>
  );
}
