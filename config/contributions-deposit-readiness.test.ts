import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { CONTRIBUTIONS_DEPOSIT_BLOCKERS, CONTRIBUTIONS_DEPOSIT_PROVISIONAL_KEYS, CONTRIBUTIONS_DEPOSIT_PUBLIC_READY } from "./contributions-deposit-readiness";

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? filesUnder(p) : /\.(tsx?|mts)$/.test(f) ? [p] : [];
  });
}

describe("M8-E4 — verrou du dépôt public (Q6, design, E6)", () => {
  it("le verrou est fermé et chaque réserve est nommée", () => {
    expect(CONTRIBUTIONS_DEPOSIT_PUBLIC_READY).toBe(false);
    expect(CONTRIBUTIONS_DEPOSIT_BLOCKERS.map((b) => b.id)).toEqual(
      expect.arrayContaining(["Q6-legal", "Q6-withdrawal-contact", "E4-design", "E6-migrations", "E6-form-secret"]),
    );
    expect(CONTRIBUTIONS_DEPOSIT_PROVISIONAL_KEYS).toContain("contributionsDeposit.privacy");
  });

  it("le verrou est aussi appliqué côté serveur par les quatre actions de dépôt", () => {
    const src = readFileSync(path.resolve(import.meta.dirname, "..", "app", "hommage", "[slug]", "contribution-actions.ts"), "utf8");
    for (const fn of ["openContributionWindow", "depositContributionText", "beginContributionPhoto", "completeContributionPhoto"]) {
      const body = src.slice(src.indexOf(`export async function ${fn}`)).split("\nexport ")[0];
      expect(body, fn).toContain("withDepositDeps(");
    }
    expect(src).toContain("if (!CONTRIBUTIONS_DEPOSIT_PUBLIC_READY) return");
  });

  it("verrou fermé : aucune page publique n'importe la fenêtre ni le transport réel", () => {
    const root = path.resolve(import.meta.dirname, "..", "app", "hommage");
    const offenders = filesUnder(root).filter((f) => /ContributionDepositWindow|use-contribution-deposit|createContributionDepositTransport/.test(readFileSync(f, "utf8")));
    if (!CONTRIBUTIONS_DEPOSIT_PUBLIC_READY) expect(offenders.map((f) => path.relative(root, f))).toEqual([]);
  });
});
