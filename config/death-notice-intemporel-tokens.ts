import type { SkinVariant } from "@/config/skins";

/**
 * Mission 039B — "intégration finale du handoff Studio" — the Death
 * Notice Intemporel (A03) asset + design tokens, Studio pack
 * `A03_HANDOFF_FINAL_V2` (ART-ONLY correction), verified byte-for-byte
 * against that pack's own `SHA256SUMS.txt` before copying into `public/`.
 * `A03_RUNTIME_SPEC_v1.1.md` (the QG-locked "Documentation Lock" spec,
 * not the v1.0 copy shipped inside the pack itself) is the rules this
 * file's shape follows — see that spec's own sections 2–12.
 *
 * ## What this REPLACES (Mission 039B "intégration finale du handoff")
 *
 * The earlier `HERITAGE_A03_RUNTIME_SPLIT_PACK_V1` (a single TOP/MIDDLE/
 * BOTTOM triple per variant, no Stage, no Mobile/Desktop split, the
 * ornamental branch a separate dynamic asset) is gone. Its PNGs stay
 * physically present under `public/assets/death-notice/intemporel/`
 * (unused rather than actively harmful — same accounting discipline this
 * file's own predecessor already applied to the CSS-tiled papeterie it
 * replaced) but nothing here references them anymore.
 *
 * ## The three-mass runtime architecture this pack introduces (spec §2)
 *
 * 1. **Stage** (`stage`) — the fully-composed Memorial Stage ambiance:
 *    desk/table surface, secondary papers, peripheral botanicals, ambient
 *    shadows. ART-ONLY per this pack's own `ART_ONLY_CORRECTION.md`: no
 *    decorative/localizable text baked in, and the sheet's own mount area
 *    is a genuinely transparent cut (`role: "art-only stage environment;
 *    sheet mount hole transparent"` in `manifest.json`) — never a second
 *    rectangle Claude repositions by eye.
 * 2. **Sheet** (`sheetTop`/`sheetBody`/`sheetBottom`) — the extensible
 *    paper envelope that mounts inside the Stage's own transparent hole:
 *    fixed top cap (torn edge + the rameau décoratif, now baked in — see
 *    below), a vertically-repeatable body, and a fixed bottom cap (torn
 *    edge + the HERITAGE seal, baked in).
 * 3. **Dynamic content** — HTML/CSS only, injected on top: eyebrow,
 *    section title, name, dates, announcement, the five optional
 *    precision blocks. Never baked into any of the above.
 *
 * Both Stage and Sheet ship one real, independently-composed asset per
 * `skin_variant × format` (Light/Dark × Mobile/Desktop) — Mobile is a
 * dedicated Studio composition, never a shrunk Desktop (spec §5, §15).
 *
 * ## The rameau décoratif now lives in the top cap (spec §6)
 *
 * Unlike the V1 pack (where `ornamentBranch` was its own dynamic-content
 * asset, deliberately kept outside the Runtime Split Pack), this pack's
 * own `sheetTop` already carries the decorative branch baked in — CAP
 * HAUT's contents per spec §6 are explicitly "bord supérieur déchiré,
 * texture, ombre de bord ET rameau décoratif". `DeathNoticeIntemporel.tsx`
 * renders no separate ornament element anymore; rendering one would
 * duplicate that exact decor (the QA matrix's own "FAIL immédiat" list
 * names this failure mode directly: "décor botanique reconstruit par
 * éléments").
 *
 * ## Geometry sources (spec §4–§6, this pack's own `manifest.json`)
 *
 * - Stage canvas: 1672×941 (Desktop), 941×1672 (Mobile) — both variants,
 *   confirmed identical in `manifest.json`.
 * - Sheet mount box (Desktop, spec §4's own locked bbox): left 281px,
 *   top 54px, width 1107px on the 1672-wide canvas — 16.81% / 5.74% /
 *   66.21% — independently re-confirmed against `a03-stage.png`'s own
 *   alpha channel (measured hole: x 279–1390, y 52–893, i.e. the exact
 *   same box within anti-aliasing). Desktop's mount box is identical
 *   Light/Dark.
 * - Sheet mount box (Mobile): the spec gives only a guidance range
 *   (§5: "environ 56–60% du canvas… 90–94vw à l'écran"), not a locked
 *   bbox like Desktop's — this mission measured each Mobile Stage's own
 *   alpha channel directly (Light: hole left 21.36%/top 10.71%; Dark:
 *   left 19.66%/top 6.34%) and paired it with each Sheet cap's own real
 *   pixel width (Light 531px/Dark 559px on the 941-wide canvas — 56.4%/
 *   59.4%, both inside the spec's guidance range) — never a single
 *   number reused across variants by assumption.
 * - Cap dimensions (`sheetTop`/`sheetBody`/`sheetBottom`): transcribed
 *   verbatim from `manifest.json`'s own `width`/`height` per file — see
 *   `DEATH_NOTICE_INTEMPOREL_CAP_DIMENSIONS_PX`.
 */

