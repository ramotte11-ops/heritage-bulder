import { describe, expect, it } from "vitest";
import type { MemorialContent } from "@/types/memorial";
import { fullAnnouncement } from "@/lib/memorial/assembly/test-fixtures";
import { projectMemorialPublication } from "@/lib/memorial/publication-policy";
import { computePublicationPreview } from "@/lib/memorial/publication-preview";
import { authorizeMemorialEdit } from "@/lib/memorial/edit-authorization";
import { changedMemorialContentMutations } from "@/lib/memorial/edit-mutations";
import { lockedJourneyScreens } from "@/lib/builder/guided-flow/journey-locks";
import { buildTransferredContent } from "@/lib/guest-draft/guest-transfer-plan";
import { transferableDraft } from "@/lib/guest-draft/guest-transfer-test-fixtures";
import { commitA16, isA16Resolved, needsA16, readVideoForEditing, skipA16 } from "@/lib/builder/guided-flow/video-step";
import { decideVideoUpload } from "./video-upload-contract";
import { isVideoHostingConfigured } from "./hosting/hosting-runtime";
import { writeVideoItems } from "./video-content";

/**
 * VID-06 — la vidéo reste une fonctionnalité de PUBLICATION premium : la
 * préparation est ouverte à tous, mais aucun accès distant ni aucune
 * publication sans l'offre complète — et, dans VID-06, aucune publication
 * du tout (pas de rendu public tant que le lot Mux n'est pas ouvert).
 */

const VIDEOS = { items: [{ id: "v-1", title: "Son anniversaire", durationSeconds: 268 }, { id: "v-2", title: null, durationSeconds: null }] };
const withVideos = (content: MemorialContent) => ({ ...content, video: VIDEOS }) as unknown as MemorialContent;
const owner = (status: "draft" | "published") => ({
  actor: "owner" as const,
  status,
  firstPublicationExists: status === "published",
  locks: { ceremony: "unknown" as const },
});

describe("VID-06 — A16 dans le parcours", () => {
  const base = { guidedFlow: { A13: { status: "skipped" } } } as unknown as MemorialContent;

  it("jamais avant A15 ; dès A15 traitée, jusqu'à ce qu'A16 le soit", () => {
    expect(needsA16(base)).toBe(false);
    const afterA15 = { guidedFlow: { A13: { status: "skipped" }, A15: { status: "skipped" } } } as unknown as MemorialContent;
    expect(needsA16(afterA15)).toBe(true);
    const done = commitA16(afterA15, VIDEOS.items);
    expect(done.ok && isA16Resolved(done.content)).toBe(true);
    expect(done.ok && needsA16(done.content)).toBe(false);
  });

  it("« Continuer » : completed avec des vidéos, skipped sans ; « Passer » garde les vidéos", () => {
    const withItems = commitA16(base, VIDEOS.items);
    expect(withItems.ok && (withItems.content as unknown as { guidedFlow: Record<string, unknown> }).guidedFlow.A16).toEqual({ status: "completed" });
    const empty = commitA16(base, []);
    expect(empty.ok && (empty.content as unknown as { guidedFlow: Record<string, unknown> }).guidedFlow.A16).toEqual({ status: "skipped" });
    const skipped = skipA16(withVideos(base));
    expect(skipped.ok && readVideoForEditing(skipped.content)).toEqual({ status: "ready", items: VIDEOS.items });
  });

  it("contenu illisible : ni Continuer ni Passer ne l'écrasent", () => {
    const corrupted = { ...base, video: { items: 3 } } as unknown as MemorialContent;
    expect(commitA16(corrupted, [])).toEqual({ ok: false, reason: "corrupted" });
    expect(skipA16(corrupted)).toEqual({ ok: false, reason: "corrupted" });
  });
});

