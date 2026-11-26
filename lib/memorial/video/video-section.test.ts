import { describe, expect, it } from "vitest";
import type { MemorialContent } from "@/types/memorial";
import { fullAnnouncement, recordingResolver } from "@/lib/memorial/assembly/test-fixtures";
import { assembleMemorial } from "@/lib/memorial/assembly/assemble-memorial";
import { computePublicationPreview } from "@/lib/memorial/publication-preview";
import { commitA15 } from "@/lib/builder/guided-flow/contributions-step";
import { commitA16, skipA16 } from "@/lib/builder/guided-flow/video-step";
import type { HostedVideoView } from "./hosting/hosted-video-types";
import type { LocalVideoEntry } from "./local-video-registry";
import { previewVideoItem, publicVideoItems, withPublicVideoPlayback, type PublicVideoPlayback } from "./video-section";
import type { VideoDraftItem } from "./video-content";

/**
 * VID-08 — la rubrique vidéo dans le mémorial assemblé : ordre, conditions,
 * aperçu honnête, page publique restreinte à ce que le serveur a signé.
 */

const ITEMS: VideoDraftItem[] = [
  { id: "v-a", title: "Mariage", durationSeconds: 40 },
  { id: "v-b", title: null, durationSeconds: 12 },
];

function ok<T>(result: { ok: true; content: T } | { ok: false }): T {
  if (!result.ok) throw new Error("fixture");
  return result.content;
}

/** Hommage complet prêt : Contributions (A15) puis Vidéo (A16) traitées. */
function withContributionsAndVideos(items: readonly VideoDraftItem[] = ITEMS, a16: "commit" | "skip" | "pending" = "commit"): MemorialContent {
  const base = ok(commitA15(fullAnnouncement(), { condolences: true, stories: true, photos: false }));
  if (a16 === "pending") return { ...base, video: { items } } as MemorialContent;
  return a16 === "commit" ? ok(commitA16(base, items)) : ok(skipA16({ ...base, video: { items } } as MemorialContent));
}

async function assemble(content: MemorialContent, language: "fr" | "en" = "fr") {
  return assembleMemorial({ skin: "intemporel", skinVariant: "dark", content, language }, { resolveMedia: recordingResolver().resolve });
}

const signed = (id: string): PublicVideoPlayback => ({
  hlsUrl: `https://stream.mux.com/${id}.m3u8?token=t`,
  posterUrl: `https://image.mux.com/${id}/thumbnail.webp?token=t`,
  mp4Url: null,
  expiresAt: "2026-11-25T14:00:00.000Z",
  durationSeconds: 39.9,
});

describe("VID-08 — la rubrique dans le mémorial assemblé", () => {
  it("ordre PO : … Offrandes → Contributions des proches → Vidéo ; aucune rubrique Condoléances autonome", async () => {
    const assembled = await assemble(withContributionsAndVideos());
    const ids = assembled.sections.map((s) => s.sectionId);
    expect(ids.slice(-3)).toEqual(["symbolicOfferings", "testimonials", "video"]);
    expect(ids).not.toContain("condolences");
    expect(new Set(ids).size).toBe(ids.length);
    const video = assembled.sections.find((s) => s.sectionId === "video")!;
    expect(video.rendererKey).toBe("VideoHommageV1Section");
    // Seules les descriptions : jamais d'adresse ni de lecture dans le contenu assemblé.
    expect(video.props).toEqual({ skinVariant: "dark", language: "fr", items: ITEMS });
  });

  it("« Passer cette étape » garde les vidéos déjà préparées ; A16 en cours : pas encore de rubrique", async () => {
    expect((await assemble(withContributionsAndVideos(ITEMS, "skip"))).sections.map((s) => s.sectionId)).toContain("video");
    expect((await assemble(withContributionsAndVideos(ITEMS, "pending"))).sections.map((s) => s.sectionId)).not.toContain("video");
  });

  it("sans vidéo, ou contenu illisible : pas de rubrique (jamais de lecteur vide)", async () => {
    expect((await assemble(withContributionsAndVideos([]))).sections.map((s) => s.sectionId)).not.toContain("video");
    const corrupted = { ...withContributionsAndVideos(), video: { items: "x" } } as unknown as MemorialContent;
    expect((await assemble(corrupted)).sections.map((s) => s.sectionId)).not.toContain("video");
  });

  it.each(["en", "es"] as const)("VID-09 — hommage en %s : la rubrique existe, dans le même ordre, et les titres de la famille sont gardés tels quels", async (language) => {
    const assembled = await assembleMemorial(
      { skin: "intemporel", skinVariant: "light", content: withContributionsAndVideos(), language },
      { resolveMedia: recordingResolver().resolve },
    );
    const ids = assembled.sections.map((s) => s.sectionId);
    expect(ids.slice(-3)).toEqual(["symbolicOfferings", "testimonials", "video"]);
    const video = assembled.sections.find((s) => s.sectionId === "video")!;
    expect(video.props).toMatchObject({ language, items: ITEMS });
  });

  it("aperçu de publication : offre complète avec la rubrique, offre gratuite sans (et signalée premium)", () => {
    const content = withContributionsAndVideos();
    const complete = computePublicationPreview({ draft: content, accessLevel: "complet", skin: "intemporel" });
    const free = computePublicationPreview({ draft: content, accessLevel: "avis", skin: "intemporel" });
    expect(complete.ok && (complete.projection.content as { video?: unknown }).video).toEqual({ items: ITEMS });
    expect(free.ok && "video" in free.projection.content).toBe(false);
    expect(free.ok && free.premiumSections).toContain("video");
  });
});

