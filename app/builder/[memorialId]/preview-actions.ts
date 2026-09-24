"use server";

import { getHeritageActor, authorizeMemorialForRequest } from "@/lib/auth/heritage-session";
import { resumeBuilderSession } from "@/lib/builder/resume-session";
import { SupabaseMemorialConfigRepository } from "@/lib/adapters/supabase/memorial-config-repository";
import { SupabaseDraftRepository } from "@/lib/adapters/supabase/draft-repository";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { createServerMediaEngineDeps } from "@/lib/media/server-media-engine";
import { resolveHeroFlowState } from "@/lib/builder/guided-flow/hero-step";
import { isPreviewUnlocked } from "@/lib/builder/guided-flow/preview-lock";
import { readHero } from "@/lib/memorial/hero";
import { resolveSkinVariantRuntime } from "@/lib/memorial/skin-runtime";
import { assembleMemorial } from "@/lib/memorial/assembly/assemble-memorial";
import { createOwnerDraftMediaResolver } from "@/lib/memorial/assembly/owner-draft-media-resolver";
import type { MemorialPreviewResult } from "@/components/builder/preview/BuilderPreviewHost";

/**
 * Étape 3 — the Preview's one read: the SAVED draft, assembled by the
 * real assembler, for the authorized Owner.
 *
 * Called by `BuilderPreviewHost` only after the step's autosave has been
 * drained, bound to `access.memorialId` by the page exactly like
 * `saveDraftAction`. It takes no content from the client: the memorial
 * row and its draft are re-read here, through the same repositories the
 * page itself uses — one source of truth, the database.
 *
 * Read-only: no write, no Hero media reconciliation (the page's own job),
 * no revalidation — so the route is never re-rendered and the Builder is
 * never unmounted by opening the Preview. Each call resolves a fresh
 * signed URL through the Owner/draft media resolver; nothing is cached.
 *
 * Fail closed: anything short of an `"assembled"` Memorial comes back as
 * `unavailable`/`locked`, never as a partial or substitute rendering.
 */
export async function loadMemorialPreviewAction(memorialId: string): Promise<MemorialPreviewResult> {
  const actor = await getHeritageActor();
  const access = await authorizeMemorialForRequest(memorialId);
  if (access.status !== "granted") {
    // Same deliberate opacity as saveDraftAction's refusal.
    throw new Error("Preview refused.");
  }

  const supabase = await createServerSupabaseClient();
  const resumed = await resumeBuilderSession(
    {
      memorialConfigRepository: new SupabaseMemorialConfigRepository(supabase),
      draftRepository: new SupabaseDraftRepository(supabase),
    },
    access.memorialId,
  );
  if (resumed.status !== "resumable") return { status: "unavailable" };

  const { memorial, draft } = resumed;
  if (memorial.language === null || memorial.editorialContext === null) return { status: "locked" };

  const content = draft.content;
  if (!isPreviewUnlocked(memorial.editorialContext, resolveHeroFlowState(content, readHero(content)))) {
    return { status: "locked" };
  }

  // `skin_variant` is not re-validated at the repository boundary.
  const variant = resolveSkinVariantRuntime(memorial.skinVariant);
  if (variant.status !== "resolved") return { status: "unavailable" };

  const assembled = await assembleMemorial(
    {
      editorialContext: memorial.editorialContext,
      skin: memorial.skin,
      skinVariant: variant.variant,
      language: memorial.language,
      content,
    },
    { resolveMedia: createOwnerDraftMediaResolver(createServerMediaEngineDeps(), actor, access.memorialId) },
  );

  if (assembled.status !== "assembled") return { status: "unavailable" };
  return { status: "ready", assembled };
}
