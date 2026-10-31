import { createGuestDraftV3, updateGuestDraftV3, type GuestDraftPhotoAsset, type GuestDraftV3 } from "./guest-draft-v3";
import type { MemorialContent } from "@/types/memorial";

/** QG 008 Lot 2 — test fixtures only (imported by *.test.ts files). */

export const TRANSFER_KEY = "3f1c9a52-7d4e-4b8a-9c21-5e6f7a8b9c0d";
export const HERO_LOCAL_ID = "0b7c4f0e-8d1a-4c33-9a57-7f2c1e9d0a01";
export const galleryLocalId = (index: number) => `5e0c2a4b-1f3d-4e6a-8b7c-${String(index).padStart(12, "0")}`;
export const CROP = { focalX: 0.425, focalY: 0.6, zoom: 1.6 };

export function guestAsset(localId: string): GuestDraftPhotoAsset {
  return {
    localId,
    source: {
      blobRole: "prepared_high_quality",
      mimeType: "image/webp",
      sizeBytes: 1,
      dimensions: { status: "known", width: 1200, height: 1600 },
      originalFilename: `${localId}.webp`,
      lastModified: 1,
    },
    blob: new Blob([new Uint8Array([1])], { type: "image/webp" }),
  };
}

/** A guest draft past A13: Hero revealed (T06-T08), `galleryCount` photos. */
export function transferableDraft({
  galleryCount = 3,
  language = "fr" as GuestDraftV3["language"],
  skinVariant = "dark" as GuestDraftV3["skinVariant"],
  content,
}: {
  galleryCount?: number;
  language?: GuestDraftV3["language"];
  skinVariant?: GuestDraftV3["skinVariant"];
  content?: MemorialContent;
} = {}): GuestDraftV3 {
  const created = createGuestDraftV3({
    draftId: "guest-transfer-draft",
    transferKey: TRANSFER_KEY,
    now: "2026-11-01T09:00:00.000Z",
    language,
    skinVariant,
    content: content ?? ({
      hero: {
        displayName: "Madeleine Arnaud",
        birth: { precision: "year", year: 1938 },
        death: { precision: "year", year: 2026 },
        shortPhrase: "Une femme lumineuse",
        photo: null,
      },
      personWords: { text: "Institutrice pendant quarante ans." },
      guidedFlow: {
        T06: { status: "completed" },
        T07: { status: "completed" },
        T08: { status: "completed" },
        A13: { status: galleryCount > 0 ? "completed" : "skipped" },
      },
    } as unknown as MemorialContent),
  });
  if (!created.ok) throw new Error(created.reason);
  const updated = updateGuestDraftV3(created.draft, {
    now: "2026-11-01T09:01:00.000Z",
    photos: [
      { localId: HERO_LOCAL_ID, placement: { purpose: "hero", crop: CROP } },
      ...Array.from({ length: galleryCount }, (_, index) => ({
        localId: galleryLocalId(index + 1),
        placement: { purpose: "gallery" as const, caption: index === 1 ? "Été 1972" : null },
      })),
    ],
  });
  if (!updated.ok) throw new Error(updated.reason);
  return updated.draft;
}

export const serverMediaId = (index: number) => `9d8c7b6a-5f4e-4d3c-8b2a-${String(index).padStart(12, "0")}`;
