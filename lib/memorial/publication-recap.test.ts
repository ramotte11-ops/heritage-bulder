import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { AssembledMemorial } from "@/lib/memorial/assembly/assemble-memorial";
import type { AssembledSection } from "@/lib/memorial/assembly/renderer-adapters";
import { lockedJourneyScreens } from "@/lib/builder/guided-flow/journey-locks";
import { translate } from "@/lib/i18n/translate";
import { PREMIUM_SECTION_IDS } from "@/lib/memorial/publication-policy";
import { FREE_NEVER_PUBLIC_SECTIONS, describePublicationRecap } from "./publication-recap";

/**
 * 05-R1 — the publication recap says only what the assembled Preview (built
 * by the server from the publication projection) and the existing rules
 * support. These tests pin each sentence to the code that makes it true.
 */

const ROOT = resolve(import.meta.dirname, "../..");

const section = (sectionId: string, rendererKey: string, props: Record<string, unknown> = {}) =>
  ({ sectionId, rendererKey, props }) as unknown as AssembledSection;

const hero = section("hero", "HeroIntemporel");
const deathNotice = section("deathNotice", "DeathNoticeV2");
const gallery = (count: number) =>
  section("gallery", "GalleryIntemporel", { media: Array.from({ length: count }, (_, i) => ({ mediaId: `m${i}` })) });
const video = (count: number, previewOnly = false) =>
  section("video", "VideoHommageV1Section", {
    items: Array.from({ length: count }, (_, i) => ({ id: `v${i}`, title: null, durationSeconds: 30 })),
    ...(previewOnly ? { requiresCompleteOffer: true } : {}),
  });
const contributions = (features: { condolences: boolean; stories: boolean; photos: boolean }) =>
  section("testimonials", "ContributionsV1Section", { features });

function assembled(sections: AssembledSection[], archivedSections: AssembledSection[] = []): AssembledMemorial {
  return { status: "assembled", sections, archivedSections, failures: [] } as unknown as AssembledMemorial;
}

describe("describePublicationRecap — free tribute", () => {
  it("never lists the prepared video as public, and counts it as private (VID-15 « aperçu seulement »)", () => {
    const recap = describePublicationRecap({
      assembled: assembled([hero, deathNotice, gallery(6), video(2, true)]),
      publication: { accessLevel: "avis" },
    });
    expect(recap.offer).toBe("free");
    expect(recap.visible.map((entry) => entry.sectionId)).toEqual(["hero", "deathNotice", "gallery"]);
    expect(recap.previewOnlyVideoCount).toBe(2);
    expect(recap.videoCount).toBeNull();
    expect(recap.galleryCount).toBe(6);
  });

  it("excludes a video section even if it were not marked (second, independent guard)", () => {
    const recap = describePublicationRecap({ assembled: assembled([hero, video(1)]), publication: { accessLevel: "avis" } });
    expect(recap.visible.map((entry) => entry.sectionId)).toEqual(["hero"]);
    expect(recap.previewOnlyVideoCount).toBe(1);
  });

  it("the free guard mirrors the publication policy's premium sections", () => {
    expect([...FREE_NEVER_PUBLIC_SECTIONS].sort()).toEqual([...PREMIUM_SECTION_IDS].sort());
  });

  it("no gallery, no video: nothing to count", () => {
    const recap = describePublicationRecap({ assembled: assembled([hero]), publication: { accessLevel: "avis" } });
    expect(recap.galleryCount).toBeNull();
    expect(recap.previewOnlyVideoCount).toBe(0);
    expect(recap.contributions).toBeNull();
  });

  it("archived death notice or ceremony stays listed, as consultable by a discreet link", () => {
    const ceremony = section("ceremony", "CeremonyV2");
    const recap = describePublicationRecap({ assembled: assembled([hero], [ceremony]), publication: { accessLevel: "avis" } });
    expect(recap.visible).toEqual([
      { sectionId: "hero", archived: false },
      { sectionId: "ceremony", archived: true },
    ]);
  });

  it("hidden, ready, non-archivable sections are private; pending or archivable ones are not listed", () => {
    const recap = describePublicationRecap({
      assembled: assembled([hero]),
      publication: { accessLevel: "avis" },
      visibility: [
        { sectionId: "story", hidden: true, ready: true, archivable: false },
        { sectionId: "traditions", hidden: true, ready: false, archivable: false },
        { sectionId: "deathNotice", hidden: true, ready: true, archivable: true },
        { sectionId: "gallery", hidden: false, ready: true, archivable: false },
      ],
    });
    expect(recap.hiddenSections).toEqual(["story"]);
  });

  it("reads the published contribution choices (A15)", () => {
    const recap = describePublicationRecap({
      assembled: assembled([hero, contributions({ condolences: true, stories: false, photos: true })]),
      publication: { accessLevel: "avis" },
    });
    expect(recap.contributions).toEqual({ condolences: true, stories: false, photos: true });
  });
});

