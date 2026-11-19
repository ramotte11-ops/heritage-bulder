import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { ContributionRepository, FamilyContributionRow } from "@/lib/adapters/contribution-repository";
import type { Media } from "@/types/media";
import {
  countPendingContributions,
  listFamilyContributions,
  moderateContribution,
  readFamilyContributionSettings,
  removeContribution,
  setContributionCategories,
  setContributionsDigestPreference,
  type FamilyContributionDeps,
} from "./family-contributions";

/** Données synthétiques uniquement. */
const OWNER = "33333333-3333-4333-8333-333333333333";
const MEM = "11111111-1111-4111-8111-111111111111";
const OTHER_MEM = "99999999-9999-4999-8999-999999999999";
const C1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MEDIA = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-11-20T10:00:00Z");

function media(over: Partial<Media> = {}): Media {
  return {
    id: MEDIA, memorialId: MEM, ownerId: OWNER, storagePath: `${MEM}/${MEDIA}/original.webp`, mediaType: "photo",
    purpose: "contribution" as Media["purpose"], status: "ready", mimeType: "image/webp", originalFilename: null,
    sizeBytes: 1000, width: 2000, height: 1500, createdAt: new Date(NOW.getTime() - 3600_000).toISOString(), updatedAt: NOW.toISOString(), ...over,
  };
}

function setup(over: { owner?: string | null; owns?: string[]; repo?: Partial<ContributionRepository>; rows?: FamilyContributionRow[]; media?: Media | null } = {}) {
  const owner = over.owner === undefined ? OWNER : over.owner;
  const owns = over.owns ?? [MEM];
  const reader = { list: vi.fn(async () => over.rows ?? []) };
  const repository = {
    countPending: vi.fn(async () => [{ memorialId: MEM, pendingStories: 2, pendingPhotos: 1, pendingTotal: 3 }]),
    moderate: vi.fn(async () => ({ outcome: "updated" as const, status: "published" as const })),
    remove: vi.fn(async () => ({ outcome: "removed" as const, memorialId: MEM, cleanupClaimId: null, storagePath: null })),
    setCategories: vi.fn(async () => ({ outcome: "updated" as const, draftRevision: 8 })),
    readOwnerSettings: vi.fn(async () => ({ outcome: "ok" as const, features: { condolences: true, stories: false, photos: true }, firstPublished: true, draftRevision: 7, contributionsDigest: false })),
    setDigestPreference: vi.fn(async (i: { enabled: boolean }) => i.enabled),
    ...over.repo,
  } as unknown as ContributionRepository & Record<string, ReturnType<typeof vi.fn>>;
  const deps: FamilyContributionDeps = {
    repository,
    createReader: vi.fn(async () => reader),
    mediaRepository: { findById: vi.fn(async () => (over.media === undefined ? media() : over.media)) },
    objectStore: {
      createReadUrl: vi.fn(async ({ path }: { path: string }) => `https://storage.test/signed/${path}`),
      removeByPrefix: vi.fn(async () => undefined),
    },
    mediaSecurityRepository: { reservePendingCleanup: vi.fn(async () => ({ claimId: "new-claim" })), finishPendingCleanup: vi.fn(async () => undefined) },
    resolveOwnerId: vi.fn(async () => owner),
    authorizeMemorial: vi.fn(async (id: string) => (owner !== null && owns.includes(id) ? owner : null)),
    now: () => NOW,
  };
  return { deps, repository, reader };
}

describe("M8-E2 — compteur à examiner (O12)", () => {
  it("compte du propriétaire de la SESSION ; un hommage précis seulement s'il est à lui", async () => {
    const { deps, repository } = setup();
    expect(await countPendingContributions(deps)).toEqual({ status: "ok", counts: [{ memorialId: MEM, pendingStories: 2, pendingPhotos: 1, pendingTotal: 3 }] });
    expect(repository.countPending).toHaveBeenLastCalledWith({ ownerId: OWNER, memorialId: null });
    await countPendingContributions(deps, { memorialId: MEM });
    expect(repository.countPending).toHaveBeenLastCalledWith({ ownerId: OWNER, memorialId: MEM });
  });

  it("sans session, ou l'hommage d'un autre, ou un id forgé : denied sans appel", async () => {
    const a = setup({ owner: null });
    expect(await countPendingContributions(a.deps)).toEqual({ status: "denied" });
    const b = setup();
    expect(await countPendingContributions(b.deps, { memorialId: OTHER_MEM })).toEqual({ status: "denied" });
    expect(await countPendingContributions(b.deps, { memorialId: "1 or 1=1" })).toEqual({ status: "denied" });
    expect(a.repository.countPending).not.toHaveBeenCalled();
    expect(b.repository.countPending).not.toHaveBeenCalled();
  });
});