export const DEATH_NOTICE_INTEMPOREL_BREAKPOINT_MOBILE_PX = 768;
export const DEATH_NOTICE_INTEMPOREL_BREAKPOINT_DESKTOP_PX = 1100;

interface FormatAssets {
  desktop: string;
  mobile: string;
}

const ASSET_ROOT = "/assets/death-notice/intemporel/a03";

export const DEATH_NOTICE_INTEMPOREL_ASSETS = {
  /** The composed Memorial Stage — full-bleed background, ART-ONLY,
   * the ONE thing this component uses `<picture>` for (spec §12: "ne
   * pas charger inutilement les deux scènes lourdes" — these are by far
   * the heaviest files in the pack, ~1.2–1.5MB each). */
  stage: {
    light: { desktop: `${ASSET_ROOT}/light/desktop/stage.png`, mobile: `${ASSET_ROOT}/light/mobile/stage.png` },
    dark: { desktop: `${ASSET_ROOT}/dark/desktop/stage.png`, mobile: `${ASSET_ROOT}/dark/mobile/stage.png` },
  } satisfies Record<SkinVariant, FormatAssets>,
  /** Fixed, non-repeating top of the Sheet's own envelope — torn edge,
   * texture, edge shadow AND the rameau décoratif, all baked in (spec
   * §6). Rendered once, at its own natural aspect ratio, never
   * stretched. */
  sheetTop: {
    light: { desktop: `${ASSET_ROOT}/light/desktop/sheet-top.png`, mobile: `${ASSET_ROOT}/light/mobile/sheet-top.png` },
    dark: { desktop: `${ASSET_ROOT}/dark/desktop/sheet-top.png`, mobile: `${ASSET_ROOT}/dark/mobile/sheet-top.png` },
  } satisfies Record<SkinVariant, FormatAssets>,
  /** Vertically-repeatable paper matter — `background-repeat: repeat-y`,
   * filling exactly as much height as the family's real content needs.
   * No rule/icon/text baked in (this pack's own `ART_ONLY_CORRECTION.md`). */
  sheetBody: {
    light: { desktop: `${ASSET_ROOT}/light/desktop/sheet-body.png`, mobile: `${ASSET_ROOT}/light/mobile/sheet-body.png` },
    dark: { desktop: `${ASSET_ROOT}/dark/desktop/sheet-body.png`, mobile: `${ASSET_ROOT}/dark/mobile/sheet-body.png` },
  } satisfies Record<SkinVariant, FormatAssets>,
  /** Fixed, non-repeating bottom of the Sheet's own envelope — lower torn
   * edge, THE HERITAGE SEAL, and its decorative rules, all baked in.
   * Rendered once, anchored to the Sheet's own bottom edge, never
   * stretched. */
  sheetBottom: {
    light: { desktop: `${ASSET_ROOT}/light/desktop/sheet-bottom.png`, mobile: `${ASSET_ROOT}/light/mobile/sheet-bottom.png` },
    dark: { desktop: `${ASSET_ROOT}/dark/desktop/sheet-bottom.png`, mobile: `${ASSET_ROOT}/dark/mobile/sheet-bottom.png` },
  } satisfies Record<SkinVariant, FormatAssets>,
  /** One pictogram per A02 precision, keyed by the exact
   * `DeathNoticePrecisionField` it illustrates. This pack ships its own
   * icon set (`02_RUNTIME_ASSETS/icons/`) — checksummed different from
   * the earlier V1 pack's icons, so this mission uses THESE files (the
   * ones this handoff's own manifest/checksums actually cover), never a
   * silent mix of old + new icon generations. Variant-independent, same
   * discipline as before: tinted via CSS mask, no second (Dark) file. */
  precisionIcons: {
    generalLocation: `${ASSET_ROOT}/icons/icon-location.png`,
    familyMessage: `${ASSET_ROOT}/icons/icon-family.png`,
    thought: `${ASSET_ROOT}/icons/icon-thought.png`,
    quote: `${ASSET_ROOT}/icons/icon-quote.png`,
    other: `${ASSET_ROOT}/icons/icon-other.png`,
  },
} as const;

