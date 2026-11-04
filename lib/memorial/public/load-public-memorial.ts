import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isLanguage } from "@/config/languages";
import { AVIS_SNAPSHOT_KEYS } from "@/lib/memorial/publication-policy";
import { resolveSkinVariantRuntime } from "@/lib/memorial/skin-runtime";
import { assembleMemorial, type AssembledMemorial } from "@/lib/memorial/assembly/assemble-memorial";
import type { MemorialContent } from "@/types/memorial";
import { readPublicMemorial } from "./read-public-memorial";
import { createPublicSnapshotMediaResolver, createStorageSigner, type SignStoragePath } from "./public-snapshot-media-resolver";

/**
 * QG 016 / M2 — everything the public page `/hommage/[slug]` needs, in one
 * server-side step: read the published memorial (./read-public-memorial.ts),
 * then assemble its PUBLISHED SNAPSHOT through the one existing assembler
 * (`assembleMemorial` → `MemorialAssembly`) with the public media resolver.
 * No second rendering system, no renderer touched, no new section.
 *
 * Every outcome other than a fully assembled memorial is `unavailable`, and
 * the page answers all of them with the SAME neutral 404: unknown slug,
 * not published, withdrawn, expired, malformed row, unresolvable variant
 * or language, or a Hero that cannot be assembled (QG D1). Nothing tells a
 * visitor which case it was.
 *
 * Defence in depth on the offer: an `avis` snapshot can only hold
 * `AVIS_SNAPSHOT_KEYS` (the database refuses any other key — HD403); the
 * same allow-list is applied again here before assembly, so a premium key
 * (video, testimonials, memoryMessage…) could not reach a renderer even if
 * a snapshot ever carried one. An unknown access level is `unavailable`.
 */

export type PublicMemorialView =
  | { status: "ready"; assembled: AssembledMemorial }
  | { status: "unavailable" };

export interface LoadPublicMemorialDeps {
  /** The service-role client (rpc for the read, storage for the signatures). */
  client: Pick<SupabaseClient, "rpc" | "storage">;
  /** Test seam; defaults to the private bucket signer. */
  sign?: SignStoragePath;
}

const AVIS_KEYS: ReadonlySet<string> = new Set(AVIS_SNAPSHOT_KEYS);

/** The snapshot content a public page may render for this access level, or `null`. */
export function publicContentFor(content: MemorialContent, accessLevel: unknown): MemorialContent | null {
  if (accessLevel === "complet") return content;
  if (accessLevel !== "avis") return null;
  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(content)) {
    if (AVIS_KEYS.has(key)) kept[key] = value;
  }
  return kept as MemorialContent;
}

export async function loadPublicMemorial(slug: unknown, deps: LoadPublicMemorialDeps): Promise<PublicMemorialView> {
  const read = await readPublicMemorial(deps.client, slug);
  if (read.status !== "found") return { status: "unavailable" };
  const memorial = read.memorial;

  const variant = resolveSkinVariantRuntime(memorial.skinVariant);
  if (variant.status !== "resolved") return { status: "unavailable" };
  if (typeof memorial.language !== "string" || !isLanguage(memorial.language)) return { status: "unavailable" };
  const content = publicContentFor(memorial.content, memorial.accessLevel);
  if (content === null) return { status: "unavailable" };

  const resolveMedia = createPublicSnapshotMediaResolver(memorial.media, deps.sign ?? createStorageSigner(deps.client));
  const assembled = await assembleMemorial(
    { skin: memorial.skin, skinVariant: variant.variant, language: memorial.language, content },
    { resolveMedia },
  );
  if (assembled.status !== "assembled") return { status: "unavailable" };
  return { status: "ready", assembled };
}
