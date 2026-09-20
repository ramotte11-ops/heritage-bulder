import type { SkinVariant } from "@/config/skins";

/**
 * Mission 040B — the Ceremony ("Cérémonie") Intemporel RUNTIME tokens,
 * Studio pack `CEREMONIE_RUNTIME_STUDIO_QG_CANDIDATE_V3_CORRECTED`
 * (STATUT: GREEN QG). Every value below is transcribed verbatim from
 * that package's own `spec/geometry.json` and `spec/runtime-tokens.json`
 * — nothing here is eyeballed, interpolated, or redrawn. The package's
 * own `spec/VALIDATION.json` confirms the master dimensions and the
 * "no A03 nomenclature" rule this file also respects (this is the
 * Ceremony's OWN scene, entirely separate from A03's Death Notice one —
 * see `config/death-notice-intemporel-tokens.ts` for that unrelated
 * package).
 *
 * ## Single fixed scene per variant (unlike A03's dynamic N-tiling)
 *
 * A03's Death Notice pack uses a SCENE TOP + SCENE MIDDLE×N + SCENE
 * BOTTOM architecture because its content can grow arbitrarily tall.
 * Ceremony's pack is architecturally simpler — `architecture:
 * "single_scene_per_variant"` in `geometry.json` itself — one fixed
 * master per skinVariant × breakpoint (mirrors Hero's own
 * `config/hero-intemporel-tokens.ts` pattern: one master image, content
 * zones positioned as percentage boxes derived from this file's own
 * pixel geometry divided by the canonical canvas size).
 *
 * ## Assets already bake their own circular fill (icons) and rule/sprig
 * composition (closing)
 *
 * `assets/light|dark/icon-*.png` are 128×128 PNGs with the icon's own
 * circular background ALREADY painted in by Studio — `runtime-tokens.json`'s
 * `iconCircleFill` is informational only (it documents what color Studio
 * used inside the asset), never a second circle this runtime draws
 * behind the icon: doing so would duplicate/conflict with pixels the
 * asset already carries (mission brief: "aucune icône dessinée dans le
 * code"). Similarly, `closing-heart-sprig.png` is ONE asset containing
 * the rule–heart–rule row AND the sprig below it as a single composition
 * — never two separate pieces assembled by this runtime.
 *
 * ## Sizing without distortion
 *
 * Every zone below whose native asset ratio does not exactly match its
 * geometry box (`titleSprig`/`closingFull`/`closingNoPractical`) is
 * rendered by WIDTH only (`width: <box-width>%; height: auto`) — the
 * exact same intrinsic-ratio technique `DeathNoticeIntemporel.tsx`'s own
 * scene images and `HeroIntemporel.tsx`'s own masters already use, so no
 * asset is ever stretched or squashed to force an exact box height. The
 * icon assets (128×128, square) and the two rule assets
 * (`separator-horizontal.png`/`separator-vertical.png`, genuinely
 * elongated line art whose entire purpose is to be resized to whatever
 * rule length the content needs) are the only zones sized by BOTH
 * dimensions, since a rule asset stretched along its own long axis is
 * not a distortion of its subject — it is what a rule graphic is for.
 *
 * ## Mobile "canonical scene, uniform scale" rule
 *
 * `geometry.json`'s own `mobile.viewportRule`: render the canonical
 * 941px scene, then scale UNIFORMLY to the real viewport width
 * (375/390/414/430...). This falls out for free from the same technique
 * every zone here already uses (`leftPct`/`topPct`/`widthPct`/`heightPct`,
 * all relative to the 941×1672 canonical canvas): a wrapper rendered at
 * `width: 100%` with the mobile master's own intrinsic 941:1672 ratio
 * (`aspect-ratio` in the component's own stylesheet) scales every
 * percentage-positioned child uniformly with it — no separate "which
 * exact phone width" branch anywhere in this file or the component.
 */

export const CEREMONY_INTEMPOREL_BREAKPOINT_DESKTOP_PX = 960;

export const CEREMONY_INTEMPOREL_CANONICAL_DIMENSIONS = {
  desktop: { width: 1448, height: 1086 },
  mobile: { width: 941, height: 1672 },
} as const;

