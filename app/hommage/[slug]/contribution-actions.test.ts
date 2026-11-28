import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { createVisitorContributionDeps, createFamilyContributionDeps } = vi.hoisted(() => ({
  createVisitorContributionDeps: vi.fn(),
  createFamilyContributionDeps: vi.fn(),
}));
vi.mock("@/lib/memorial/contributions/server-contributions", () => ({ createVisitorContributionDeps, createFamilyContributionDeps }));
// Le verrou de publication est fermé en production ; les tests du moteur l'ouvrent explicitement.
// A15-R (branche de recette) : `recetteSlugs` simule CONTRIBUTIONS_RECETTE_SLUGS ;
// `null` = tous les slugs de ces tests du moteur (forgés compris) sont dans la liste.
const readiness = vi.hoisted(() => {
  const r = {
    CONTRIBUTIONS_DEPOSIT_PUBLIC_READY: true,
    recetteSlugs: null as string[] | null,
    contributionsDepositOpenFor: (slug: unknown) =>
      r.CONTRIBUTIONS_DEPOSIT_PUBLIC_READY && (r.recetteSlugs === null || (typeof slug === "string" && r.recetteSlugs.includes(slug))),
  };
  return r;
});
vi.mock("@/config/contributions-deposit-readiness", () => readiness);

const visitor = await import("./contribution-actions");
const family = await import("@/lib/memorial/contributions/family-contribution-actions");

/**
 * M8-E2 — les points d'entrée Server Action : configuration serveur
 * absente (aucun secret, aucune clé) = indisponible, jamais une exception
 * ni un dépôt ouvert ; arguments forgés passés tels quels au moteur, qui
 * les refuse.
 */
