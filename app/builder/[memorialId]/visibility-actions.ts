"use server";

import { authorizeMemorialForRequest } from "@/lib/auth/heritage-session";
import { SupabaseDraftRepository } from "@/lib/adapters/supabase/draft-repository";
import { SupabaseMemorialConfigRepository } from "@/lib/adapters/supabase/memorial-config-repository";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { SECTION_IDS, type SectionId } from "@/config/sections";
import { resolveSkinRuntime } from "@/lib/memorial/skin-runtime";
import { setSectionVisibility } from "@/lib/memorial/section-visibility";

/**
 * « Gérer les rubriques visibles » — the ONE write of
 * `memorial_drafts.content.presentation` (lib/memorial/section-visibility.ts).
 *
 * Same rules as every Guided Flow write in this route: re-authorized on
 * every call, the AUTHORIZED id only, a session-scoped client (RLS is
 * the second lock), arguments re-validated (they cross a network
 * boundary), and a refusal REJECTS — never a fabricated success.
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
): Promise<void> {
  if (!(SECTION_IDS as readonly string[]).includes(sectionId) || typeof visible !== "boolean") {
    throw new Error("Unsupported section visibility.");
  }

  const access = await authorizeMemorialForRequest(memorialId);
  if (access.status !== "granted") {
    throw new Error("Section visibility save refused.");
  }

  const supabase = await createServerSupabaseClient();
  const draftRepository = new SupabaseDraftRepository(supabase);
  const memorialConfigRepository = new SupabaseMemorialConfigRepository(supabase);

  const [config, draft] = await Promise.all([
    memorialConfigRepository.findConfigById(access.memorialId),
    draftRepository.getDraftContent(access.memorialId),
  ]);
  if (config === null || draft === null) {
    throw new Error("Section visibility save refused.");
  }

  const skin = resolveSkinRuntime(config.skin);
  const next = setSectionVisibility(
    draft.content,
    sectionId as SectionId,
    visible,
    skin.status === "resolved" ? skin.skin : null,
  );
  if (!next.ok) {
    throw new Error("This section cannot be hidden.");
  }

  await draftRepository.saveDraftContent(access.memorialId, next.content);
}