const ASSET_ROOT = "/assets/ceremony/intemporel/runtime";

export const CEREMONY_INTEMPOREL_MASTER_SRC: Record<SkinVariant, { desktop: string; mobile: string }> = {
  light: {
    desktop: `${ASSET_ROOT}/light/ceremonie-master-desktop-light.png`,
    mobile: `${ASSET_ROOT}/light/ceremonie-master-mobile-light.png`,
  },
  dark: {
    desktop: `${ASSET_ROOT}/dark/ceremonie-master-desktop-dark.png`,
    mobile: `${ASSET_ROOT}/dark/ceremonie-master-mobile-dark.png`,
  },
};

/** The 7 small graphic assets (icons, rules, sprigs), each in its own
 * Light/Dark declination — copied byte-for-byte (SHA-256 verified
 * against the Studio package's own MANIFEST.json) into `public/`. */
export const CEREMONY_INTEMPOREL_ASSET_SRC: Record<
  SkinVariant,
  {
    iconCalendar: string;
    iconLocation: string;
    iconInfo: string;
    separatorHorizontal: string;
    separatorVertical: string;
    titleSprig: string;
    closingHeartSprig: string;
  }
> = {
  light: {
    iconCalendar: `${ASSET_ROOT}/light/icon-calendar.png`,
    iconLocation: `${ASSET_ROOT}/light/icon-location.png`,
    iconInfo: `${ASSET_ROOT}/light/icon-info.png`,
    separatorHorizontal: `${ASSET_ROOT}/light/separator-horizontal.png`,
    separatorVertical: `${ASSET_ROOT}/light/separator-vertical.png`,
    titleSprig: `${ASSET_ROOT}/light/title-sprig.png`,
    closingHeartSprig: `${ASSET_ROOT}/light/closing-heart-sprig.png`,
  },
  dark: {
    iconCalendar: `${ASSET_ROOT}/dark/icon-calendar.png`,
    iconLocation: `${ASSET_ROOT}/dark/icon-location.png`,
    iconInfo: `${ASSET_ROOT}/dark/icon-info.png`,
    separatorHorizontal: `${ASSET_ROOT}/dark/separator-horizontal.png`,
    separatorVertical: `${ASSET_ROOT}/dark/separator-vertical.png`,
    titleSprig: `${ASSET_ROOT}/dark/title-sprig.png`,
    closingHeartSprig: `${ASSET_ROOT}/dark/closing-heart-sprig.png`,
  },
};

export interface CeremonyPxBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CeremonyRuleLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface CeremonyIconCenter {
  cx: number;
  cy: number;
}

/** `spec/geometry.json`'s `desktop` block, verbatim (1448×1086 canvas). */
export interface CeremonyDesktopGeometry {
  title: CeremonyPxBox;
  dateTime: CeremonyPxBox;
  placeAddress: CeremonyPxBox;
  practicalInfo: CeremonyPxBox;
  closingFull: CeremonyPxBox;
  closingNoPractical: CeremonyPxBox;
  ruleTop: CeremonyRuleLine;
  ruleMid: CeremonyRuleLine;
  ruleBottomFull: CeremonyRuleLine;
  iconDate: CeremonyIconCenter;
  iconPlace: CeremonyIconCenter;
  iconPractical: CeremonyIconCenter;
  titleSprig: CeremonyPxBox;
  verticalSeparator: CeremonyPxBox;
}

/** `spec/geometry.json`'s `mobile` block, verbatim (941×1672 canvas). No
 * `verticalSeparator` — mobile is single-column (stacked), matching
 * every mobile QA reference. */
export interface CeremonyMobileGeometry {
  title: CeremonyPxBox;
  dateTime: CeremonyPxBox;
  placeAddress: CeremonyPxBox;
  practicalInfo: CeremonyPxBox;
  closingFull: CeremonyPxBox;
  closingNoPractical: CeremonyPxBox;
  ruleDate: CeremonyRuleLine;
  rulePlace: CeremonyRuleLine;
  rulePracticalFull: CeremonyRuleLine;
  iconDate: CeremonyIconCenter;
  iconPlace: CeremonyIconCenter;
  iconPractical: CeremonyIconCenter;
  titleSprig: CeremonyPxBox;
}

