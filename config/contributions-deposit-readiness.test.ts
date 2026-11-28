import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  CONTRIBUTIONS_DEPOSIT_BLOCKERS,
  CONTRIBUTIONS_DEPOSIT_PROVISIONAL_KEYS,
  CONTRIBUTIONS_DEPOSIT_PUBLIC_READY,
  CONTRIBUTIONS_DEPOSIT_RECETTE,
  contributionsDepositOpenFor,
  contributionsRecetteSlugs,
} from "./contributions-deposit-readiness";

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? filesUnder(p) : /\.(tsx?|mts)$/.test(f) ? [p] : [];
  });
}

describe("M8-E4 — verrou du dépôt public (Q6, design, E6)", () => {
  it("A15-R — verrou ouvert UNIQUEMENT en mode recette (branche jamais fusionnée), chaque réserve reste nommée", () => {
    // Sur `main`, ce test exige `false`. Ici, l'ouverture n'est admise qu'accompagnée du mode recette.
    expect(CONTRIBUTIONS_DEPOSIT_PUBLIC_READY).toBe(true);
    expect(CONTRIBUTIONS_DEPOSIT_RECETTE).toBe(true);
    expect(CONTRIBUTIONS_DEPOSIT_BLOCKERS.map((b) => b.id)).toEqual(
      expect.arrayContaining(["Q6-legal", "Q6-withdrawal-contact", "E6-migrations", "E6-form-secret"]),
    );
    // E6-A : la direction artistique « La lettre des proches » est validée par la PO (plus une réserve).
    expect(CONTRIBUTIONS_DEPOSIT_BLOCKERS.map((b) => b.id)).not.toContain("E4-design");
    // M8-Q6 : les mentions par type et la notice remplacent la mention générique provisoire.
    expect(CONTRIBUTIONS_DEPOSIT_PROVISIONAL_KEYS).toEqual(expect.arrayContaining(["contributionsPrivacy.mentionCondolence", "contributionsPrivacy.mentionStory", "contributionsPrivacy.mentionPhoto"]));
  });

  it("le verrou est aussi appliqué côté serveur par les quatre actions de dépôt", () => {
    const src = readFileSync(path.resolve(import.meta.dirname, "..", "app", "hommage", "[slug]", "contribution-actions.ts"), "utf8");
    for (const fn of ["openContributionWindow", "depositContributionText", "beginContributionPhoto", "completeContributionPhoto"]) {
      const body = src.slice(src.indexOf(`export async function ${fn}`)).split("\nexport ")[0];
      expect(body, fn).toContain("withDepositDeps(");
    }
    expect(src).toContain("if (!CONTRIBUTIONS_DEPOSIT_PUBLIC_READY) return");
    expect(src).toContain("if (!contributionsDepositOpenFor(slug)) return");
  });

  it("M8-E6-F — la page publique ne lit la rubrique et ne transmet le dépôt que verrou ouvert", () => {
    const page = readFileSync(path.resolve(import.meta.dirname, "..", "app", "hommage", "[slug]", "page.tsx"), "utf8");
    // A15-R : verrou ET liste de recette, calculés une fois pour la lecture et pour le dépôt.
    expect(page).toContain("const contributionsOpen = CONTRIBUTIONS_DEPOSIT_PUBLIC_READY && contributionsDepositOpenFor(slug);");
    expect(page).toMatch(/contributionsOpen && view\.assembled\.sections/);
    expect(page).toMatch(/const deposit = contributionsOpen\s*\?/);
  });

  it("verrou fermé : aucune page publique n'importe la fenêtre ni le transport réel", () => {
    const root = path.resolve(import.meta.dirname, "..", "app", "hommage");
    const offenders = filesUnder(root).filter((f) => /ContributionDepositWindow|use-contribution-deposit|createContributionDepositTransport/.test(readFileSync(f, "utf8")));
    if (!CONTRIBUTIONS_DEPOSIT_PUBLIC_READY) expect(offenders.map((f) => path.relative(root, f))).toEqual([]);
  });

  it("A15-R — liste de recette : échec fermé si absente, vide, mal formée ou trop longue", () => {
    const A = "95bd2601eac8";
    const B = "0123456789abcdef";
    expect(contributionsRecetteSlugs({})).toEqual([]);
    expect(contributionsRecetteSlugs({ CONTRIBUTIONS_RECETTE_SLUGS: "" })).toEqual([]);
    expect(contributionsRecetteSlugs({ CONTRIBUTIONS_RECETTE_SLUGS: " , " })).toEqual([]);
    expect(contributionsRecetteSlugs({ CONTRIBUTIONS_RECETTE_SLUGS: `${A}, ${B}` })).toEqual([A, B]);
    // Un seul élément invalide ferme toute la liste (jamais d'ouverture partielle par erreur de saisie).
    expect(contributionsRecetteSlugs({ CONTRIBUTIONS_RECETTE_SLUGS: `${A},*` })).toEqual([]);
    expect(contributionsRecetteSlugs({ CONTRIBUTIONS_RECETTE_SLUGS: `${A},Mon-Hommage` })).toEqual([]);
    expect(contributionsRecetteSlugs({ CONTRIBUTIONS_RECETTE_SLUGS: "abc" })).toEqual([]);
    expect(contributionsRecetteSlugs({ CONTRIBUTIONS_RECETTE_SLUGS: Array.from({ length: 5 }, (_, i) => `${A}${i}`).join(",") })).toEqual([]);
  });

  it("A15-R — le dépôt n'est ouvert que pour un hommage de la liste", () => {
    const env = { CONTRIBUTIONS_RECETTE_SLUGS: "95bd2601eac8" };
    expect(contributionsDepositOpenFor("95bd2601eac8", env)).toBe(true);
    expect(contributionsDepositOpenFor("95bd2601eac9", env)).toBe(false);
    expect(contributionsDepositOpenFor("95BD2601EAC8", env)).toBe(false);
    expect(contributionsDepositOpenFor(null, env)).toBe(false);
    expect(contributionsDepositOpenFor(["95bd2601eac8"], env)).toBe(false);
    expect(contributionsDepositOpenFor("95bd2601eac8", {})).toBe(false);
  });
});
