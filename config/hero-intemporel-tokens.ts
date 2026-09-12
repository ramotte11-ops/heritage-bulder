/**
 * Mission 035 — the Hero Intemporel design tokens, transcribed verbatim
 * from the Studio handoff package's own source of truth
 * (`HANDOFF/hero-master-tokens.json`,
 * `HERITAGE_HERO_MISSION_035_INPUT_FINAL_QG.zip`, QG-validated). Every
 * number below is copied, not invented or re-measured from a screenshot
 * — "Claude assemble, Claude ne redessine pas" (the package's own
 * README_QG_FINAL.txt).
 *
 * This is `scope: "intemporel"` only (mission section 5) — a future
 * skin (musulman/juif/hindou/pet) gets its own token file the day it is
 * actually built, never a branch added to this one.
 *
 * Every `xPct`/`yPct`/`widthPct`/`heightPct` is a percentage of the
 * Hero's OWN container box (never the viewport, never a sub-box like
 * `collage` or `identity`) — the JSON's flat percentages are internally
 * consistent only under that one reading (e.g. `photo.desktop.xPct`
 * (16.0) sits inside `layout.desktop.collage.xPct` (2.0) plus some
 * margin, which only holds if both share the same coordinate space).
 * `HeroIntemporel.tsx` is the one place these are turned into CSS.
 */

export const HERO_INTEMPOREL_BREAKPOINT_DESKTOP_PX = 960;

export const HERO_INTEMPOREL_PHOTO = {
  desktop: { xPct: 16.0, yPct: 18.4, widthPct: 28.5 },
  mobile: { xPct: 27.0, yPct: 10.8, widthPct: 46.0 },
} as const;

export const HERO_INTEMPOREL_FRAME = {
  desktop: { xPct: 13.6, yPct: 14.2, widthPct: 32.2, rotationDeg: -3.2 },
  mobile: { xPct: 22.0, yPct: 8.2, widthPct: 56.0, rotationDeg: -2.8 },
} as const;

export const HERO_INTEMPOREL_LAYOUT = {
  desktop: {
    collage: { xPct: 2.0, yPct: 10.5, widthPct: 47.0, heightPct: 77.0 },
    identity: { xPct: 51.5, yPct: 23.5, widthPct: 33.5, heightPct: 56.0 },
    seal: { centerXPct: 90.5, centerYPct: 66.0, widthPct: 8.3 },
  },
  mobile: {
    collage: { xPct: 6.0, yPct: 6.5, widthPct: 82.0, heightPct: 46.0 },
    identity: { xPct: 12.0, yPct: 54.5, widthPct: 76.0, heightPct: 38.0 },
    seal: { centerXPct: 83.5, centerYPct: 87.5, widthPct: 14.5 },
  },
} as const;

export const HERO_INTEMPOREL_TYPOGRAPHY = {
  displayedName: {
    desktopPx: 86,
    mobilePx: 72,
    lineHeight: 0.95,
    letterSpacingEm: -0.02,
  },
  contextLabel: {
    desktopPx: 15,
    mobilePx: 13,
    lineHeight: 1.2,
    letterSpacingEm: 0.34,
    uppercase: true,
  },
  dates: {
    desktopPx: 30,
    mobilePx: 28,
    lineHeight: 1.1,
    letterSpacingEm: 0.04,
  },
  shortPhrase: {
    desktopPx: 42,
    mobilePx: 42,
    lineHeight: 1.15,
    letterSpacingEm: 0.0,
    minPx: 34,
  },
} as const;

export const HERO_INTEMPOREL_COLORS = {
  light: {
    bg: "#F2E9DC",
    paperMain: "#F6F0E6",
    paperSecondary: "#E4D6C1",
    accent: "#6F7255",
    inkPrimary: "#3D3A2B",
    inkSecondary: "#6B6256",
    metal: "#A47B48",
    line: "#91866A",
    shadow: "rgba(56,44,32,0.18)",
  },
  dark: {
    bg: "#25231D",
    paperMain: "#2E2A23",
    paperSecondary: "#3A342A",
    accent: "#707052",
    inkPrimary: "#F0E1CD",
    inkSecondary: "#C8B8A4",
    metal: "#B1874D",
    line: "#C09961",
    shadow: "rgba(0,0,0,0.36)",
  },
} as const;

/**
 * Mission 035 section 14 — the exact z-index doctrine the mission brief
 * itself hands down (and the handoff JSON's own `zIndex` block mirrors
 * verbatim): never reordered to "fix" a composition problem.
 */
export const HERO_INTEMPOREL_Z = {
  background: 0,
  paperDepth: 10,
  postcard: 20,
  accentPaper: 30,
  intermediatePaper: 40,
  familyPhoto: 50,
  photoFrame: 60,
  paperclip: 70,
  botanical: 80,
  decorativeNotes: 90,
  identity: 100,
  ornaments: 110,
  seal: 120,
  ui: 200,
} as const;
