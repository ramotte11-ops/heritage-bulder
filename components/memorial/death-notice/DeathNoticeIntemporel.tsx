"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { Language } from "@/config/languages";
import type { EditorialContext } from "@/config/memorial";
import type { SkinVariant } from "@/config/skins";
import type { HeroContent } from "@/types/hero";
import type { DeathNoticeContent } from "@/types/death-notice";
import type { DeathNoticePrecisionField } from "@/lib/memorial/death-notice";
import type { TranslationKey } from "@/lib/i18n/keys";
import { translate } from "@/lib/i18n/translate";
import { formatHeroDateRange } from "@/lib/memorial/format-hero-date";
import {
  DEATH_NOTICE_INTEMPOREL_ASSETS,
  DEATH_NOTICE_INTEMPOREL_BREAKPOINT_MOBILE_PX,
  DEATH_NOTICE_INTEMPOREL_TYPOGRAPHY,
} from "@/config/death-notice-intemporel-tokens";
import { SkinScope } from "@/components/memorial/SkinScope";
import { cormorantGaramond } from "@/components/builder/fonts";
import styles from "./DeathNoticeIntemporel.module.css";

/**
 * Mission 039B (A03) — "intégration finale du handoff Studio" — the real
 * Death Notice ("Avis de décès") editorial renderer, Intemporel skin.
 *
 * Composes the Studio's `A03_HANDOFF_FINAL_V2` pack (Memorial Stage +
 * extensible Sheet, `config/death-notice-intemporel-tokens.ts`) with the
 * family's real canonical content — the same discipline
 * `HeroIntemporel.tsx` already established: no family text is ever baked
 * into an asset, every asset is decorative only, and this is the SAME
 * renderer a future Live Preview and the published memorial page will
 * use, never a mock built specially for the Builder's own A03 screen
 * (`DeathNoticePreviewStep.tsx`).
 *
 * ## Three-mass architecture (spec §2)
 *
 * `.stage` — the composed Memorial Stage ambiance (`<picture>`-switched
 *   Light/Dark × Mobile/Desktop, the ONE `<picture>` in this component:
 *   by far the heaviest files in the pack, spec §12 "ne pas charger
 *   inutilement les deux scènes lourdes").
 * `.sheetMount` — an absolutely-positioned box inside `.stage`, at the
 *   Sheet's own real mount coordinates (`DEATH_NOTICE_INTEMPOREL_SHEET_MOUNT`).
 *   Contains the extensible Sheet (top/body/bottom, see the module
 *   stylesheet's own docstring for how its height tracks `.content`'s
 *   natural flow with no JS measurement) and the family's real content on
 *   top of it.
 *
 * The rameau décoratif is baked into `sheetTop` now (spec §6) — this
 * component renders no separate ornament element; doing so would
 * duplicate that exact decor (QA matrix "FAIL immédiat": "décor
 * botanique reconstruit par éléments").
 *
 * ## Mobile/Desktop for the Sheet caps (spec §5, §12)
 *
 * `sheetTop`/`sheetBody`/`sheetBottom` are lighter files than the Stage
 * (tens of KB, not ~1.2–1.5MB) — this mission renders both Mobile and
 * Desktop caps unconditionally and switches visibility at the
 * `768px` breakpoint via CSS, the same technique
 * `HeroIntemporel.module.css` already established for its own two
 * runtime masters, rather than a second `<picture>` for every cap.
 *
 * ## Modular precision blocks (AGENTS.md section 9)
 *
 * Each of A02's five precisions renders as its own block — icon, label,
 * family text — entirely absent, no reserved space, when the family
 * never entered it. Blocks group into rows of (at most) two for the
 * desktop/tablet two-column layout; a narrow viewport stacks to one
 * column via CSS alone.
 *
 * ## Long name — mobile fallback (spec §9.1/§9.2)
 *
 * See `useFitLongName` below and
 * `DEATH_NOTICE_INTEMPOREL_TYPOGRAPHY.name`'s own docstring for the exact
 * rule. Desktop never goes past 2 lines (QA matrix D-NAM); the Mobile
 * 3-line/32–34px fallback is the Studio-validated exception (spec §9.2's
 * own QA case, "Marie-Alexandrine de Beaumont-Rousseau
 * Delacroix-Fontaine"). Never truncates, ellipsizes, or invents a 4th
 * line — only the font-size (and, only in fallback, the max-width) ever
 * changes.
 *
 * ## Dates (AGENTS.md section 7)
 *
 * Reuses `formatHeroDateRange` exactly as `HeroIntemporel` does — no
 * second date-formatting rule, no invented age-at-death.
 */
