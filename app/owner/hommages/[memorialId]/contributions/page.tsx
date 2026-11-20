import { notFound, redirect } from "next/navigation";
import { FamilyContributions } from "@/components/owner/FamilyContributions";
import { CONTRIBUTIONS_PAGE_SIZE, isContributionView, type ContributionView } from "@/components/owner/contributions/contribution-views";
import { isLanguage, type Language } from "@/config/languages";
import {
  getContributionSettings,
  getFamilyContributions,
  getPendingContributionCounts,
} from "@/lib/memorial/contributions/family-contribution-actions";
import { loadFamilySpace } from "@/lib/owner/load-family-space";

/**
 * Lot 3 — « Les contributions reçues » : the family's moderation of ONE
 * tribute (contract E5, Contributions des proches).
 *
 * `memorialId` is a URL claim, honoured only when it names one of the
 * tributes of the server-resolved Owner (anything else is a 404,
 * indistinguishable from an unknown id) — and every E5 action re-proves the
 * ownership from the SESSION anyway, then the database once more. No owner
 * id ever comes from the browser. Always read at request time: photographs
 * come with 5-minute signed URLs.
 */
export const dynamic = "force-dynamic";

async function settle<T>(call: () => Promise<T>): Promise<T | { status: "unavailable" }> {
  try {
    return await call();
  } catch (error) {
    console.error("Owner contributions: read failed:", error instanceof Error ? error.message : error);
    return { status: "unavailable" };
  }
}

export default async function TributeContributionsPage({
  params,
  searchParams = Promise.resolve({}),
}: {
  params: Promise<{ memorialId: string }>;
  searchParams?: Promise<{ langue?: string | string[]; vue?: string | string[] }>;
}) {
  const space = await loadFamilySpace();
  if (space.status === "visitor") redirect("/login");
  if (space.status !== "ready") notFound();

  const { memorialId } = await params;
  const tribute = space.tributes.find((candidate) => candidate.id === memorialId);
  if (!tribute) notFound();

  const query = await searchParams;
  const languageParam = typeof query.langue === "string" && isLanguage(query.langue) ? query.langue : null;
  const language: Language = languageParam ?? tribute.language ?? "fr";
  const view: ContributionView = isContributionView(query.vue) ? query.vue : "pending";

  const [list, counts, settings] = await Promise.all([
    settle(() => getFamilyContributions({ memorialId: tribute.id, status: view, limit: CONTRIBUTIONS_PAGE_SIZE })),
    settle(() => getPendingContributionCounts(tribute.id)),
    settle(() => getContributionSettings(tribute.id)),
  ]);

  const pending = counts.status === "ok" ? (counts.counts.find((row) => row.memorialId === tribute.id)?.pendingTotal ?? 0) : null;
  const withQuery = (path: string, extra: Record<string, string>) => {
    const search = new URLSearchParams({ ...(languageParam ? { langue: languageParam } : {}), ...extra }).toString();
    return search === "" ? path : `${path}?${search}`;
  };
  const pagePath = `/owner/hommages/${encodeURIComponent(tribute.id)}/contributions`;

  return (
    <FamilyContributions
      language={language}
      email={space.email}
      tribute={tribute}
      view={view}
      list={list}
      pending={pending}
      settings={settings}
      spaceHref={withQuery("/owner", { hommage: tribute.id })}
      viewHref={{
        pending: withQuery(pagePath, {}),
        published: withQuery(pagePath, { vue: "published" }),
        hidden: withQuery(pagePath, { vue: "hidden" }),
        rejected: withQuery(pagePath, { vue: "rejected" }),
      }}
    />
  );
}
