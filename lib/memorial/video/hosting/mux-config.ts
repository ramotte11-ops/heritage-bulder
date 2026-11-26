/**
 * SERVER ONLY. VID-07 — configuration de l'hébergement vidéo (Mux).
 *
 * Même discipline que la configuration du canal de vente : rien ne s'exécute à
 * l'import, et l'application fonctionne avec TOUT cela absent. Tant que la
 * configuration n'est pas complète ET explicitement activée
 * (`HERITAGE_VIDEO_HOSTING=enabled`), l'hébergement est indisponible : le
 * formulaire A16 reste en préparation locale, exactement comme VID-06.
 *
 * Aucun de ces noms n'est préfixé `NEXT_PUBLIC_`, et aucun ne doit l'être :
 * ce module n'est jamais importé par un composant client
 * (lib/entitlement/server-only-boundary.test.ts). Aucune valeur n'est
 * jamais journalisée ni renvoyée : seuls les NOMS manquants le sont.
 *
 *   HERITAGE_VIDEO_HOSTING      interrupteur explicite : « enabled »
 *   MUX_TOKEN_ID / MUX_TOKEN_SECRET
 *                               jeton d'API « Mux Video » (lecture + écriture)
 *   MUX_WEBHOOK_SECRET          secret de signature du point de notification
 *   MUX_SIGNING_KEY_ID          identifiant de la clé de lecture signée
 *   MUX_SIGNING_KEY_PRIVATE     clé privée RSA de lecture signée (PEM en base64)
 *   NEXT_PUBLIC_SITE_URL        origine du site (CORS des envois directs) — non secrète
 *   HERITAGE_VIDEO_DEPLOY_ORIGINS  (VID-10, facultatif) « enabled » : accepte
 *                               aussi l'envoi depuis l'adresse permanente d'un
 *                               déploiement du MÊME site
 *                               (`https://<id>--<hôte du site>`), pour la recette
 *                               sur un déploiement non publié. Non secrète.
 */

export interface MuxHostingConfig {
  apiTokenId: string;
  apiTokenSecret: string;
  webhookSecret: string;
  signingKeyId: string;
  /** Clé privée PEM, déjà décodée du base64. */
  signingPrivateKeyPem: string;
  /** Origine autorisée pour l'envoi direct depuis le navigateur. */
  corsOrigin: string;
  /** VID-10 — accepter aussi les adresses permanentes de déploiement du même site. */
  allowDeployOrigins: boolean;
}

export type MuxHostingConfigRead =
  | { status: "configured"; config: MuxHostingConfig }
  | { status: "disabled" }
  | { status: "incomplete"; missing: readonly string[] };

const REQUIRED = ["MUX_TOKEN_ID", "MUX_TOKEN_SECRET", "MUX_WEBHOOK_SECRET", "MUX_SIGNING_KEY_ID", "MUX_SIGNING_KEY_PRIVATE", "NEXT_PUBLIC_SITE_URL"] as const;

type Env = Readonly<Record<string, string | undefined>>;

export function readMuxHostingConfig(env: Env = process.env): MuxHostingConfigRead {
  if (env.HERITAGE_VIDEO_HOSTING !== "enabled") return { status: "disabled" };
  const missing = REQUIRED.filter((name) => !env[name]);
  if (missing.length > 0) return { status: "incomplete", missing };
  let pem: string;
  let origin: string;
  try {
    pem = Buffer.from(env.MUX_SIGNING_KEY_PRIVATE!, "base64").toString("utf8");
    origin = new URL(env.NEXT_PUBLIC_SITE_URL!).origin;
  } catch {
    return { status: "incomplete", missing: ["MUX_SIGNING_KEY_PRIVATE", "NEXT_PUBLIC_SITE_URL"] };
  }
  if (!pem.includes("PRIVATE KEY")) return { status: "incomplete", missing: ["MUX_SIGNING_KEY_PRIVATE"] };
  return {
    status: "configured",
    config: {
      apiTokenId: env.MUX_TOKEN_ID!,
      apiTokenSecret: env.MUX_TOKEN_SECRET!,
      webhookSecret: env.MUX_WEBHOOK_SECRET!,
      signingKeyId: env.MUX_SIGNING_KEY_ID!,
      signingPrivateKeyPem: pem,
      corsOrigin: origin,
      allowDeployOrigins: env.HERITAGE_VIDEO_DEPLOY_ORIGINS === "enabled",
    },
  };
}

/**
 * VID-10 — l'origine à déclarer à Mux pour UN envoi direct : celle du site, ou,
 * si la recette sur déploiement non publié est explicitement permise,
 * l'adresse permanente d'un déploiement du même site (`https://<id>--<hôte>`,
 * hôte identique, HTTPS, sans port). Toute autre origine (autre site,
 * sous-domaine arbitraire, en-tête absent ou illisible) retombe sur l'origine
 * du site : l'envoi échouera alors dans le navigateur, sans rien ouvrir.
 */
export function resolveUploadOrigin(config: Pick<MuxHostingConfig, "corsOrigin" | "allowDeployOrigins">, requestOrigin: string | null | undefined): string {
  if (!requestOrigin || !config.allowDeployOrigins) return config.corsOrigin;
  let request: URL;
  let site: URL;
  try {
    request = new URL(requestOrigin);
    site = new URL(config.corsOrigin);
  } catch {
    return config.corsOrigin;
  }
  if (request.origin === site.origin) return site.origin;
  const prefix = request.hostname.slice(0, -(`--${site.hostname}`.length));
  const isDeployOfSameSite =
    request.protocol === "https:" &&
    request.port === "" &&
    request.hostname.endsWith(`--${site.hostname}`) &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(prefix) &&
    !prefix.includes("--");
  return isDeployOfSameSite ? request.origin : site.origin;
}