export interface DeathNoticeIntemporelProps {
  hero: HeroContent;
  deathNotice: DeathNoticeContent;
  editorialContext: EditorialContext;
  language: Language;
  skinVariant: SkinVariant;
}

const PRECISION_BLOCKS: readonly {
  field: DeathNoticePrecisionField;
  labelKey: TranslationKey;
  icon: string;
}[] = [
  {
    field: "generalLocation",
    labelKey: "deathNotice.blockLocation",
    icon: DEATH_NOTICE_INTEMPOREL_ASSETS.precisionIcons.generalLocation,
  },
  {
    field: "familyMessage",
    labelKey: "deathNotice.blockFamilyMessage",
    icon: DEATH_NOTICE_INTEMPOREL_ASSETS.precisionIcons.familyMessage,
  },
  {
    field: "thought",
    labelKey: "deathNotice.blockThought",
    icon: DEATH_NOTICE_INTEMPOREL_ASSETS.precisionIcons.thought,
  },
  {
    field: "quote",
    labelKey: "deathNotice.blockQuote",
    icon: DEATH_NOTICE_INTEMPOREL_ASSETS.precisionIcons.quote,
  },
  {
    field: "other",
    labelKey: "deathNotice.blockOther",
    icon: DEATH_NOTICE_INTEMPOREL_ASSETS.precisionIcons.other,
  },
];

interface VisiblePrecisionBlock {
  field: DeathNoticePrecisionField;
  labelKey: TranslationKey;
  icon: string;
  text: string;
}

/** Groups the currently-visible blocks into rows of (at most) two, in
 * the fixed canonical order above — the exact grouping the two-column
 * desktop layout renders, with mobile falling back to one column per
 * row via CSS alone (module stylesheet). A lone 5th (or 3rd, 1st...)
 * block simply ends up alone in its own row — never a reserved empty
 * cell beside it. */
function chunkIntoRows<T>(items: readonly T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size));
  }
  return rows;
}

/** Same DOM technique `HeroIntemporel.tsx`'s `countVisualLines` already
 * uses: a `Range` over the element's text content, one client rect per
 * visual line for wrapped inline content. jsdom (tests) doesn't
 * implement `getClientRects` for a Range — fails safe to "1 line" there
 * rather than throwing. */
function countVisualLines(el: HTMLElement): number {
  const range = document.createRange();
  range.selectNodeContents(el);
  if (typeof range.getClientRects !== "function") return 1;
  const rects = range.getClientRects();
  return rects.length || 1;
}

export interface FitLongNameResult {
  ref: RefObject<HTMLHeadingElement | null>;
  fontSizePx: number | null;
  isFallback: boolean;
}

/**
 * Spec §9.1/§9.2 — Mobile-only exceptional fallback.
 *
 * "Cas normal" (1–2 lines) is handled entirely by CSS — the module
 * stylesheet's own `clamp(38px, 10vw, 50px)` on `.name` already gives
 * most names their normal responsive size with no JS at all, exactly
 * per spec §9.1's own token. This hook only ever engages on a narrow
 * viewport (< `DEATH_NOTICE_INTEMPOREL_BREAKPOINT_MOBILE_PX`) and only
 * once the name still wraps past `maxLinesNormal` at the CSS clamp's own
 * floor — Desktop is untouched (QA matrix D-NAM: "max 2 lignes" always;
 * this hook's `isFallback` never gets a chance to run above the mobile
 * breakpoint at all).
 *
 * Once engaged: sets the fallback's own `targetPx` (34px), re-measures,
 * and only shrinks further (in whole px, never past `fallback.minPx`,
 * 32px) if still over `fallback.maxLines` (3). Never truncates,
 * ellipsizes, or drops a word — the full name is always the element's
 * `textContent`; only `fontSizePx` (and `.module.css`'s own
 * fallback-mode `max-width`/`line-height`/`margin-bottom`, applied via
 * `isFallback`) ever change. If a name still doesn't fit in 3 lines at
 * 32px, this stays at 32px/whatever it wraps to — spec §9.2's own STOP
 * clause ("Claude ne réduit pas davantage… n'invente pas une 4e ligne")
 * is a Studio/QG escalation, not a further client-side reduction.
 */
