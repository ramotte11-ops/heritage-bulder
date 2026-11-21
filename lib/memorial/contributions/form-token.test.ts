import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import {
  issueFormToken,
  issuePhotoTicket,
  readFormTokenSecrets,
  verifyFormToken,
  verifyPhotoTicket,
  type FormTokenSecrets,
} from "./form-token";

/** Données synthétiques de test : aucune valeur réelle. */
const SECRETS: FormTokenSecrets = { current: "test-secret-0123456789abcdef0123456789", previous: null };
const SLUG = "0123456789abcdef";
const T0 = new Date("2026-11-20T10:00:00Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

describe("M8-E2 — jeton de formulaire (Q3)", () => {
  it("sans secret (ou trop court) : dépôt fermé", () => {
    expect(readFormTokenSecrets({})).toBeNull();
    expect(readFormTokenSecrets({ CONTRIBUTIONS_FORM_TOKEN_SECRET: "court" })).toBeNull();
    expect(readFormTokenSecrets({ CONTRIBUTIONS_FORM_TOKEN_SECRET: "x".repeat(32), CONTRIBUTIONS_FORM_TOKEN_SECRET_PREVIOUS: "y" })).toEqual({ current: "x".repeat(32), previous: null });
  });

  it("valide après 3 s, avec son nonce (clé d'idempotence)", () => {
    const token = issueFormToken(SECRETS, SLUG, T0, "11111111-1111-4111-8111-111111111111");
    expect(verifyFormToken(SECRETS, token, SLUG, at(3_000))).toEqual({ ok: true, nonce: "11111111-1111-4111-8111-111111111111" });
  });

  it("trop tôt (< 3 s) puis expiré (> 2 h)", () => {
    const token = issueFormToken(SECRETS, SLUG, T0);
    expect(verifyFormToken(SECRETS, token, SLUG, at(2_999))).toEqual({ ok: false, reason: "too_early" });
    expect(verifyFormToken(SECRETS, token, SLUG, at(2 * 3600_000 + 1))).toEqual({ ok: false, reason: "expired" });
  });

  it("lié à l'hommage : inutilisable sur un autre slug", () => {
    const token = issueFormToken(SECRETS, SLUG, T0);
    expect(verifyFormToken(SECRETS, token, "fedcba9876543210", at(5_000))).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("toute altération est refusée (date avancée, nonce changé, signature, forme)", () => {
    const token = issueFormToken(SECRETS, SLUG, T0, "11111111-1111-4111-8111-111111111111");
    const [v, , n, s] = token.split(".");
    expect(verifyFormToken(SECRETS, `${v}.${T0.getTime() - 60_000}.${n}.${s}`, SLUG, at(5_000))).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifyFormToken(SECRETS, `${v}.${T0.getTime()}.22222222-2222-4222-8222-222222222222.${s}`, SLUG, at(5_000))).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifyFormToken(SECRETS, token.slice(0, -2) + "AA", SLUG, at(5_000)).ok).toBe(false);
    for (const bad of [undefined, 3, "", "v1.x.y.z", "v2.1.11111111-1111-4111-8111-111111111111.sig", "a".repeat(300)]) {
      expect(verifyFormToken(SECRETS, bad, SLUG, at(5_000))).toEqual({ ok: false, reason: "malformed" });
    }
  });

  it("un jeton signé par un autre secret est refusé ; la rotation accepte l'ancien secret", () => {
    const other = { current: "another-secret-0123456789abcdef01234", previous: null };
    const token = issueFormToken(other, SLUG, T0);
    expect(verifyFormToken(SECRETS, token, SLUG, at(5_000))).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifyFormToken({ current: SECRETS.current, previous: other.current }, token, SLUG, at(5_000)).ok).toBe(true);
  });

  it("le ticket photo lie une réservation précise au jeton", () => {
    const nonce = "11111111-1111-4111-8111-111111111111";
    const ticket = issuePhotoTicket(SECRETS, SLUG, "m1", nonce);
    expect(verifyPhotoTicket(SECRETS, ticket, SLUG, "m1", nonce)).toBe(true);
    expect(verifyPhotoTicket(SECRETS, ticket, SLUG, "m2", nonce)).toBe(false);
    expect(verifyPhotoTicket(SECRETS, ticket, SLUG, "m1", "22222222-2222-4222-8222-222222222222")).toBe(false);
    expect(verifyPhotoTicket(SECRETS, 5, SLUG, "m1", nonce)).toBe(false);
  });
});
