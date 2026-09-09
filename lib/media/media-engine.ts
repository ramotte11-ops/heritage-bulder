import type { MediaObjectStore } from "@/lib/adapters/media-object-store";
import type { MediaRepository } from "@/lib/adapters/media-repository";
import type { MemorialOwnershipRepository } from "@/lib/adapters/memorial-ownership-repository";

/**
 * Mission 030 — the dependencies every media primitive shares.
 *
 * ## One dependency set, one engine
 *
 * There is deliberately no `HeroMediaEngine` and no
 * `GalleryMediaEngine` (mission brief, section 15). Hero and Gallery
 * are two values of `purpose` flowing through these same primitives,
 * over the same bucket, the same paths, the same ownership check and
 * the same validation. Duplicating the engine per feature would mean
 * duplicating the security, and a security rule that exists twice is a
 * security rule that will eventually only be fixed once.
 *
 * ## Why `now` and `generateMediaId` are injected
 *
 * Both are non-deterministic, and both matter to properties that have
 * to be TESTED rather than asserted in a comment: that a reservation
 * expires exactly when the TTL says, and that a media id is
 * server-generated. Injecting them lets the tests pin time and ids
 * without mocking modules, and — more importantly — makes it
 * impossible for a caller to supply a media id of its own, because
 * there is no parameter for one anywhere in this foundation.
 */
export interface MediaEngineDeps {
  /** Resolves the ground truth for "who owns this memorial". */
  memorialOwnershipRepository: MemorialOwnershipRepository;
  mediaRepository: MediaRepository;
  objectStore: MediaObjectStore;
  /**
   * A fresh, opaque, unguessable media id. Must be a UUID —
   * lib/media/media-path.ts refuses to build a path from anything else,
   * so a weak generator fails loudly instead of producing guessable
   * paths.
   */
  generateMediaId: () => string;
  now: () => Date;
}