export function useFitLongName(text: string): FitLongNameResult {
  const ref = useRef<HTMLHeadingElement | null>(null);
  const [result, setResult] = useState<{ fontSizePx: number | null; isFallback: boolean }>({
    fontSizePx: null,
    isFallback: false,
  });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const t = DEATH_NOTICE_INTEMPOREL_TYPOGRAPHY.name;

    function fit() {
      if (!el) return;
      const isMobile = window.innerWidth < DEATH_NOTICE_INTEMPOREL_BREAKPOINT_MOBILE_PX;

      if (!isMobile) {
        el.classList.remove(styles.nameFallback);
        el.style.fontSize = "";
        setResult({ fontSizePx: null, isFallback: false });
        return;
      }

      // Cas normal — the CSS clamp's own floor (mobile.minPx) already
      // rendered. Measure it as-is; if it already fits, do nothing (no
      // inline override needed, CSS keeps driving the responsive size).
      el.classList.remove(styles.nameFallback);
      el.style.fontSize = "";
      if (countVisualLines(el) <= t.mobile.maxLinesNormal) {
        setResult({ fontSizePx: null, isFallback: false });
        return;
      }

      // Fallback exceptionnel (§9.2) — target size, shrink only if still
      // over maxLines, never past fallback.minPx.
      //
      // BUGFIX (QG audit): `.nameFallback` (the class that narrows the
      // name to the spec's own 88%-of-Sheet max-width and tightens
      // line-height to 0.92) must be applied to the element BEFORE this
      // loop measures anything — not only after `setResult` triggers React
      // to add it on the next render. Measuring at the WIDER pre-fallback
      // box (the plain `.name` class, no width cap) undercounts how many
      // lines the text will actually wrap into once React applies the
      // narrower fallback box a moment later, letting the loop exit one or
      // more sizes too early and silently ship a name that re-wraps past
      // `fb.maxLines` after the fact. Adding the class imperatively here
      // makes every measurement in this loop reflect the box the family
      // will actually see.
      el.classList.add(styles.nameFallback);
      const fb = t.mobile.fallback;
      let size = fb.targetPx;
      el.style.fontSize = `${size}px`;
      let lines = countVisualLines(el);
      while (lines > fb.maxLines && size > fb.minPx) {
        size -= 1;
        el.style.fontSize = `${size}px`;
        lines = countVisualLines(el);
      }
      setResult({ fontSizePx: size, isFallback: true });
    }

    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [text]);

  return { ref, ...result };
}