/** The Stage canvas's own pixel size — identical across both variants
 * (`manifest.json`). Drives `.stage`'s `aspect-ratio` per breakpoint. */
export const DEATH_NOTICE_INTEMPOREL_STAGE_DIMENSIONS_PX = {
  desktop: [1672, 941],
  mobile: [941, 1672],
} as const;

/** Where the Sheet mounts inside the Stage's own transparent hole, as a
 * percentage box of the Stage canvas — see this file's own docstring
 * ("Geometry sources") for how each number was sourced/verified. These
 * are the RAW, unscaled measurements (kept here for provenance/audit).
 * `DeathNoticeIntemporel.module.css`'s own `.sheetMount`/`.stage` derive
 * a separate, uniformly-SCALED set of Mobile numbers from these exact
 * figures — spec §5's own runtime target ("la feuille vise 90-94vw" on
 * an actual phone) is measurably wider than this raw canvas ratio, which
 * carries the Studio reference artboard's own generous ambient margins
 * — see that stylesheet's own docstring for the scaling math. Desktop
 * needs no such scaling (spec §4 already locks it against an unscaled
 * canvas), so Desktop's CSS numbers match this table's directly. */
export interface SheetMountBox {
  leftPct: number;
  topPct: number;
  widthPct: number;
}

export const DEATH_NOTICE_INTEMPOREL_SHEET_MOUNT: Record<SkinVariant, { desktop: SheetMountBox; mobile: SheetMountBox }> = {
  light: {
    desktop: { leftPct: 16.81, topPct: 5.74, widthPct: 66.21 },
    mobile: { leftPct: 21.36, topPct: 10.71, widthPct: 56.43 },
  },
  dark: {
    desktop: { leftPct: 16.81, topPct: 5.74, widthPct: 66.21 },
    mobile: { leftPct: 19.66, topPct: 6.34, widthPct: 59.43 },
  },
};

/** Each cap's own natural pixel size, transcribed verbatim from this
 * pack's `manifest.json` — drives `.envelopeTop`/`.envelopeBottom`'s own
 * `aspect-ratio` (never stretched) and `.content`'s padding-top (exactly
 * matching `sheetTop`'s own rendered height, so the name never collides
 * with the baked rameau décoratif — see `DeathNoticeIntemporel.module.css`'s
 * own docstring). Desktop is identical Light/Dark; Mobile is not (Light
 * caps are 531px wide, Dark caps are 559px wide, both at the SAME cap
 * heights — 300/220/190 — per variant). */
export const DEATH_NOTICE_INTEMPOREL_CAP_DIMENSIONS_PX: Record<
  SkinVariant,
  {
    desktop: { top: readonly [number, number]; body: readonly [number, number]; bottom: readonly [number, number] };
    mobile: { top: readonly [number, number]; body: readonly [number, number]; bottom: readonly [number, number] };
  }
> = {
  light: {
    desktop: { top: [1107, 255], body: [1107, 192], bottom: [1107, 155] },
    mobile: { top: [531, 300], body: [531, 220], bottom: [531, 190] },
  },
  dark: {
    desktop: { top: [1107, 255], body: [1107, 192], bottom: [1107, 155] },
    mobile: { top: [559, 300], body: [559, 220], bottom: [559, 190] },
  },
};

/**
 * Typography tokens, transcribed verbatim from this pack's own
 * `04_TOKENS/typography.json` (`runtime_font_decision`: Cormorant
 * Garamond is the Studio's own locked runtime choice, spec §10 — the
 * approved references are flattened raster with no recoverable font
 * metadata, so this decision is the official one, not a developer
 * substitution).
 */
