import { notFound, redirect } from "next/navigation";
import { AttentionsJournal } from "@/components/owner/AttentionsJournal";
import { isLanguage, type Language } from "@/config/languages";
import type { FamilyOfferingCounts, FamilyOfferingPage } from "@/lib/adapters/family-space-repository";
import { loadFamilySpace } from "@/lib/owner/load-family-space";

/**
 * « Carnet des attentions » — the private book of one tribute: every
 * symbolic gesture actually received, newest first, with its date.
 *
 * Private by construction: `memorialId` is a URL claim, honoured only when
 * it names one of the tributes of the server-resolved Owner (anything else
 * is a 404, indistinguishable from an unknown id), and the gestures are
 * read under the family's own session (`symbolic_offerings_select_own`).
 * Nothing here is ever shown on the public tribute.
 */
export const dynamic = "force-dynamic";

const ATTENTIONS_PER_PAGE = 30;

function pageNumber(raw: string | string[] | undefined): number {
  if (typeof raw !== "string" || !/^\d{1,4}$/.test(raw)) return 1;
  return Math.max(1, Number(raw));
}

export default async function TributeAttentionsPage({
  params,
  searchParams = Promise.resolve({}),
}: {
  params: Promise<{ memorialId: string }>;
  searchParams?: Promise<{ langue?: string | string[]; page?: string | string[] }>;
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
  const page = pageNumber(query.page);

  let counts: FamilyOfferingCounts | null = null;
  let offerings: FamilyOfferingPage | null = null;
  try {
    [counts, offerings] = await Promise.all([
      space.repository.countOfferings(tribute.id),
      space.repository.listOfferings(tribute.id, {
        offset: (page - 1) * ATTENTIONS_PER_PAGE,
        limit: ATTENTIONS_PER_PAGE,
      }),
    ]);
  } catch (error) {
    console.error("Owner space: attentions unavailable:", error instanceof Error ? error.message : error);
  }

  const base: Record<string, string> = languageParam ? { langue: languageParam } : {};
  const withQuery = (path: string, extra: Record<string, string>) => {
    const search = new URLSearchParams({ ...base, ...extra }).toString();
    return search === "" ? path : `${path}?${search}`;
  };
  const spaceHref = withQuery("/owner", { hommage: tribute.id });
  const pageHref = (target: number) =>
    withQuery(
      `/owner/hommages/${encodeURIComponent(tribute.id)}/attentions`,
      target > 1 ? { page: String(target) } : {},
    );

  return (
    <AttentionsJournal
      language={language}
      email={space.email}
      tribute={tribute}
      counts={counts}
      offerings={offerings}
      spaceHref={spaceHref}
      newerHref={page > 1 ? pageHref(page - 1) : null}
      olderHref={offerings?.hasMore ? pageHref(page + 1) : null}
    />
  );
}