export function DeathNoticeIntemporel({
  hero,
  deathNotice,
  editorialContext,
  language,
  skinVariant,
}: DeathNoticeIntemporelProps) {
  const dateRangeText = formatHeroDateRange(hero.birth, hero.death, language);
  const contextLabel = translate(
    language,
    editorialContext === "announcement" ? "context.announcementTitle" : "context.remembranceTitle",
  );

  const visibleBlocks: VisiblePrecisionBlock[] = PRECISION_BLOCKS.filter(
    (block) => deathNotice.precisions[block.field] !== null,
  ).map((block) => ({ ...block, text: deathNotice.precisions[block.field] as string }));

  const precisionRows = chunkIntoRows(visibleBlocks, 2);

  // The one place a `SkinVariant` picks WHICH complete asset set applies
  // — every one of these is a real Studio asset for its variant, never a
  // Light asset reused for Dark (or vice versa) — the
  // `Record<SkinVariant, FormatAssets>` shape makes cross-variant mixing
  // a type error, not just a discipline.
  const stageSrc = DEATH_NOTICE_INTEMPOREL_ASSETS.stage[skinVariant];
  const sheetTopSrc = DEATH_NOTICE_INTEMPOREL_ASSETS.sheetTop[skinVariant];
  const sheetBodySrc = DEATH_NOTICE_INTEMPOREL_ASSETS.sheetBody[skinVariant];
  const sheetBottomSrc = DEATH_NOTICE_INTEMPOREL_ASSETS.sheetBottom[skinVariant];

  const { ref: nameRef, fontSizePx: nameFontSizePx, isFallback: nameIsFallback } = useFitLongName(
    hero.displayName ?? "",
  );

  return (
    <SkinScope skin="intemporel" skinVariant={skinVariant}>
      <div className={`${styles.wrap} ${cormorantGaramond.variable}`}>
        {/* The composed Memorial Stage — full-bleed ambiance (desk,
            secondary papers, peripheral botanicals, shadow). ART-ONLY,
            no decorative text baked in (spec §2). The one `<picture>` in
            this component — by far the heaviest asset pair, spec §12's
            own "ne pas charger inutilement les deux scènes lourdes". */}
        <picture>
          <source media={`(min-width: ${DEATH_NOTICE_INTEMPOREL_BREAKPOINT_MOBILE_PX}px)`} srcSet={stageSrc.desktop} />
          <img src={stageSrc.mobile} alt="" aria-hidden="true" className={styles.stage} />
        </picture>

        <div className={styles.sheetMount}>
          <div className={styles.sheet}>
            {/* The extensible Sheet envelope — torn edges, texture, the
                rameau décoratif (baked into TOP now) and THE SEAL (baked
                into BOTTOM). This component draws none of it itself.
                Mobile/Desktop caps both render; CSS switches visibility
                at the same breakpoint as the Stage `<picture>` above
                (module stylesheet's own docstring — these are light
                files, unlike the Stage). `.sheet`'s own total height is
                driven by `.content`'s natural flow, one sibling below. */}
            <div className={styles.envelope} aria-hidden="true">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={sheetTopSrc.desktop} alt="" aria-hidden="true" className={styles.envelopeTopDesktop} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={sheetTopSrc.mobile} alt="" aria-hidden="true" className={styles.envelopeTopMobile} />
              <div
                className={styles.envelopeBodyDesktop}
                style={{ backgroundImage: `url(${sheetBodySrc.desktop})` }}
              />
              <div
                className={styles.envelopeBodyMobile}
                style={{ backgroundImage: `url(${sheetBodySrc.mobile})` }}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={sheetBottomSrc.desktop} alt="" aria-hidden="true" className={styles.envelopeBottomDesktop} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={sheetBottomSrc.mobile} alt="" aria-hidden="true" className={styles.envelopeBottomMobile} />
            </div>

            {/* Eyebrow + section title sit inside the top cap's own
                blank paper area, above the baked rameau — see the module
                stylesheet's own docstring for how `.capText` and
                `.content`'s padding-top both derive from the exact same
                cap pixel dimensions, guaranteeing `.name` never starts
                before the cap's real bottom edge. */}
            <div className={styles.capTextBox}>
              <p className={styles.eyebrow}>{contextLabel}</p>
              <h1 className={styles.title}>{translate(language, "deathNotice.previewTitle")}</h1>
            </div>

            <article className={styles.content}>
              <h2
                ref={nameRef}
                className={`${styles.name} ${nameIsFallback ? styles.nameFallback : ""}`}
                style={nameFontSizePx !== null ? { fontSize: `${nameFontSizePx}px` } : undefined}
              >
                {hero.displayName ?? ""}
              </h2>
              {dateRangeText !== null && <p className={styles.dates}>{dateRangeText}</p>}

              <div className={styles.divider} aria-hidden="true" />

              {deathNotice.announcementText !== null && (
                <p className={styles.announcement}>{deathNotice.announcementText}</p>
              )}

              {precisionRows.length > 0 && (
                <div className={styles.precisions}>
                  {precisionRows.map((row) => (
                    <div key={row.map((block) => block.field).join("-")} className={styles.precisionRow}>
                      {row.map((block) => (
                        <div key={block.field} className={styles.precisionBlock}>
                          <div className={styles.precisionHeading}>
                            {/* A generic, single-color pictogram, tinted
                                to the current ink color via a CSS mask
                                rather than a second (Dark) icon asset, so
                                it stays legible on either paper tone.
                                Never an <img>: a mask has no content of
                                its own to need alt text; the adjacent
                                label already carries it. */}
                            <span
                              aria-hidden="true"
                              className={styles.precisionIcon}
                              style={{
                                WebkitMaskImage: `url(${block.icon})`,
                                maskImage: `url(${block.icon})`,
                              }}
                            />
                            <span className={styles.precisionLabel}>{translate(language, block.labelKey)}</span>
                          </div>
                          <p
                            className={
                              block.field === "quote"
                                ? `${styles.precisionText} ${styles.precisionTextQuote}`
                                : styles.precisionText
                            }
                          >
                            {block.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </article>
          </div>
        </div>
      </div>
    </SkinScope>
  );
}