describe("VID-08 — page publique : seulement ce que le serveur a signé", () => {
  it("ordre de la copie publiée, durée mesurée, lecture signée ; une vidéo non signée est absente", () => {
    const shown = publicVideoItems(ITEMS, { "v-b": signed("pb-b") });
    expect(shown).toEqual([
      {
        id: "v-b",
        title: null,
        durationSeconds: 39.9,
        status: "ready",
        source: { kind: "stream", url: "https://stream.mux.com/pb-b.m3u8?token=t", posterUrl: "https://image.mux.com/pb-b/thumbnail.webp?token=t", expiresAt: "2026-11-25T14:00:00.000Z" },
      },
    ]);
    expect(publicVideoItems(ITEMS, {})).toEqual([]);
    // Une clé héritée de l'objet (prototype) n'est jamais prise pour une lecture.
    expect(publicVideoItems([{ id: "toString", title: null, durationSeconds: 1 }], {})).toEqual([]);
  });

  it("la rubrique reçoit seulement ses propres lectures ; sans vidéo lisible, elle est retirée, les autres restent", () => {
    const sections = [
      { sectionId: "testimonials", rendererKey: "ContributionsV1Section", props: {} },
      { sectionId: "video", rendererKey: "VideoHommageV1Section", props: { skinVariant: "light", language: "fr", items: ITEMS } },
    ];
    const kept = withPublicVideoPlayback(sections, { "v-a": signed("pb-a"), "v-zz": signed("pb-zz") });
    expect(kept.map((s) => s.sectionId)).toEqual(["testimonials", "video"]);
    expect((kept[1]!.props as { publicPlayback: unknown }).publicPlayback).toEqual({ "v-a": signed("pb-a") });
    expect(withPublicVideoPlayback(sections, {}).map((s) => s.sectionId)).toEqual(["testimonials"]);
  });
});

describe("VID-08 — aperçu du Builder : un état honnête pour chaque vidéo", () => {
  const item: VideoDraftItem = { id: "v-a", title: "Mariage", durationSeconds: 40 };
  const local = (playable = true): LocalVideoEntry => ({ url: "blob:local/a", metadata: { durationSeconds: 40, width: 1, height: 1, playable }, file: null });
  const view = (patch: Partial<HostedVideoView>): HostedVideoView => ({
    videoId: "11111111-1111-4111-8111-111111111111",
    draftVideoId: "v-a",
    state: "ready",
    durationSeconds: 39.5,
    durationVerified: true,
    failure: null,
    uploadExpiresAt: null,
    playback: { hlsUrl: "https://stream.mux.com/p.m3u8?token=t", posterUrl: "https://image.mux.com/p.webp?token=t", mp4Url: null, expiresAt: "2026-11-25T14:00:00.000Z" },
    ...patch,
  });

  it("fichier encore sur l'appareil : lecture locale (jamais présentée comme hébergée), même si une version hébergée existe", () => {
    expect(previewVideoItem(item, local(), null)).toMatchObject({ status: "ready", source: { kind: "local", url: "blob:local/a" } });
    expect(previewVideoItem(item, local(), view({}))).toMatchObject({ status: "ready", source: { kind: "local" } });
    expect(previewVideoItem(item, local(false), null).status).toBe("error");
  });

  it("plus de fichier local : la version hébergée prête de la famille, avec sa durée mesurée", () => {
    expect(previewVideoItem(item, null, view({}))).toMatchObject({ status: "ready", durationSeconds: 39.5, source: { kind: "stream", url: "https://stream.mux.com/p.m3u8?token=t" } });
  });

  it("en cours de mise en forme : « en préparation » ; ni fichier ni version prête : « à sélectionner de nouveau »", () => {
    expect(previewVideoItem(item, null, view({ state: "processing", playback: null })).status).toBe("preparing");
    expect(previewVideoItem(item, null, view({ state: "uploading", playback: null })).status).toBe("local-unavailable");
    expect(previewVideoItem(item, null, null).status).toBe("local-unavailable");
  });

  it("refusée par l'hébergement (durée, nombre) : jamais montrée comme si elle allait être publiée", () => {
    for (const failure of ["over_total_duration", "too_many_videos", "duration_unavailable", "asset_errored"] as const) {
      expect(previewVideoItem(item, local(), view({ state: "failed", failure, playback: null })).status).toBe("error");
    }
    // Un envoi seulement interrompu ne condamne pas la vidéo locale.
    expect(previewVideoItem(item, local(), view({ state: "failed", failure: "upload_cancelled", playback: null })).status).toBe("ready");
  });
});
