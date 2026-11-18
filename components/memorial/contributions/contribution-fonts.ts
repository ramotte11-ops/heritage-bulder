import { Allura } from "next/font/google";

/**
 * M5-A — police manuscrite des SIGNATURES des cartes (« Sophie », « Marie et
 * Pierre »). Aucune police calligraphique n'existait dans le dépôt : Allura
 * (Google Fonts, auto-hébergée par `next/font`) est la plus proche du tracé
 * des Masters parmi celles que `next/font` connaît. Choix à valider par la PO.
 */
export const contributionsSignatureScript = Allura({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-heritage-contributions-signature",
  display: "swap",
});