export const CEREMONY_INTEMPOREL_GEOMETRY: { desktop: CeremonyDesktopGeometry; mobile: CeremonyMobileGeometry } = {
  desktop: {
    title: { x: 330, y: 150, w: 788, h: 95 },
    dateTime: { x: 335, y: 350, w: 340, h: 190 },
    placeAddress: { x: 780, y: 350, w: 340, h: 190 },
    practicalInfo: { x: 335, y: 590, w: 785, h: 235 },
    closingFull: { x: 440, y: 865, w: 570, h: 130 },
    closingNoPractical: { x: 440, y: 650, w: 570, h: 130 },
    ruleTop: { x1: 335, y1: 330, x2: 1120, y2: 330 },
    ruleMid: { x1: 335, y1: 560, x2: 1120, y2: 560 },
    ruleBottomFull: { x1: 335, y1: 840, x2: 1120, y2: 840 },
    iconDate: { cx: 285, cy: 405 },
    iconPlace: { cx: 730, cy: 405 },
    iconPractical: { cx: 285, cy: 650 },
    titleSprig: { x: 594, y: 242, w: 260, h: 95 },
    verticalSeparator: { x: 718, y: 347, w: 12, h: 195 },
  },
  mobile: {
    title: { x: 155, y: 160, w: 631, h: 110 },
    dateTime: { x: 245, y: 360, w: 520, h: 190 },
    placeAddress: { x: 245, y: 610, w: 520, h: 230 },
    practicalInfo: { x: 245, y: 900, w: 520, h: 300 },
    closingFull: { x: 205, y: 1320, w: 530, h: 150 },
    closingNoPractical: { x: 205, y: 1010, w: 530, h: 150 },
    ruleDate: { x1: 205, y1: 570, x2: 735, y2: 570 },
    rulePlace: { x1: 205, y1: 860, x2: 735, y2: 860 },
    rulePracticalFull: { x1: 205, y1: 1240, x2: 735, y2: 1240 },
    iconDate: { cx: 190, cy: 410 },
    iconPlace: { cx: 190, cy: 665 },
    iconPractical: { cx: 190, cy: 955 },
    titleSprig: { x: 320, y: 270, w: 300, h: 110 },
  },
};

/**
 * `spec/geometry.json`'s own `states` block: which closing zone applies,
 * and whether the practical-info rule (`ruleBottomFull` desktop /
 * `rulePracticalFull` mobile — the ONE rule that only makes sense
 * bordering practical info, which itself is absent in this state) is
 * shown. `ruleTop`/`ruleMid` (desktop) and `ruleDate`/`rulePlace`
 * (mobile) render in BOTH states — verified against the QA references
 * (`qa/desktop-light-no-practical.png` keeps the rule right below the
 * Date/Heure + Lieu row; only the rule further down, bordering the now-
 * absent practical block, disappears) — `reserveBlankSpace: false` means
 * no empty gap is reserved where practicalInfo would have sat.
 */
export const CEREMONY_INTEMPOREL_STATES = {
  FULL: { practicalVisible: true, closing: "closingFull" as const },
  NO_PRACTICAL_INFO: { practicalVisible: false, closing: "closingNoPractical" as const },
};

export type CeremonySceneState = keyof typeof CEREMONY_INTEMPOREL_STATES;

/** `spec/runtime-tokens.json`'s `light`/`dark` ink tokens, verbatim.
 * `iconCircleFill` is kept here only as a documented, unused reference
 * (see this file's own top docstring — the fill is already baked into
 * the icon PNGs). */
export const CEREMONY_INTEMPOREL_INK = {
  light: {
    textPrimary: "#373226",
    textSecondary: "#514A3B",
    rule: "#968E79",
    icon: "#3F3A2D",
    iconCircleFill: "#EEE7DA",
  },
  dark: {
    textPrimary: "#F1E5D2",
    textSecondary: "#D7C7AC",
    rule: "#A88654",
    icon: "#E7B96F",
    iconCircleFill: "#3A3024",
  },
} satisfies Record<SkinVariant, Record<string, string>>;

