import type { AllowedImageMimeType } from "@/config/media";
import type { SkinVariant } from "@/config/skins";
import type { DraftSaveResponse } from "@/lib/builder/draft-revision";
import type { HeroCrop } from "@/types/hero";

export interface LocalPhotoSnapshot {
  localId: string;
  blob: Blob;
  mimeType: AllowedImageMimeType;
  width: number;
  height: number;
  crop: HeroCrop | null;
}

export interface PreparedLocalPhoto {
  blob: Blob;
  mimeType: AllowedImageMimeType;
  width: number;
  height: number;
  originalFilename: string | null;
  lastModified: number | null;
}

export type LocalPhotoSaveResponse = DraftSaveResponse & { photo?: LocalPhotoSnapshot };

export interface LocalHeroPhotoPort {
  initialPhoto: LocalPhotoSnapshot | null;
  savePreparedPhoto(photo: PreparedLocalPhoto, expectedRevision: number): Promise<LocalPhotoSaveResponse>;
  completePhoto(expectedRevision: number): Promise<DraftSaveResponse>;
}

export interface LocalHeroCropPort {
  photo: LocalPhotoSnapshot;
  saveCrop(crop: HeroCrop, expectedRevision: number): Promise<DraftSaveResponse>;
  completeCrop(crop: HeroCrop, expectedRevision: number): Promise<DraftSaveResponse>;
  reopenPhoto(expectedRevision: number): Promise<DraftSaveResponse>;
}

export interface LocalHeroRevealPort {
  photo: LocalPhotoSnapshot & { crop: HeroCrop; readUrl: string };
  progress: number;
  completeReveal(skinVariant: SkinVariant, expectedRevision: number): Promise<DraftSaveResponse>;
}

export interface LocalGalleryPhotoSnapshot {
  localId: string;
  blob: Blob;
  mimeType: AllowedImageMimeType;
  width: number | null;
  height: number | null;
  caption: string | null;
}

export interface LocalGalleryEditorialItem {
  localId: string;
  caption: string | null;
}

export type LocalGallerySaveResponse = DraftSaveResponse & {
  photos?: LocalGalleryPhotoSnapshot[];
  photo?: LocalGalleryPhotoSnapshot;
};

/** IndexedDB-backed seam used by the existing Gallery workshop in guest mode. */
export interface LocalGalleryPort {
  initialPhotos: LocalGalleryPhotoSnapshot[];
  addPreparedPhoto(photo: PreparedLocalPhoto, expectedRevision: number): Promise<LocalGallerySaveResponse>;
  replacePreparedPhoto(localId: string, photo: PreparedLocalPhoto, expectedRevision: number): Promise<LocalGallerySaveResponse>;
  removePhoto(localId: string, expectedRevision: number): Promise<LocalGallerySaveResponse>;
  saveEditorial(items: readonly LocalGalleryEditorialItem[], expectedRevision: number): Promise<LocalGallerySaveResponse>;
  resolveStep(action: "continue" | "skip", expectedRevision: number): Promise<DraftSaveResponse>;
}