describe("M8-E2 — liste familiale", () => {
  const row = (over: Partial<FamilyContributionRow>): FamilyContributionRow => ({
    id: C1, type: "photo", status: "pending", authorName: "Paul", content: null, caption: null, mediaId: MEDIA,
    createdAt: "2026-11-20T09:00:00Z", publishedAt: null, moderatedAt: null, ...over,
  });

  it("à examiner par défaut ; photo en attente visible de la famille par URL signée", async () => {
    const { deps, reader } = setup({ rows: [row({})] });
    const r = await listFamilyContributions(deps, { memorialId: MEM });
    expect(reader.list).toHaveBeenCalledWith({ memorialId: MEM, status: "pending", limit: 50, beforeCreatedAt: null });
    expect(r).toMatchObject({ status: "ok", items: [{ id: C1, photo: { url: `https://storage.test/signed/${MEM}/${MEDIA}/original.webp`, width: 2000, height: 1500 } }] });
    expect(JSON.stringify(r)).not.toContain("mediaId");
  });

  it("un média non prêt (brut, non traité) ou d'une autre nature n'est JAMAIS signé", async () => {
    for (const m of [media({ status: "pending" }), media({ purpose: "gallery" }), media({ storagePath: `${OTHER_MEM}/${MEDIA}/original.webp` }), null]) {
      const { deps } = setup({ rows: [row({})], media: m });
      expect(await listFamilyContributions(deps, { memorialId: MEM })).toMatchObject({ status: "ok", items: [{ photo: null }] });
      expect(deps.objectStore.createReadUrl).not.toHaveBeenCalled();
    }
  });

  it("l'hommage d'un autre : denied, la lecture n'est même pas ouverte", async () => {
    const { deps } = setup();
    expect(await listFamilyContributions(deps, { memorialId: OTHER_MEM })).toEqual({ status: "denied" });
    expect(deps.createReader).not.toHaveBeenCalled();
  });

  it("filtres invalides refusés", async () => {
    const { deps } = setup();
    expect(await listFamilyContributions(deps, { memorialId: MEM, status: "deleted" })).toEqual({ status: "invalid" });
    expect(await listFamilyContributions(deps, { memorialId: MEM, before: "hier" })).toEqual({ status: "invalid" });
  });
});

describe("M8-E2 — modération", () => {
  it("transmet le propriétaire de la SESSION, jamais une valeur du navigateur", async () => {
    const { deps, repository } = setup();
    expect(await moderateContribution(deps, { contributionId: C1, action: "approve" })).toEqual({ status: "ok", outcome: "updated", contributionStatus: "published" });
    expect(repository.moderate).toHaveBeenCalledWith({ ownerId: OWNER, contributionId: C1, action: "approve" });
  });

  it("action inconnue (réécriture) : invalid ; id forgé ou sans session : denied", async () => {
    const { deps, repository } = setup();
    expect(await moderateContribution(deps, { contributionId: C1, action: "rewrite" })).toEqual({ status: "invalid" });
    expect(await moderateContribution(deps, { contributionId: "x", action: "approve" })).toEqual({ status: "denied" });
    const anon = setup({ owner: null });
    expect(await moderateContribution(anon.deps, { contributionId: C1, action: "hide" })).toEqual({ status: "denied" });
    expect(repository.moderate).not.toHaveBeenCalled();
    expect(anon.repository.moderate).not.toHaveBeenCalled();
  });

  it("refus de la base (pas à vous) → denied ; transition interdite signalée", async () => {
    const a = setup({ repo: { moderate: vi.fn(async () => ({ outcome: "refused" as const, status: null })) } });
    expect(await moderateContribution(a.deps, { contributionId: C1, action: "approve" })).toEqual({ status: "denied" });
    const b = setup({ repo: { moderate: vi.fn(async () => ({ outcome: "invalid_transition" as const, status: "published" as const })) } });
    expect(await moderateContribution(b.deps, { contributionId: C1, action: "reject" })).toEqual({ status: "invalid_transition", contributionStatus: "published" });
  });
});