describe("describePublicationRecap — complete tribute", () => {
  it("lists the video and counts the photographs of the gallery that will be shown", () => {
    const recap = describePublicationRecap({
      assembled: assembled([hero, gallery(24), video(3)]),
      publication: { accessLevel: "complet" },
    });
    expect(recap.offer).toBe("complete");
    expect(recap.visible.map((entry) => entry.sectionId)).toEqual(["hero", "gallery", "video"]);
    expect(recap.galleryCount).toBe(24);
    expect(recap.videoCount).toBe(3);
    expect(recap.previewOnlyVideoCount).toBe(0);
  });
});

describe("05-R1 — the recap's sentences match the implemented rules", () => {
  it("« ne peuvent plus être modifiés » lists exactly the screens locked after publication today", () => {
    // Portrait = identity (name, dates), phrase, photo, crop; ambiance = reveal;
    // announcement choice; ceremony (provisional lock: `ceremony: "unknown"`).
    // If this list changes, publish.recapLocked must change with it.
    expect(lockedJourneyScreens({ status: "published" })).toEqual([
      "identity",
      "announcementChoice",
      "phrase",
      "photo",
      "crop",
      "reveal",
      "ceremonyMoment",
      "ceremonyDateTime",
      "ceremonyVenue",
      "ceremonyAddress",
      "ceremonyProgramme",
      "ceremonyNote",
    ]);
  });

  it("45 days, 12 months and one free publication: the database settings are never changed after their seed", () => {
    // Seed (20261024180000): free_public_duration = 1080 h (45 days),
    // free_publication_quota_window = 12 months, free_publications_per_owner = 1.
    // A migration changing one of them must update publish.freeDuration / freeQuota.
    const dir = join(ROOT, "supabase/migrations");
    const seed = readFileSync(join(dir, "20261024180000_heritage_direct_access_foundation.sql"), "utf8");
    expect(seed).toMatch(/free_public_duration, free_private_extension,[\s\S]*?interval '1080 hours', interval '720 hours',\s*interval '12 months', 1, 1,/);
    for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql"))) {
      const sql = readFileSync(join(dir, file), "utf8");
      expect(sql, file).not.toMatch(/\b(free_public_duration|free_publication_quota_window|free_publications_per_owner)\s*=/);
    }
  });

  it.each(["fr", "en", "es"] as const)("%s — the durations shown are 45 days and 12 months", (language) => {
    expect(translate(language, "publish.freeDuration")).toMatch(/\b45\b/);
    expect(translate(language, "publish.freeQuota")).toMatch(/\b12\b/);
  });

  it.each(["fr", "en", "es"] as const)("%s — no ten-year, recovery or archive promise in 05-R1", (language) => {
    const keys = [
      "publish.completeTitle",
      "publish.completeGallery",
      "publish.completeVideos",
      "publish.confirmBody",
      "publish.recapLocked",
      "publish.shareTitle",
      "publish.shareLink",
      "publish.shareQr",
      "publish.shareCompleteAccess",
      "publish.shareCemetery",
    ] as const;
    for (const key of keys) {
      expect(translate(language, key)).not.toMatch(/\b10\b|\bdix\b|\bten\b|\bdiez\b|archiv|récupér|recover|recuper/i);
    }
  });
});

describe("05-R1-C — sharing: link and QR code, never a promise of permanent access", () => {
  const SHARE_KEYS = [
    "publish.shareTitle",
    "publish.shareLink",
    "publish.shareQr",
    "publish.shareFreeAccess",
    "publish.shareCompleteAccess",
    "publish.shareCemetery",
  ] as const;

  it.each(["fr", "en", "es"] as const)("%s — no « permanent », « forever » or « always » wording", (language) => {
    for (const key of SHARE_KEYS) {
      expect(translate(language, key)).not.toMatch(/permanent|permanencia|toujours|à vie|définiti|forever|always|for life|siempre|para toda|indefinid/i);
    }
  });

  it.each(["fr", "en", "es"] as const)("%s — the free tribute's link and QR code follow its 45 days", (language) => {
    expect(translate(language, "publish.shareFreeAccess")).toMatch(/\b45\b/);
  });

  it.each(["fr", "en", "es"] as const)("%s — the QR code is announced, not described as already available", (language) => {
    // No generator exists yet (05-R1-C audit): future tense, never « disponible » / « available now ».
    expect(translate(language, "publish.shareQr")).not.toMatch(/disponible|available|téléchar|download|descarg/i);
  });
});
