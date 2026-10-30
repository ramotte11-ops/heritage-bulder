import type { NextConfig } from "next";

/**
 * Pages de développement : un fichier `page.dev.tsx` n'est une page que pour
 * `next dev`. Dans un build de production (`next build`, NODE_ENV =
 * "production"), l'extension `dev.tsx` n'est pas déclarée : le fichier n'est
 * ni compilé, ni routé, ni publié — l'URL n'existe pas sur le site.
 * Premier usage : le pilote des Offrandes symboliques (`/pilote/offrandes`).
 */
export const DEV_ONLY_PAGE_EXTENSION = "dev.tsx";

export function pageExtensionsFor(nodeEnv: string | undefined): string[] {
  const standard = ["tsx", "ts", "jsx", "js"];
  return nodeEnv === "production" ? standard : [DEV_ONLY_PAGE_EXTENSION, ...standard];
}

/**
 * Preview Server Netlify : Next.js 16 bloque en développement les requêtes
 * cross-origin vers ses ressources internes (`/_next/*`, HMR). Servi depuis
 * l'hôte Netlify, `next dev` refusait JS et HMR : écran blanc sur
 * `/pilote/builder-invite` (incident QG 004-G). Seul cet hôte exact est
 * autorisé — aucun joker, aucun `*.netlify.app`. Sans effet sur `next build`.
 */
export const NETLIFY_PREVIEW_DEV_ORIGIN = "devserver-main--hommages.netlify.app";

const nextConfig: NextConfig = {
  pageExtensions: pageExtensionsFor(process.env.NODE_ENV),
  allowedDevOrigins: [NETLIFY_PREVIEW_DEV_ORIGIN],
};

export default nextConfig;
