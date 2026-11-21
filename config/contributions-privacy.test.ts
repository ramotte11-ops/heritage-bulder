import { describe, expect, it } from "vitest";
import { DICTIONARIES } from "@/lib/i18n/translate";
import { CONTRIBUTIONS_DEPOSIT_PUBLIC_READY } from "./contributions-deposit-readiness";
import {
  CONTRIBUTIONS_PRIVACY_LEGAL_STATUS,
  CONTRIBUTIONS_WITHDRAWAL_CONTACT,
  PRIVACY_KEYS,
  PRIVACY_MENTION_KEYS,
  PRIVACY_PENDING_MARKERS,
  privacyPublicationBlockers,
  privacyText,
  withdrawalContactLabel,
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
      for (const key of PRIVACY_KEYS.filter((k) => k !== "contributionsPrivacy.contactPending")) {
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

  it("contact non vérifié : jamais présenté comme joignable (« en cours de mise en service »)", () => {
    expect(CONTRIBUTIONS_WITHDRAWAL_CONTACT).toEqual({ email: "contact@herelys.com", reachable: false });
    expect(withdrawalContactLabel("fr")).toBe("contact@herelys.com (adresse en cours de mise en service)");
    expect(withdrawalContactLabel("en")).toBe("contact@herelys.com (address being set up)");
    expect(withdrawalContactLabel("es")).toBe("contact@herelys.com (dirección en proceso de activación)");
  });

  it("blocages actuels : juridique, contact, et les arbitrages « à définir » dans les trois langues", () => {
    const blockers = privacyPublicationBlockers();
    expect(CONTRIBUTIONS_PRIVACY_LEGAL_STATUS).toBe("proposal");
    expect(blockers).toEqual(expect.arrayContaining([
      "legal: textes non validés juridiquement",
      "contact: réception de contact@herelys.com non vérifiée",
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
    expect(CONTRIBUTIONS_DEPOSIT_PUBLIC_READY ? privacyPublicationBlockers() : []).toEqual([]);
  });
});
