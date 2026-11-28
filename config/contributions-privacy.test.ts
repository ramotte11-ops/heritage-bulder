import { describe, expect, it } from "vitest";
import { DICTIONARIES } from "@/lib/i18n/translate";
import { CONTRIBUTIONS_DEPOSIT_PUBLIC_READY, CONTRIBUTIONS_DEPOSIT_RECETTE } from "./contributions-deposit-readiness";
import {
  CONTRIBUTIONS_PRIVACY_LEGAL_STATUS,
  CONTRIBUTIONS_WITHDRAWAL_CONTACT,
  PRIVACY_KEYS,
  PRIVACY_MENTION_KEYS,
  PRIVACY_PENDING_MARKERS,
  privacyPublicationBlockers,
  privacySegments,
  privacyText,
  withdrawalContactLabel,
  withdrawalMailto,
} from "./contributions-privacy";

/** M8-Q6 — textes de confidentialité : complétude, contact unique, aucun marqueur publié. */

const LANGS = ["fr", "en", "es"] as const;
const dict = (lang: (typeof LANGS)[number]) => DICTIONARIES[lang] as unknown as Record<string, string>;

describe("M8-Q6 — textes de confidentialité (PROPOSITION)", () => {
  it("complétude : chaque clé Q6 existe et n'est pas vide dans les trois langues (sans repli sur l'anglais)", () => {
    for (const lang of LANGS) for (const key of PRIVACY_KEYS) expect(dict(lang)[key]?.trim(), `${lang} ${key}`).toBeTruthy();
  });

  it("le contact n'est écrit dans AUCUN texte : une seule variable {contact}, remplie par la configuration", () => {
    for (const lang of LANGS) {
      for (const key of PRIVACY_KEYS) expect(dict(lang)[key], `${lang} ${key}`).not.toContain("@");
      for (const key of [...Object.values(PRIVACY_MENTION_KEYS), "contributionsPrivacy.noticeWithdrawal"]) {
        expect(dict(lang)[key].match(/\{contact\}/g), `${lang} ${key}`).toHaveLength(1);
      }
    }
  });

  it("rendu : aucune variable laissée en place, le contact apparaît dans chaque mention et dans la procédure de retrait", () => {
    for (const lang of LANGS) {
      for (const key of PRIVACY_KEYS) {
        expect(privacyText(lang, key), `${lang} ${key}`).not.toMatch(/\{\w+\}/);
      }
      for (const key of Object.values(PRIVACY_MENTION_KEYS)) expect(privacyText(lang, key)).toContain(CONTRIBUTIONS_WITHDRAWAL_CONTACT.email);
    }
  });

  it("la mention Photographie dit, dans chaque langue, que les informations techniques sont retirées", () => {
    expect(dict("fr")[PRIVACY_MENTION_KEYS.photo]).toMatch(/lieu, appareil, date/);
    expect(dict("en")[PRIVACY_MENTION_KEYS.photo]).toMatch(/location, device, date/);
    expect(dict("es")[PRIVACY_MENTION_KEYS.photo]).toMatch(/lugar, dispositivo, fecha/);
  });

  it("M8-E6-T — contact vérifié (confirmation PO) : adresse seule, lien mailto avec objet traduit, sans mention « en cours »", () => {
    expect(CONTRIBUTIONS_WITHDRAWAL_CONTACT).toEqual({ email: "contact@herelys.com", reachable: true });
    expect(withdrawalContactLabel()).toBe("contact@herelys.com");
    expect(withdrawalMailto("fr")).toBe("mailto:contact@herelys.com?subject=Demande%20de%20retrait%20d%E2%80%99une%20contribution");
    expect(withdrawalMailto("en")).toBe("mailto:contact@herelys.com?subject=Request%20to%20remove%20a%20contribution");
    expect(withdrawalMailto("es")).toBe("mailto:contact@herelys.com?subject=Solicitud%20de%20retirada%20de%20una%20contribuci%C3%B3n");
    for (const lang of LANGS) {
      for (const key of PRIVACY_KEYS) expect(privacyText(lang, key)).not.toMatch(/mise en service|being set up|proceso de activación/);
      const parts = privacySegments(lang, PRIVACY_MENTION_KEYS.photo);
      expect(parts.filter((p) => p.contact)).toEqual([{ text: "contact@herelys.com", contact: true }]);
      expect(parts.map((p) => p.text).join("")).toBe(privacyText(lang, PRIVACY_MENTION_KEYS.photo));
    }
  });

  it("le contact vérifié NE valide PAS les textes : le statut juridique reste « proposition »", () => {
    expect(CONTRIBUTIONS_PRIVACY_LEGAL_STATUS).toBe("proposal");
  });

  it("blocages actuels : le juridique et les arbitrages « à définir » ; le contact n'en est plus un", () => {
    const blockers = privacyPublicationBlockers();
    expect(blockers.some((b) => b.startsWith("contact:"))).toBe(false);
    expect(CONTRIBUTIONS_PRIVACY_LEGAL_STATUS).toBe("proposal");
    expect(blockers).toEqual(expect.arrayContaining([
      "legal: textes non validés juridiquement",
      "fr: contributionsPrivacy.noticeRetention contient un arbitrage à définir",
      "en: contributionsPrivacy.noticeRights contient un arbitrage à définir",
      "es: contributionsPrivacy.noticeController contient un arbitrage à définir",
    ]));
  });

  it("le contrôle détecte un marqueur, une clé absente ou vide, dans n'importe quelle langue", () => {
    const clean = Object.fromEntries(LANGS.map((l) => [l, Object.fromEntries(PRIVACY_KEYS.map((k) => [k, "Texte validé {contact}."]))]));
    const ok = { legal: "validated" as const, reachable: true };
    expect(privacyPublicationBlockers(clean, ok)).toEqual([]);
    for (const marker of PRIVACY_PENDING_MARKERS) {
      const bad = structuredClone(clean);
      bad.es["contributionsPrivacy.noticeRights"] = `Derechos: ${marker} — x].`;
      expect(privacyPublicationBlockers(bad, ok)).toEqual(["es: contributionsPrivacy.noticeRights contient un arbitrage à définir"]);
    }
    const missing = structuredClone(clean);
    delete missing.en["contributionsPrivacy.mentionPhoto"];
    missing.fr["contributionsPrivacy.learnMore"] = "  ";
    expect(privacyPublicationBlockers(missing, ok)).toEqual(["fr: contributionsPrivacy.learnMore absente", "en: contributionsPrivacy.mentionPhoto absente"]);
  });

  it("VERROU : le dépôt public ne peut s'ouvrir que si plus rien ne bloque la publication des textes Q6", () => {
    // A15-R : seule exception, la recette technique isolée (branche jamais fusionnée).
    expect(CONTRIBUTIONS_DEPOSIT_PUBLIC_READY && !CONTRIBUTIONS_DEPOSIT_RECETTE ? privacyPublicationBlockers() : []).toEqual([]);
  });

  it("A15-R — une recette qui fonctionne ne valide PAS les textes : ils restent des propositions, affichées comme telles", () => {
    if (!CONTRIBUTIONS_DEPOSIT_RECETTE) return;
    expect(CONTRIBUTIONS_PRIVACY_LEGAL_STATUS).toBe("proposal");
    expect(privacyPublicationBlockers()).toContain("legal: textes non validés juridiquement");
  });
});
