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

const nextConfig: NextConfig = {
  pageExtensions: pageExtensionsFor(process.env.NODE_ENV),
};

export default nextConfig;