export const DEATH_NOTICE_INTEMPOREL_TYPOGRAPHY = {
  desktop: {
    eyebrow: { sizePx: 13, lineHeight: 1.2, letterSpacingEm: 0.24, weight: 500 },
    sectionTitle: { sizePx: 48, lineHeight: 1.0, weight: 500 },
    dates: { sizePx: 28, lineHeight: 1.0, letterSpacingEm: 0.06, weight: 400 },
    announcement: { sizePx: 22, lineHeight: 1.22, weight: 400 },
    detailLabel: { sizePx: 13, lineHeight: 1.2, letterSpacingEm: 0.22, weight: 600 },
    detailText: { sizePx: 17, lineHeight: 1.22, weight: 400 },
    quote: { sizePx: 17, lineHeight: 1.22, weight: 400 },
  },
  mobile: {
    eyebrow: { sizePx: 10, lineHeight: 1.2, letterSpacingEm: 0.22, weight: 500 },
    sectionTitle: { sizePx: 34, lineHeight: 1.0, weight: 500 },
    dates: { sizePx: 21, lineHeight: 1.0, letterSpacingEm: 0.05, weight: 400 },
    announcement: { sizePx: 17, lineHeight: 1.28, weight: 400 },
    detailLabel: { sizePx: 11, lineHeight: 1.2, letterSpacingEm: 0.2, weight: 600 },
    detailText: { sizePx: 15, lineHeight: 1.28, weight: 400 },
    quote: { sizePx: 15, lineHeight: 1.28, weight: 400 },
  },
  /**
   * The name's own sizing — spec §9.1/§9.2, this pack's `typography.json`
   * `name` entries for the "cas normal" (1–2 lines) clamp bounds, plus
   * the Mobile-only exceptional 3-line fallback the standalone spec v1.1
   * adds (§9.2 — not present in the v1.0 copy shipped inside the pack).
   * The QA matrix's own D-NAM row confirms the fallback is Mobile-only:
   * Desktop stays "max 2 lignes" always.
   */
  name: {
    desktop: { minPx: 48, maxPx: 72, lineHeight: 0.95, weight: 500, maxLinesNormal: 2 },
    mobile: {
      minPx: 38,
      maxPx: 50,
      lineHeight: 0.95,
      weight: 500,
      maxLinesNormal: 2,
      /** Spec §9.2's locked fallback — only entered when the name does
       * not wrap into `maxLinesNormal` lines at `minPx`. */
      fallback: { targetPx: 34, minPx: 32, lineHeight: 0.92, weight: 500, maxWidthPct: 88, maxLines: 3, marginBottomPx: 12 },
    },
  },
} as const;

/** Ink + surface tokens, transcribed verbatim from this pack's own
 * `04_TOKENS/colors.json`. Light and Dark each own their complete set —
 * never a CSS filter/inversion deriving one from the other (spec §11,
 * §15). */
export const DEATH_NOTICE_INTEMPOREL_COLORS: Record<
  SkinVariant,
  {
    stageBg: string;
    sheetBg: string;
    textPrimary: string;
    textSecondary: string;
    rule: string;
    olive: string;
    bronze: string;
    shadow: string;
  }
> = {
  light: {
    stageBg: "#F1E6D3",
    sheetBg: "#F5EBDD",
    textPrimary: "#292A22",
    textSecondary: "#5E5A4C",
    rule: "#948D7C",
    olive: "#5B6045",
    bronze: "#A36F3D",
    shadow: "rgba(73,52,34,0.20)",
  },
  dark: {
    stageBg: "#17140F",
    sheetBg: "#1C1C19",
    textPrimary: "#F1E5D5",
    textSecondary: "#D8C8B4",
    rule: "#A88D67",
    olive: "#62654A",
    bronze: "#C79A5D",
    shadow: "rgba(0,0,0,0.42)",
  },
};

/** Spacing scale, transcribed verbatim from `04_TOKENS/spacing.json`. */
export const DEATH_NOTICE_INTEMPOREL_SPACING = {
  xs: 8,
  sm: 12,
  md: 20,
  lg: 28,
  xl: 40,
  xxl: 56,
  xxxl: 72,
} as const;
