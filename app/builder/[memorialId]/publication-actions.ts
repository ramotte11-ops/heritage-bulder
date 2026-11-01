"use server";

import { publishFromPreviewForCurrentOwner } from "@/lib/memorial/server-publication";
import { publicationOutcomeOf } from "@/lib/memorial/publish-from-preview";
import type { PublishFromPreviewOutcome } from "@/lib/memorial/publication-preview-types";

/**
 * QG 008 Lot 3 — the confirmation of « Publier », from the private
 * Preview of the authenticated Builder only.
 *
 * It takes NO identity, NO content and NO access level from the browser:
 * only the memorial id, plus the revision, fingerprint and gallery choice
 * the Preview returned — all of which the server re-checks against the
 * stored draft (lib/memorial/publish-from-preview.ts). It answers a plain
 * outcome for the screen, never a technical message.
 */

const MAX_SELECTION = 64;

function isGallerySelection(value: unknown): value is string[] | undefined {
  return (
    value === undefined ||
    (Array.isArray(value) && value.length <= MAX_SELECTION && value.every((id) => typeof id === "string" && id.length <= 64))
  );
}

export async function publishFromPreviewAction(
  memorialId: string,
  expectedRevision: number,
  expectedDigest: string,
  gallerySelection?: string[],
): Promise<PublishFromPreviewOutcome> {
  if (
    typeof memorialId !== "string" ||
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 0 ||
    typeof expectedDigest !== "string" ||
    !/^[0-9a-f]{64}$/.test(expectedDigest) ||
    !isGallerySelection(gallerySelection)
  ) {
    return "failed";
  }
  try {
    return publicationOutcomeOf(await publishFromPreviewForCurrentOwner(memorialId, expectedRevision, expectedDigest, gallerySelection));
  } catch {
    return "failed";
  }
}