beforeEach(() => {
  createVisitorContributionDeps.mockReset();
  createFamilyContributionDeps.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("M8-E6-P — verrou serveur du dépôt", () => {
  it("verrou fermé : les quatre actions de dépôt répondent unavailable sans rien construire ni écrire, secret et base en place", async () => {
    readiness.CONTRIBUTIONS_DEPOSIT_PUBLIC_READY = false;
    try {
      const submit = vi.fn();
      createVisitorContributionDeps.mockReturnValue({ secrets: { current: "s".repeat(40), previous: null }, now: () => new Date(), repository: { submit } });
      expect(await visitor.openContributionWindow("a1b2c3d4e5f6")).toEqual({ status: "unavailable" });
      expect(await visitor.depositContributionText({ slug: "a1b2c3d4e5f6", type: "condolence", authorName: "A", text: "B", formToken: "x" })).toEqual({ status: "unavailable" });
      expect(await visitor.beginContributionPhoto({ slug: "a1b2c3d4e5f6", declaredMimeType: "image/jpeg", formToken: "x" })).toEqual({ status: "unavailable" });
      expect(await visitor.completeContributionPhoto({ slug: "a1b2c3d4e5f6", mediaId: "m", photoTicket: "t", authorName: "A", formToken: "x" })).toEqual({ status: "unavailable" });
      expect(createVisitorContributionDeps).not.toHaveBeenCalled();
      expect(submit).not.toHaveBeenCalled();
    } finally {
      readiness.CONTRIBUTIONS_DEPOSIT_PUBLIC_READY = true;
    }
  });

  it("A15-R — verrou ouvert, hommage HORS de la liste de recette : les quatre actions répondent unavailable sans rien construire", async () => {
    readiness.recetteSlugs = ["bbbbbbbbbbbb"];
    try {
      const submit = vi.fn();
      createVisitorContributionDeps.mockReturnValue({ secrets: { current: "s".repeat(40), previous: null }, now: () => new Date(), repository: { submit } });
      expect(await visitor.openContributionWindow("a1b2c3d4e5f6")).toEqual({ status: "unavailable" });
      expect(await visitor.depositContributionText({ slug: "a1b2c3d4e5f6", type: "condolence", authorName: "A", text: "B", formToken: "x" })).toEqual({ status: "unavailable" });
      expect(await visitor.beginContributionPhoto({ slug: "a1b2c3d4e5f6", declaredMimeType: "image/jpeg", formToken: "x" })).toEqual({ status: "unavailable" });
      expect(await visitor.completeContributionPhoto({ slug: "a1b2c3d4e5f6", mediaId: "m", photoTicket: "t", authorName: "A", formToken: "x" })).toEqual({ status: "unavailable" });
      expect(createVisitorContributionDeps).not.toHaveBeenCalled();
      expect(submit).not.toHaveBeenCalled();
    } finally {
      readiness.recetteSlugs = null;
    }
  });

  it("verrou fermé : la lecture (Album, liens photo) reste servie", async () => {
    readiness.CONTRIBUTIONS_DEPOSIT_PUBLIC_READY = false;
    try {
      createVisitorContributionDeps.mockImplementation(() => {
        throw new Error("no config");
      });
      await visitor.loadContributions("a1b2c3d4e5f6", null);
      expect(createVisitorContributionDeps).toHaveBeenCalled();
    } finally {
      readiness.CONTRIBUTIONS_DEPOSIT_PUBLIC_READY = true;
    }
  });
});

describe("M8-E2 — Server Actions publiques", () => {
  it("configuration manquante : chaque action répond unavailable", async () => {
    createVisitorContributionDeps.mockImplementation(() => {
      throw new Error("Missing environment variable SUPABASE_SERVICE_ROLE_KEY");
    });
    expect(await visitor.openContributionWindow("a1b2c3d4e5f6")).toEqual({ status: "unavailable" });
    expect(await visitor.depositContributionText({ slug: "a1b2c3d4e5f6", type: "condolence", authorName: "A", text: "B", formToken: "x" })).toEqual({ status: "unavailable" });
    expect(await visitor.beginContributionPhoto({ slug: "a1b2c3d4e5f6", declaredMimeType: "image/jpeg", formToken: "x" })).toEqual({ status: "unavailable" });
    expect(await visitor.completeContributionPhoto({ slug: "a1b2c3d4e5f6", mediaId: "m", photoTicket: "t", authorName: "A", formToken: "x" })).toEqual({ status: "unavailable" });
    expect(await visitor.loadContributions("a1b2c3d4e5f6", null)).toEqual({ status: "unavailable" });
  });

  it("sans secret de formulaire (aucun secret de production créé à cette étape) : le dépôt est fermé", async () => {
    const submit = vi.fn();
    createVisitorContributionDeps.mockReturnValue({ secrets: null, now: () => new Date(), repository: { submit } });
    expect(await visitor.openContributionWindow("a1b2c3d4e5f6")).toEqual({ status: "unavailable" });
    expect(await visitor.depositContributionText({ slug: "a1b2c3d4e5f6", type: "condolence", authorName: "A", text: "B", formToken: "x" })).toEqual({ status: "unavailable" });
    expect(submit).not.toHaveBeenCalled();
  });

  it("un appel forgé (null, champ piège) est refusé sans écriture", async () => {
    const submit = vi.fn();
    createVisitorContributionDeps.mockReturnValue({ secrets: { current: "s".repeat(40), previous: null }, now: () => new Date(), repository: { submit } });
    expect(await visitor.depositContributionText(null as never)).toEqual({ status: "refused" });
    expect(await visitor.depositContributionText({ slug: "a1b2c3d4e5f6", type: "condolence", authorName: "A", text: "B", formToken: "x", website: "spam" })).toEqual({ status: "refused" });
    expect(submit).not.toHaveBeenCalled();
  });
});

describe("M8-E2 — Server Actions familiales", () => {
  it("configuration manquante : unavailable", async () => {
    createFamilyContributionDeps.mockImplementation(() => {
      throw new Error("missing");
    });
    expect(await family.getPendingContributionCounts()).toEqual({ status: "unavailable" });
    expect(await family.moderateFamilyContribution("x", "approve")).toEqual({ status: "unavailable" });
  });

  it("sans session propriétaire : denied, aucune RPC", async () => {
    const moderate = vi.fn();
    createFamilyContributionDeps.mockReturnValue({ resolveOwnerId: async () => null, authorizeMemorial: async () => null, repository: { moderate } });
    expect(await family.moderateFamilyContribution("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "approve")).toEqual({ status: "denied" });
    expect(await family.updateContributionCategories("11111111-1111-4111-8111-111111111111", { condolences: true, stories: true, photos: true })).toEqual({ status: "denied" });
    expect(moderate).not.toHaveBeenCalled();
  });
});