describe("VID-06 — enregistrement du brouillon (Security V1)", () => {
  it("ajouter, titrer, réordonner ou retirer des vidéos ne produit que les cibles autorisées", () => {
    const start = { hero: { displayName: "Élise" } } as unknown as MemorialContent;
    const added = writeVideoItems(start, VIDEOS.items);
    expect(changedMemorialContentMutations(start, added)).toEqual([{ kind: "content", target: "video.items" }]);
    const reordered = writeVideoItems(added, [...VIDEOS.items].reverse());
    expect(changedMemorialContentMutations(added, reordered)).toEqual([{ kind: "content", target: "video.items" }]);
    const done = commitA16(reordered, [...VIDEOS.items].reverse());
    expect(done.ok && changedMemorialContentMutations(reordered, done.content)).toEqual([{ kind: "content", target: "guidedFlow.A16" }]);
  });

  it("autorisé au propriétaire avant comme après publication ; refusé à tout autre acteur ; une clé inconnue sous video est refusée", () => {
    const claims = [{ kind: "content" as const, target: "video.items" }, { kind: "content" as const, target: "guidedFlow.A16" }];
    expect(authorizeMemorialEdit(owner("draft"), claims).decision).toBe("ALLOW");
    expect(authorizeMemorialEdit(owner("published"), claims).decision).toBe("ALLOW");
    expect(authorizeMemorialEdit({ ...owner("draft"), actor: "unknown" }, claims).decision).toBe("DENY");
    expect(authorizeMemorialEdit(owner("draft"), [{ kind: "content", target: "video.hosted" }])).toMatchObject({ decision: "DENY", reason: "unknown_mutation_target" });
    expect(lockedJourneyScreens({ status: "published" })).not.toContain("video");
  });

  it("le transfert invité → brouillon durable garde titres, durées et ordre, sans aucun fichier", () => {
    const draft = transferableDraft({ galleryCount: 0 });
    const guest = { ...draft, content: withVideos(draft.content) };
    const mediaMap = Object.fromEntries(guest.photos.map(({ localId }) => [localId, `media-${localId}`]));
    const built = buildTransferredContent(guest, mediaMap);
    expect(built.ok).toBe(true);
    expect(built.ok && (built.content as unknown as { video: unknown }).video).toEqual(VIDEOS);
    expect(built.ok && changedMemorialContentMutations({} as MemorialContent, { video: VIDEOS } as unknown as MemorialContent)).toEqual([
      { kind: "content", target: "video.items" },
    ]);
  });
});

describe("VID-06 — aucune publication vidéo, aucun accès distant sans l'offre complète", () => {
  it.each(["avis", "complet"] as const)("offre %s : la projection publiée ne contient jamais la rubrique vidéo", (accessLevel) => {
    const projected = projectMemorialPublication({ draft: withVideos(fullAnnouncement()), accessLevel, skin: "intemporel" });
    expect(projected.ok).toBe(true);
    expect(projected.ok && "video" in projected.projection.content).toBe(false);
  });

  it("offre gratuite : l'avis existant « réservées à l'hommage complet » est montré avant de publier", () => {
    const preview = computePublicationPreview({ draft: withVideos(fullAnnouncement()), accessLevel: "avis", skin: "intemporel" });
    expect(preview.ok && preview.premiumSections).toContain("video");
    const complete = computePublicationPreview({ draft: withVideos(fullAnnouncement()), accessLevel: "complet", skin: "intemporel" });
    expect(complete.ok && complete.premiumSections).toEqual([]);
  });

  it.each([
    [{ actorIsOwner: true, accessLevel: "avis", memorialStatus: "draft" }, "offer_not_complete"],
    [{ actorIsOwner: true, accessLevel: null, memorialStatus: "draft" }, "offer_not_complete"],
    [{ actorIsOwner: true, accessLevel: "COMPLET", memorialStatus: "draft" }, "offer_not_complete"],
    [{ actorIsOwner: true, accessLevel: { level: "complet" }, memorialStatus: "draft" }, "offer_not_complete"],
    [{ actorIsOwner: false, accessLevel: "complet", memorialStatus: "draft" }, "not_owner"],
    [{ actorIsOwner: true, accessLevel: "complet", memorialStatus: "archived" }, "archived"],
    [{ actorIsOwner: true, accessLevel: "complet", memorialStatus: "deleted" }, "unknown_status"],
  ])("téléversement distant refusé : %o → %s", (facts, reason) => {
    expect(decideVideoUpload(facts)).toEqual({ decision: "deny", reason });
  });

  it("seul le propriétaire avec l'offre complète y a droit — et l'hébergement reste fermé tant qu'il n'est pas configuré et activé", () => {
    expect(decideVideoUpload({ actorIsOwner: true, accessLevel: "complet", memorialStatus: "published" })).toEqual({ decision: "allow" });
    expect(isVideoHostingConfigured({})).toBe(false);
    expect(isVideoHostingConfigured({ MUX_TOKEN_ID: "x", MUX_TOKEN_SECRET: "x" })).toBe(false);
  });
});
