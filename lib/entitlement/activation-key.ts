import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Mission 013 — the HERITAGE activation key.
 *
 * A key is a temporary secret that lets someone FIND the right they
 * bought, before they have activated it. It is not an identity, not a
 * password, not a session, and not `entitlement.id`. Once the right is
 * redeemed, normal access is Supabase Auth -> Owner -> Memorial and the
 * key grants nothing (see redeem-with-activation-key.ts).
 *
 * The raw key exists in memory exactly twice in its life: at generation,
 * and when someone presents it. It is never persisted, logged, or put in
 * an error — only `sha256(canonical)` is stored.
 *
 * ## Why SHA-256 and not bcrypt/Argon2
 *
 * Password hashing exists to slow the brute force of LOW-entropy,
 * human-chosen secrets. A 160-bit CSPRNG key is not brute-forceable at
 * any hash speed, so a work factor buys nothing here — while its salt
 * would make the hash non-deterministic and destroy the indexed exact
 * lookup this whole design needs. No pepper either: at 160 bits it adds
 * nothing measurable and introduces a secret whose loss would brick
 * every unredeemed key. Everything below uses only `node:crypto`.
 */

/** Crockford base32: no I, L, O or U. Chosen over base64url because a
 * key may be read off a printed card by a grieving family — the excluded
 * letters are exactly the ones people mistype. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** 20 bytes = 160 bits = exactly 32 base32 characters, no padding. */
const KEY_BYTES = 20;
const PAYLOAD_LENGTH = 32;

/** The only version this build issues and accepts. A future HH2 is
 * rejected explicitly rather than silently parsed as HH1. */
const CURRENT_VERSION = "HH1";
const SUPPORTED_VERSIONS = new Set([CURRENT_VERSION]);

/** Groups of 8, purely for legibility when transcribing. */
const DISPLAY_GROUP = 8;

export interface ActivationKey {
  /** e.g. "HH1". Deliberately carried through to hashing — see
   * `canonicalHashInput`. */
  version: string;
  /** The 32 normalised Crockford characters, uppercase, no separators. */
  payload: string;
}

export type ParseActivationKeyResult =
  | { ok: true; key: ActivationKey }
  | { ok: false; reason: ActivationKeyRejection };

export type ActivationKeyRejection =
  | "empty"
  | "missingPrefix"
  | "unsupportedVersion"
  | "internalWhitespace"
  | "invalidCharacter"
  | "invalidLength";

function encodeCrockford(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  // 160 bits is an exact multiple of 5, so nothing is ever left over —
  // handled anyway so the encoder stays correct if KEY_BYTES changes.
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];

  return out;
}

/** The canonical display form: `HH1-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX`. */
export function formatActivationKey({ version, payload }: ActivationKey): string {
  const groups: string[] = [];
  for (let index = 0; index < payload.length; index += DISPLAY_GROUP) {
    groups.push(payload.slice(index, index + DISPLAY_GROUP));
  }
  return `${version}-${groups.join("-")}`;
}

/**
 * Generates one key from the CSPRNG. Returns the raw key (to be shown to
 * a human exactly once, by the server that asked) alongside the hash —
 * the only half that may ever be persisted.
 */
export function generateActivationKey(): { rawKey: string; key: ActivationKey; hash: string } {
  const key: ActivationKey = {
    version: CURRENT_VERSION,
    payload: encodeCrockford(randomBytes(KEY_BYTES)),
  };

  return { rawKey: formatActivationKey(key), key, hash: hashActivationKey(key) };
}

/**
 * Strict parser. Normalisation exists to forgive a human transcribing a
 * printed key — not to turn an arbitrary string into a plausible key, so
 * every relaxation below is deliberate and bounded:
 *
 * - outer whitespace is trimmed; INTERNAL whitespace is rejected;
 * - case is irrelevant (uppercased first);
 * - `-` separators inside the payload are free-form and removed, because
 *   people regroup digits when copying;
 * - Crockford's transcription mapping applies: I/L -> 1, O -> 0. `U` has
 *   no mapping and is simply not in the alphabet, so it is rejected;
 * - the prefix is MANDATORY and its version must be one this build
 *   supports;
 * - the payload must be exactly 32 characters after all of the above.
 */
export function parseActivationKey(rawKey: string): ParseActivationKeyResult {
  const trimmed = rawKey.trim();
  if (trimmed.length === 0) return { ok: false, reason: "empty" };
  if (/\s/.test(trimmed)) return { ok: false, reason: "internalWhitespace" };

  const upper = trimmed.toUpperCase();

  const prefixMatch = /^(HH[0-9]+)-(.*)$/.exec(upper);
  if (!prefixMatch) return { ok: false, reason: "missingPrefix" };

  const [, version, rest] = prefixMatch;
  if (!SUPPORTED_VERSIONS.has(version)) return { ok: false, reason: "unsupportedVersion" };

  // Separators are a transcription aid, never data.
  const withoutSeparators = rest.replaceAll("-", "");

  // Crockford's own confusable mapping, applied before alphabet
  // validation so a transcribed "I" becomes a legitimate "1".
  const payload = withoutSeparators.replaceAll(/[IL]/g, "1").replaceAll("O", "0");

  for (const character of payload) {
    if (!ALPHABET.includes(character)) return { ok: false, reason: "invalidCharacter" };
  }
  if (payload.length !== PAYLOAD_LENGTH) return { ok: false, reason: "invalidLength" };

  return { ok: true, key: { version, payload } };
}

/**
 * What actually gets hashed. The version is part of it on purpose: the
 * same 32 characters under a future HH2 must NOT resolve to the same
 * right as under HH1, or a format migration would silently make old and
 * new keys interchangeable.
 */
export function canonicalHashInput({ version, payload }: ActivationKey): string {
  return `${version}:${payload}`;
}

/** sha256 of the canonical input, lowercase hex — the only representation
 * of a key that may ever reach the database. */
export function hashActivationKey(key: ActivationKey): string {
  return createHash("sha256").update(canonicalHashInput(key), "utf8").digest("hex");
}

/** Constant-time comparison of two hashes. Not strictly required (the
 * lookup is done BY hash, so no secret-dependent comparison happens in
 * this process), but the one place a caller might compare two hashes
 * directly should not introduce a timing signal. */
export function activationKeyHashEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}