describe("M8-E2 — suppression", () => {
  it("texte : aucune action de stockage", async () => {
    const { deps } = setup();
    expect(await removeContribution(deps, { contributionId: C1 })).toEqual({ status: "ok", photoStorage: "none" });
    expect(deps.objectStore.removeByPrefix).not.toHaveBeenCalled();
  });

  it("photo : octets supprimés tout de suite avec la réclamation posée par la base ; close après 3 h seulement", async () => {
    const remove = vi.fn(async () => ({ outcome: "removed" as const, memorialId: MEM, cleanupClaimId: "db-claim", storagePath: `${MEM}/${MEDIA}/original.webp` }));
    const young = setup({ repo: { remove } });
    expect(await removeContribution(young.deps, { contributionId: C1 })).toEqual({ status: "ok", photoStorage: "removed_claim_open" });
    expect(young.deps.objectStore.removeByPrefix).toHaveBeenCalledWith({ prefix: `${MEM}/${MEDIA}` });
    expect(young.deps.mediaSecurityRepository.reservePendingCleanup).not.toHaveBeenCalled();
    expect(young.deps.mediaSecurityRepository.finishPendingCleanup).not.toHaveBeenCalled();

    const old = setup({ repo: { remove }, media: media({ status: "pending", createdAt: new Date(NOW.getTime() - 4 * 3600_000).toISOString() }) });
    expect(await removeContribution(old.deps, { contributionId: C1 })).toEqual({ status: "ok", photoStorage: "removed" });
    expect(old.deps.mediaSecurityRepository.finishPendingCleanup).toHaveBeenCalledWith({ memorialId: MEM, ownerId: OWNER, claimId: "db-claim" });
  });

  it("chemin rendu par la base hors de l'hommage : rien n'est supprimé", async () => {
    const { deps } = setup({ repo: { remove: vi.fn(async () => ({ outcome: "removed" as const, memorialId: MEM, cleanupClaimId: "c", storagePath: `${OTHER_MEM}/${MEDIA}/original.webp` })) } });
    expect(await removeContribution(deps, { contributionId: C1 })).toEqual({ status: "ok", photoStorage: "pending_retry" });
    expect(deps.objectStore.removeByPrefix).not.toHaveBeenCalled();
  });

  it("refusée par la base : denied", async () => {
    const { deps } = setup({ repo: { remove: vi.fn(async () => ({ outcome: "refused" as const, memorialId: null, cleanupClaimId: null, storagePath: null })) } });
    expect(await removeContribution(deps, { contributionId: C1 })).toEqual({ status: "denied" });
  });
});

describe("M8-E2 — catégories (O9) et préférence (O12)", () => {
  it("lecture de l'état courant de l'hommage du propriétaire", async () => {
    const { deps, repository } = setup();
    expect(await readFamilyContributionSettings(deps, { memorialId: MEM })).toEqual({
      status: "ok",
      settings: { features: { condolences: true, stories: false, photos: true }, corrupted: false, firstPublished: true, draftRevision: 7, contributionsDigest: false },
    });
    expect(repository.readOwnerSettings).toHaveBeenCalledWith({ ownerId: OWNER, memorialId: MEM });
    expect(await readFamilyContributionSettings(deps, { memorialId: OTHER_MEM })).toEqual({ status: "denied" });
  });

  it("changement immédiat, avec ou sans révision attendue ; révision périmée signalée", async () => {
    const { deps, repository } = setup();
    expect(await setContributionCategories(deps, { memorialId: MEM, features: { condolences: true, stories: true, photos: false }, expectedRevision: 7 })).toEqual({ status: "ok", outcome: "updated", draftRevision: 8 });
    expect(repository.setCategories).toHaveBeenCalledWith({ ownerId: OWNER, memorialId: MEM, features: { condolences: true, stories: true, photos: false }, expectedRevision: 7 });
    const stale = setup({ repo: { setCategories: vi.fn(async () => ({ outcome: "stale_revision" as const, draftRevision: 9 })) } });
    expect(await setContributionCategories(stale.deps, { memorialId: MEM, features: { condolences: false, stories: false, photos: false } })).toEqual({ status: "stale_revision", draftRevision: 9 });
  });

  it("entrées forgées refusées ; l'hommage d'un autre : denied", async () => {
    const { deps, repository } = setup();
    expect(await setContributionCategories(deps, { memorialId: MEM, features: { condolences: "oui", stories: true, photos: true } })).toEqual({ status: "invalid" });
    expect(await setContributionCategories(deps, { memorialId: MEM, features: null })).toEqual({ status: "invalid" });
    expect(await setContributionCategories(deps, { memorialId: MEM, features: { condolences: true, stories: true, photos: true }, expectedRevision: -1 })).toEqual({ status: "invalid" });
    expect(await setContributionCategories(deps, { memorialId: OTHER_MEM, features: { condolences: true, stories: true, photos: true } })).toEqual({ status: "denied" });
    expect(repository.setCategories).not.toHaveBeenCalled();
  });

  it("préférence : booléen seulement, propriétaire de la session", async () => {
    const { deps, repository } = setup();
    expect(await setContributionsDigestPreference(deps, { enabled: true })).toEqual({ status: "ok", contributionsDigest: true });
    expect(repository.setDigestPreference).toHaveBeenCalledWith({ ownerId: OWNER, enabled: true });
    expect(await setContributionsDigestPreference(deps, { enabled: "true" })).toEqual({ status: "invalid" });
    expect(await setContributionsDigestPreference(setup({ owner: null }).deps, { enabled: false })).toEqual({ status: "denied" });
  });

  it("panne d'infrastructure : unavailable, jamais un faux succès", async () => {
    const { deps } = setup({ repo: { setDigestPreference: vi.fn(async () => { throw new Error("db"); }) } });
    expect(await setContributionsDigestPreference(deps, { enabled: true })).toEqual({ status: "unavailable" });
  });
});
