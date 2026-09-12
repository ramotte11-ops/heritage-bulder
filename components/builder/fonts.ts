import { Cormorant_Garamond, Inter, La_Belle_Aurore, Playfair_Display } from "next/font/google";

/**
 * Mission 023 — the two typefaces the Studio's T01 design specifies
 * ("05 — MINI FICHE UI T01"): Playfair Display (serif) for the
 * HERITAGE logo and the screen's own title, Inter (sans-serif) for
 * every secondary/body/control text.
 *
 * `next/font/google` self-hosts both at build time (no runtime request
 * to Google Fonts from a visitor's browser, no layout shift) — this is
 * the standard, already-idiomatic way to load a Google font in this
 * Next.js version; see the framework's own font docs.
 *
 * Deliberately NOT wired into the root layout
 * (`app/layout.tsx`, shared by every route including `/login`,
 * `/admin`, `/activate`, `/owner`): T01 is the first screen this
 * mission actually designs, and nothing in the brief asks for a global
 * typography change across routes this mission does not touch. Each
 * font's `.variable` is applied locally, inside
 * `components/builder/LanguageStep.module.css`'s own scope, via the
 * CSS custom property it exposes — everything outside that component
 * keeps its existing font stack unchanged.
 */
export const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-heritage-serif",
  display: "swap",
});

export const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-heritage-sans",
  display: "swap",
});

/**
 * Mission 035 — the two typefaces the Hero Intemporel handoff's own
 * `hero-master-tokens.json` specifies (`typography.displayedName`/
 * `contextLabel`/`dates`: Cormorant Garamond 500; `typography.shortPhrase`:
 * La Belle Aurore 400) and that no earlier mission had integrated yet.
 * Section 13's own rule: "si les fontes exactes ne sont pas déjà
 * intégrées, les intégrer proprement via le système Next existant" —
 * this is that integration, via the exact same `next/font/google`
 * mechanism `playfairDisplay`/`inter` above already use, never a
 * substituted look-alike. Scoped locally to `HeroIntemporel.module.css`
 * via each font's own `.variable`, exactly like every other font in
 * this file — nothing outside the Hero renderer's own scope changes.
 */
export const cormorantGaramond = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500"],
  variable: "--font-heritage-hero-serif",
  display: "swap",
});

export const laBelleAurore = La_Belle_Aurore({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-heritage-hero-script",
  display: "swap",
});
