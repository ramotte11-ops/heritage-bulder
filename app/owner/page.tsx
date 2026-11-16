import { redirect } from "next/navigation";
import { FamilyDashboard, type FamilyDashboardView } from "@/components/owner/FamilyDashboard";
import type { FamilyAttentions } from "@/components/owner/FamilyFeatures";
import { isLanguage, type Language } from "@/config/languages";
import { UNKNOWN_OWNER_FREE_PUBLICATION_STATUS } from "@/lib/adapters/owner-free-publication-status-repository";
import type { FamilySpaceRepository } from "@/lib/adapters/family-space-repository";
import { createServerMediaEngineDeps } from "@/lib/media/server-media-engine";
import type { HeritageActor } from "@/lib/auth/heritage-actor";
import { selectTribute, type FamilyTribute } from "@/lib/owner/family-space";
import { loadFamilySpace } from "@/lib/owner/load-family-space";
import { loadTributePhotos, type FamilyTributePhoto } from "@/lib/owner/load-tribute-photos";

/**
 * « Mon espace famille » — the family dashboard (Lot 1).
 *
 * The place where a family finds its tributes again, with the photograph
 * of each Hero, its real status and its actions, and the attentions
 * actually received (symbolic offerings: counters and private book).
 *
 * Every card stays the existing Builder / public-page path: this page adds
 * no way in, changes no right, writes nothing. Its reads are the existing
 * ones (`loadFamilySpace`), plus the Builder's own signed photo read.
 */
export const dynamic = "force-dynamic";

/** How many gestures the dashboard's « Carnet des attentions » previews. */
const ATTENTION_PREVIEW = 2;

function requestedLanguage(raw: string | string[] | undefined): Language | null {
  return typeof raw === "string" && isLanguage(raw) ? raw : null;
}

async function loadAttentions(repository: FamilySpaceRepository, memorialId: string): Promise<FamilyAttentions> {
  try {
    const [counts, page] = await Promise.all([
      repository.countOfferings(memorialId),
      repository.listOfferings(memorialId, { offset: 0, limit: ATTENTION_PREVIEW }),
    ]);
    return { status: "ready", counts, latest: page.offerings, hasMore: page.hasMore };
  } catch (error) {
    console.error("Owner space: attentions unavailable:", error instanceof Error ? error.message : error);
    return { status: "unavailable" };
  }
}

async function loadPhotos(
  actor: HeritageActor,
  tributes: readonly FamilyTribute[],
): Promise<Map<string, FamilyTributePhoto>> {
  try {
    return await loadTributePhotos(createServerMediaEngineDeps(), actor, tributes);
  } catch (error) {
    console.error("Owner space: photos unavailable:", error instanceof Error ? error.message : error);
    return new Map();
  }
}

export default async function OwnerPage(
  {
    searchParams = Promise.resolve({}),
  }: { searchParams?: Promise<{ langue?: string | string[]; hommage?: string | string[] }> } = {},
) {
  const space = await loadFamilySpace();
  if (space.status === "visitor") redirect("/login");

  const params = await searchParams;
  const languageParam = requestedLanguage(params.langue);
  const tributes = space.status === "ready" ? space.tributes : [];
  const language: Language =
    languageParam ?? tributes.find((tribute) => tribute.language !== null)?.language ?? "fr";

  let view: FamilyDashboardView;
  if (space.status === "ready") {
    // `?hommage=` is a claim: honoured only for one of the family's own tributes.
    const selected = selectTribute(tributes, typeof params.hommage === "string" ? params.hommage : null);
    if (selected === null) {
      view = { status: "none" };
    } else {
      const [attentions, photos] = await Promise.all([
        loadAttentions(space.repository, selected.id),
        loadPhotos(space.actor, tributes),
      ]);
      view = { status: "tributes", tributes, photos, selected, attentions };
    }
  } else {
    view = { status: space.status };
  }

  return (
    <FamilyDashboard
      language={language}
      languageParam={languageParam}
      email={space.email}
      isOwner={space.status === "ready" || (space.status === "none" && space.isOwner)}
      publication={space.status === "error" ? UNKNOWN_OWNER_FREE_PUBLICATION_STATUS : space.publication}
      view={view}
      now={new Date()}
    />
  );
}
