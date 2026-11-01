import {
  MEMORIAL_CONTENT_EDIT_TARGETS,
  type MemorialContentEditTarget,
  type MemorialMutationClaim,
} from "./edit-authorization";
import type { MemorialContent } from "@/types/memorial";

/**
 * Converts an actual stored-content diff into the business targets understood
 * by Security V1. The submitted object is never trusted to describe its own
 * changes: both sides come from the server save boundary.
 *
 * Arrays and structured values such as dates/crops are intentional atomic
 * units. Any changed path outside the explicit Lot 1 inventory is returned as
 * an unknown content target, which the policy refuses by default.
 */

const orderedContentTargets = [...MEMORIAL_CONTENT_EDIT_TARGETS].sort(
  (left, right) => right.length - left.length,
);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => jsonEqual(value, right[index]));
  }
  if (!isPlainObject(left) || !isPlainObject(right)) return false;

  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every(
    (key, index) => key === rightKeys[index] && jsonEqual(left[key], right[key]),
  );
}

export function memorialContentEqual(left: MemorialContent, right: MemorialContent): boolean {
  return jsonEqual(left, right);
}

function collectChangedPaths(left: unknown, right: unknown, path: string, result: Set<string>): void {
  if (jsonEqual(left, right)) return;

  if (isPlainObject(left) || isPlainObject(right)) {
    const leftObject = isPlainObject(left) ? left : {};
    const rightObject = isPlainObject(right) ? right : {};
    const keys = new Set([...Object.keys(leftObject), ...Object.keys(rightObject)]);
    if (keys.size === 0) {
      result.add(path);
      return;
    }
    for (const key of keys) {
      collectChangedPaths(
        leftObject[key],
        rightObject[key],
        path ? `${path}.${key}` : key,
        result,
      );
    }
    return;
  }

  result.add(path || "<root>");
}

function targetForChangedPath(path: string): string {
  return (
    orderedContentTargets.find((target) => path === target || path.startsWith(`${target}.`)) ?? path
  );
}

const HERO_PHOTO_PATH = "hero.photo";
const HERO_PHOTO_REFERENCE_TARGET = "hero.photo.mediaId" satisfies MemorialContentEditTarget;

function heroPhotoValue(content: MemorialContent): unknown {
  const hero = (content as Record<string, unknown>).hero;
  return isPlainObject(hero) ? hero.photo : undefined;
}

/** `hero.photo` absent and `hero.photo: null` both mean "no photo" (lib/memorial/hero.ts, parseHeroPhoto). */
function isNoHeroPhoto(value: unknown): boolean {
  return value === undefined || value === null;
}

/**
 * The one changed path that is a whole `hero.photo` leaf: absent ↔ `null`
 * (every Hero write of the Builder carries `photo: null` until a photo is
 * chosen, e.g. T04 on an empty draft). It claims the photo's EXISTING
 * policy target, `hero.photo.mediaId` — the reference to "no media" —
 * so it is allowed before publication and refused after it
 * (hero_locked_after_publication), like any other Hero photo change.
 * Any other whole-`hero.photo` value (a string, an array, `{}`…) stays
 * verbatim and the policy keeps failing closed on it.
 */
function claimedTarget(path: string, stored: MemorialContent, submitted: MemorialContent): string {
  if (path === HERO_PHOTO_PATH && isNoHeroPhoto(heroPhotoValue(stored)) && isNoHeroPhoto(heroPhotoValue(submitted))) {
    return HERO_PHOTO_REFERENCE_TARGET;
  }
  return targetForChangedPath(path);
}

export function changedMemorialContentMutations(
  stored: MemorialContent,
  submitted: MemorialContent,
): MemorialMutationClaim[] {
  const changedPaths = new Set<string>();
  collectChangedPaths(stored, submitted, "", changedPaths);

  const targets = new Set<string>();
  for (const path of changedPaths) {
    targets.add(claimedTarget(path, stored, submitted));
  }

  return [...targets].sort().map((target) => ({ kind: "content", target }));
}

export function changedConfigurationMutation(
  target: "language" | "skinVariant",
  stored: string | null,
  submitted: string,
): MemorialMutationClaim[] {
  return stored === submitted ? [] : [{ kind: "configuration", target }];
}
