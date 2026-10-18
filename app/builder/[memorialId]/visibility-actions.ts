"use server";

import { authorizeMemorialForRequest } from "@/lib/auth/heritage-session";
import { MemorialEditConflictError } from "@/lib/adapters/memorial-edit-repository";
import { createSupabaseMemorialEditRepository } from "@/lib/adapters/supabase/memorial-edit-repository";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { SECTION_IDS, type SectionId } from "@/config/sections";
import { resolveSkinRuntime } from "@/lib/memorial/skin-runtime";
import { isSectionHidden, setSectionVisibility } from "@/lib/memorial/section-visibility";
import { commitAuthorizedDraftEdit } from "@/lib/memorial/persist-edit";
import type { DraftSaveResponse } from "@/lib/builder/draft-revision";

/**
 * « Gérer les rubriques visibles » — the ONE write of
 * `memorial_drafts.content.presentation` (lib/memorial/section-visibility.ts).
 *
 * Same rules as every Guided Flow write in this route: re-authorized on
 * every call, the AUTHORIZED id only, arguments re-validated (they cross
 * a network boundary), and a refusal REJECTS — never a fabricated
 * success. The shared atomic RPC prevents this write from replacing a
 * concurrent autosave.
 *
 * It re-reads the SAVED draft and changes nothing but
 * `presentation.hiddenSections`: hiding never deletes, showing again
 * restores the section exactly. The caller drains the current screen's
 * autosave first (`JourneyNavigation.visibility.setVisible`), so the
 * draft read here already holds the family's latest answers; and since
 * `saveDraftAction` keeps the stored `presentation`, no later autosave
 * from a screen mounted before this change can revert it.
 */
export async function saveSectionVisibilityAction(
  memorialId: string,
  sectionId: string,
  visible: boolean,
  expectedRevision: number,
): Promise<DraftSaveResponse> {
  if (!(SECTION_IDS as readonly string[]).includes(sectionId) || typeof visible !== "boolean") {
    throw new Error("Unsupported section visibility.");
  }
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw new Error("Unsupported draft revision.");
  }

  const access = await authorizeMemorialForRequest(memorialId);
  if (access.status !== "granted") {
    throw new Error("Section visibility save refused.");
  }

  const supabase = await createServerSupabaseClient();
  const editRepository = createSupabaseMemorialEditRepository(supabase);
  const snapshot = await editRepository.load(access.memorialId);
  if (snapshot === null) {
    throw new Error("Section visibility save refused.");
  }

  const skin = resolveSkinRuntime(snapshot.skin);
  const next = setSectionVisibility(
    snapshot.draft.content,
    sectionId as SectionId,
    visible,
    skin.status === "resolved" ? skin.skin : null,
  );
  if (!next.ok) {
    throw new Error("This section cannot be hidden.");
  }

  const unchanged = isSectionHidden(snapshot.draft.content, sectionId as SectionId) === !visible;
  try {
    const result = await commitAuthorizedDraftEdit({
      repository: editRepository,
      access,
      snapshot,
      expectedRevision,
      content: next.content,
      operation: "visibility.changed",
      mutations: unchanged ? [] : [{ kind: "visibility", target: sectionId }],
    });
    return { status: "saved", ...result };
  } catch (error) {
    if (
      error instanceof MemorialEditConflictError ||
      (typeof error === "object" && error !== null && "code" in error && error.code === "MEMORIAL_EDIT_CONFLICT")
    ) {
      return { status: "conflict" };
    }
    throw error;
  }
}
