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

/**
 * QG 007 — le Builder invité peut être ouvert depuis le téléphone de la PO
 * sur le même réseau privé. L'adresse vient de `.env.local`, car le DHCP peut
 * la changer ; seules les IPv4 privées exactes sont acceptées. Aucun joker,
 * schéma, port ou hôte Internet ne peut donc élargir l'accès par accident.
 */
export function privateLanDevOrigin(value: string | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate) return null;

  const octets = candidate.split(".");
  const privateIpv4 = octets.length === 4 && octets.every((octet) => {
    if (!/^\d{1,3}$/.test(octet)) return false;
    const number = Number(octet);
    return number >= 0 && number <= 255 && String(number) === octet;
  });
  if (!privateIpv4) {
    throw new Error("HERITAGE_LAN_DEV_ORIGIN must be one exact private IPv4 address without scheme or port.");
  }

  const [first, second] = octets.map(Number);
  const isPrivate = first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
  if (!isPrivate) {
    throw new Error("HERITAGE_LAN_DEV_ORIGIN must be one exact private IPv4 address without scheme or port.");
  }
  return candidate;
}

export function allowedDevOriginsFor(nodeEnv: string | undefined, lanOrigin: string | undefined): string[] {
  const origins = [NETLIFY_PREVIEW_DEV_ORIGIN];
  if (nodeEnv !== "production") {
    const privateOrigin = privateLanDevOrigin(lanOrigin);
    if (privateOrigin !== null) origins.push(privateOrigin);
  }
  return origins;
}

const nextConfig: NextConfig = {
  pageExtensions: pageExtensionsFor(process.env.NODE_ENV),
  allowedDevOrigins: allowedDevOriginsFor(process.env.NODE_ENV, process.env.HERITAGE_LAN_DEV_ORIGIN),
};

export default nextConfig;
