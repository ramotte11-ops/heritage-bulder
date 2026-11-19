import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import {
  CONTRIBUTION_FORM_SECRET_MIN_BYTES,
  CONTRIBUTION_FORM_TOKEN_MAX_AGE_MS,
  CONTRIBUTION_FORM_TOKEN_MIN_AGE_MS,
} from "@/config/contributions";

/**
 * M8-E2 — Q3 : jeton anti-robots du formulaire de contribution.
 *
 * SERVER ONLY (node:crypto, secret). Jamais importé par un composant client.
 *
 * Émis à l'ouverture de la fenêtre de dépôt, il prouve trois choses au
 * moment de l'envoi, sans captcha (R4) ni empreinte d'adresse IP (R1) :
 *  - il a été émis par CE serveur, pour CET hommage (HMAC-SHA-256 sur le
 *    slug) ;
 *  - au moins 3 s se sont écoulées (un robot qui poste aussitôt échoue) ;
 *  - il a moins de 2 h.
 * Son `nonce` (UUID aléatoire) EST la clé d'idempotence du dépôt : un même
 * jeton rejoué ne produit jamais une deuxième contribution (la base
 * répond `duplicate`, unicité (memorial_id, idempotency_key)). C'est ce
 * qui le rend « à usage unique » sans table de jetons.
 *
 * Secret : CONTRIBUTIONS_FORM_TOKEN_SECRET (≥ 32 octets aléatoires), avec
 * CONTRIBUTIONS_FORM_TOKEN_SECRET_PREVIOUS facultatif pour une rotation
 * sans coupure. AUCUNE valeur n'est créée ni configurée ici : sans secret,
 * le dépôt est fermé (échec fermé), jamais ouvert sans protection.
 *
 * Le « ticket photo » lie en plus une réservation précise (mediaId) au
 * jeton : seul le navigateur qui a réservé peut finaliser cette photo.
 */

const VERSION = "v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export interface FormTokenSecrets {
  current: string;
  previous: string | null;
}

/** Lit les secrets depuis l'environnement serveur ; `null` = dépôt fermé. */
export function readFormTokenSecrets(env: Record<string, string | undefined> = process.env): FormTokenSecrets | null {
  const usable = (v: string | undefined) => (v !== undefined && Buffer.byteLength(v, "utf8") >= CONTRIBUTION_FORM_SECRET_MIN_BYTES ? v : null);
  const current = usable(env.CONTRIBUTIONS_FORM_TOKEN_SECRET);
  if (current === null) return null;
  return { current, previous: usable(env.CONTRIBUTIONS_FORM_TOKEN_SECRET_PREVIOUS) };
}

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("base64url");
}

function sameSignature(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

function verifiesWithAny(secrets: FormTokenSecrets, payload: string, signature: string): boolean {
  if (sameSignature(sign(secrets.current, payload), signature)) return true;
  return secrets.previous !== null && sameSignature(sign(secrets.previous, payload), signature);
}

export function issueFormToken(secrets: FormTokenSecrets, slug: string, now: Date, nonce: string = randomUUID()): string {
  const issuedAt = String(now.getTime());
  return `${VERSION}.${issuedAt}.${nonce}.${sign(secrets.current, `${VERSION}|form|${slug}|${issuedAt}|${nonce}`)}`;
}

export type FormTokenCheck =
  | { ok: true; nonce: string }
  | { ok: false; reason: "malformed" | "bad_signature" | "too_early" | "expired" };

export function verifyFormToken(secrets: FormTokenSecrets, token: unknown, slug: string, now: Date): FormTokenCheck {
  if (typeof token !== "string" || token.length > 256) return { ok: false, reason: "malformed" };
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION || !/^\d{1,15}$/.test(parts[1]) || !UUID.test(parts[2])) {
    return { ok: false, reason: "malformed" };
  }
  const [, issuedAt, nonce, signature] = parts;
  if (!verifiesWithAny(secrets, `${VERSION}|form|${slug}|${issuedAt}|${nonce}`, signature)) {
    return { ok: false, reason: "bad_signature" };
  }
  const age = now.getTime() - Number(issuedAt);
  if (age < CONTRIBUTION_FORM_TOKEN_MIN_AGE_MS) return { ok: false, reason: "too_early" };
  if (age > CONTRIBUTION_FORM_TOKEN_MAX_AGE_MS) return { ok: false, reason: "expired" };
  return { ok: true, nonce };
}

export function issuePhotoTicket(secrets: FormTokenSecrets, slug: string, mediaId: string, nonce: string): string {
  return sign(secrets.current, `${VERSION}|photo|${slug}|${mediaId}|${nonce}`);
}

export function verifyPhotoTicket(secrets: FormTokenSecrets, ticket: unknown, slug: string, mediaId: string, nonce: string): boolean {
  if (typeof ticket !== "string" || ticket.length > 128) return false;
  return verifiesWithAny(secrets, `${VERSION}|photo|${slug}|${mediaId}|${nonce}`, ticket);
}
