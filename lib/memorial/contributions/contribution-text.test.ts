import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  checkContributionText,
  checkOptionalCaption,
  countCodePoints,
  countVisibleCharacters,
  normalizeContributionText,
  passesDatabaseNet,
} from "./contribution-text";
import type { ContributionTextField } from "@/config/contributions";

/** « Bisou : femme, homme, teints » : 1 caractère visible, 10 points de code. */
const KISS = "\u{1F469}\u{1F3FB}\u200D\u2764\uFE0F\u200D\u{1F48B}\u200D\u{1F468}\u{1F3FC}";

/**
 * Le même jeu que supabase/verifications/m8_e1_unicode_cases.sql (Q2).
 * `db` : l'attente de la base, pour une valeur passée TELLE QUELLE ;
 * `app` : l'attente de ce module, qui normalise d'abord (NFC, \r → \n).
 */
const CASES: { id: string; field: ContributionTextField; value: string; db: "accepted" | "refused"; app: "accepted" | "refused" }[] = [
  { id: "u01", field: "condolence", value: KISS.repeat(500), db: "accepted", app: "accepted" },
  { id: "u02", field: "condolence", value: KISS.repeat(500) + "a", db: "refused", app: "refused" },
  { id: "u03", field: "condolence", value: "é".repeat(500), db: "accepted", app: "accepted" },
  { id: "u04", field: "condolence", value: "Pense\u0301e", db: "refused", app: "accepted" },
  { id: "u05", field: "story", value: "Ligne 1\r\nLigne 2", db: "refused", app: "accepted" },
  { id: "u06", field: "story", value: "Ligne 1\n\nLigne 2", db: "accepted", app: "accepted" },
  { id: "u07", field: "story", value: KISS.repeat(2000), db: "accepted", app: "accepted" },
  { id: "u08", field: "authorName", value: KISS.repeat(60), db: "accepted", app: "accepted" },
  { id: "u09", field: "authorName", value: KISS.repeat(60) + "a", db: "refused", app: "refused" },
  { id: "u10", field: "authorName", value: "   ", db: "refused", app: "refused" },
  { id: "u11", field: "caption", value: KISS.repeat(150), db: "accepted", app: "accepted" },
  { id: "u12", field: "caption", value: KISS.repeat(150) + "a", db: "refused", app: "refused" },
];

describe("M8-E2 — contribution-text (Q2, O7)", () => {
  it("normalise : \\r\\n et \\r → \\n, NFC, bords", () => {
    expect(normalizeContributionText("  a\r\nb\rc  ")).toBe("a\nb\nc");
    expect(normalizeContributionText("Pense\u0301e")).toBe("Pensée");
  });

  it("compte les caractères visibles : un émoji composé = 1, un retour à la ligne = 1", () => {
    expect(countVisibleCharacters(KISS)).toBe(1);
    expect(countCodePoints(KISS)).toBe(10);
    expect(countVisibleCharacters("a\nb")).toBe(3);
    expect(countVisibleCharacters("\u{1F1EB}\u{1F1F7}")).toBe(1);
  });

  it("limites exactes de chaque champ (N accepté, N + 1 refusé)", () => {
    for (const [field, n] of [["authorName", 60], ["condolence", 500], ["story", 2000], ["caption", 150]] as const) {
      expect(checkContributionText(field, "x".repeat(n))).toMatchObject({ ok: true, visibleCharacters: n });
      expect(checkContributionText(field, "x".repeat(n + 1))).toEqual({ ok: false, reason: "too_long" });
    }
  });

  it("un caractère visible de plus de 10 points de code est refusé (garde-fou Q2)", () => {
    const eleven = "e" + "\u0301".repeat(11); // NFC : é + 10 accents = 1 graphème, 11 points de code
    expect(countVisibleCharacters(eleven)).toBe(1);
    expect(checkContributionText("condolence", eleven)).toEqual({ ok: false, reason: "too_complex" });
  });

  it("refuse le non-texte, le vide, les contrôles et les isolés de direction", () => {
    expect(checkContributionText("condolence", 42)).toEqual({ ok: false, reason: "invalid" });
    expect(checkContributionText("condolence", "  \n ")).toEqual({ ok: false, reason: "empty" });
    expect(checkContributionText("condolence", "a\u0000b")).toEqual({ ok: false, reason: "invalid" });
    expect(checkContributionText("condolence", "a\u202Eb")).toEqual({ ok: false, reason: "invalid" });
    expect(checkContributionText("condolence", "a\uD800b")).toEqual({ ok: false, reason: "invalid" });
    expect(checkContributionText("authorName", "Jean\nDupont")).toEqual({ ok: false, reason: "invalid" });
  });

  it("refuse une saisie démesurée sans la segmenter", () => {
    expect(checkContributionText("condolence", "x".repeat(1_000_000))).toEqual({ ok: false, reason: "too_long" });
  });

  it("légende facultative : absente, nulle ou vide → null", () => {
    expect(checkOptionalCaption(undefined)).toEqual({ ok: true, value: null });
    expect(checkOptionalCaption(null)).toEqual({ ok: true, value: null });
    expect(checkOptionalCaption("  \r\n ")).toEqual({ ok: true, value: null });
    expect(checkOptionalCaption(" Au jardin ")).toEqual({ ok: true, value: "Au jardin" });
    expect(checkOptionalCaption(7)).toEqual({ ok: false, reason: "invalid" });
  });

  it.each(CASES)("cas $id : l'application et la base se comportent comme prévu", ({ field, value, db, app }) => {
    expect(passesDatabaseNet(field, value) ? "accepted" : "refused").toBe(db);
    const checked = checkContributionText(field, value);
    expect(checked.ok ? "accepted" : "refused").toBe(app);
    // L'invariant Q2 : toute valeur acceptée (et normalisée) par
    // l'application passe le filet de la base.
    if (checked.ok) expect(passesDatabaseNet(field, checked.value)).toBe(true);
  });

  it("le jeu de cas TypeScript est synchronisé avec le jeu SQL (identifiants, champs, attentes)", () => {
    const sql = readFileSync(path.resolve(import.meta.dirname, "../../../supabase/verifications/m8_e1_unicode_cases.sql"), "utf8");
    const rows = [...sql.matchAll(/\('(u\d\d)', '(\w+)', '(\w+)', '(accepted|refused)'/g)].map((m) => [m[1], m[3], m[4]]);
    const sqlField: Record<ContributionTextField, string> = { authorName: "author_name", condolence: "content", story: "content", caption: "caption" };
    expect(rows).toEqual(CASES.map((c) => [c.id, sqlField[c.field], c.db]));
  });

  it("invariant Q2 sur des textes variés : accepté par l'application ⇒ accepté par la base", () => {
    const pieces = ["a", "é", "e\u0301", "\r\n", "\n", " ", KISS, "\u{1F1EB}\u{1F1F7}", "\u{1F44D}\u{1F3FD}", "日本", "ا", "\t"];
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let i = 0; i < 400; i++) {
      const field = (["authorName", "condolence", "story", "caption"] as const)[i % 4];
      const len = Math.floor(rnd() * 700);
      let raw = "";
      for (let j = 0; j < len; j++) raw += pieces[Math.floor(rnd() * pieces.length)];
      const checked = checkContributionText(field, raw);
      if (checked.ok) expect(passesDatabaseNet(field, checked.value)).toBe(true);
    }
  });
});