export interface CeremonyTextRoleTokens {
  fontSizePx: number;
  fontWeight: number;
  lineHeight: number;
  letterSpacingEm: number;
  align: "left" | "center";
  maxLines: number;
}

export interface CeremonyFormatTypography {
  title: CeremonyTextRoleTokens;
  label: CeremonyTextRoleTokens;
  primary: CeremonyTextRoleTokens;
  secondary: CeremonyTextRoleTokens;
  practical: CeremonyTextRoleTokens;
  iconSizePx: number;
  iconCircleSizePx: number;
  ruleStrokePx: number;
}

/** `spec/runtime-tokens.json`'s `desktop`/`mobile` typography blocks,
 * verbatim (camelCase field names collapsed 1:1 from the JSON's own
 * `fontSize`/`fontWeight`/`lineHeight`/`letterSpacingEm`/`align`/
 * `maxLines`). */
export const CEREMONY_INTEMPOREL_TYPOGRAPHY: { desktop: CeremonyFormatTypography; mobile: CeremonyFormatTypography } = {
  desktop: {
    title: { fontSizePx: 72, fontWeight: 400, lineHeight: 1.0, letterSpacingEm: 0.0, align: "center", maxLines: 1 },
    label: { fontSizePx: 21, fontWeight: 400, lineHeight: 1.15, letterSpacingEm: 0.18, align: "left", maxLines: 1 },
    primary: { fontSizePx: 34, fontWeight: 400, lineHeight: 1.06, letterSpacingEm: 0.0, align: "left", maxLines: 2 },
    secondary: { fontSizePx: 26, fontWeight: 400, lineHeight: 1.12, letterSpacingEm: 0.0, align: "left", maxLines: 3 },
    practical: { fontSizePx: 25, fontWeight: 400, lineHeight: 1.18, letterSpacingEm: 0.0, align: "left", maxLines: 5 },
    iconSizePx: 54,
    iconCircleSizePx: 82,
    ruleStrokePx: 2,
  },
  mobile: {
    title: { fontSizePx: 58, fontWeight: 400, lineHeight: 1.0, letterSpacingEm: 0.0, align: "center", maxLines: 1 },
    label: { fontSizePx: 19, fontWeight: 400, lineHeight: 1.12, letterSpacingEm: 0.15, align: "left", maxLines: 1 },
    primary: { fontSizePx: 31, fontWeight: 400, lineHeight: 1.08, letterSpacingEm: 0.0, align: "left", maxLines: 2 },
    secondary: { fontSizePx: 24, fontWeight: 400, lineHeight: 1.12, letterSpacingEm: 0.0, align: "left", maxLines: 4 },
    practical: { fontSizePx: 23, fontWeight: 400, lineHeight: 1.17, letterSpacingEm: 0.0, align: "left", maxLines: 6 },
    iconSizePx: 48,
    iconCircleSizePx: 74,
    ruleStrokePx: 2,
  },
};

/**
 * `spec/runtime-tokens.json`'s own `overflow` block, verbatim. Applies
 * ONLY to `primary`/`secondary`/`practical` (family-authored, variable-
 * length content) — never to `title`/`label`, which are short, fixed,
 * HERITAGE-authored i18n strings this runtime does not treat as
 * overflow-prone (mirrors `DeathNoticeIntemporel.tsx`'s own precision
 * LABELS, which never get the shrink treatment its family-authored TEXT
 * does).
 */
export const CEREMONY_INTEMPOREL_OVERFLOW = {
  wrap: "word" as const,
  hyphenation: false,
  shrinkableRoles: ["primary", "secondary", "practical"] as const,
  minScale: 0.88,
  clip: false,
  ellipsis: false,
} as const;

export type CeremonyShrinkableRole = (typeof CEREMONY_INTEMPOREL_OVERFLOW.shrinkableRoles)[number];
