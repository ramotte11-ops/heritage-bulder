import Link from "next/link";
import { redirect } from "next/navigation";
import { getHeritageActor } from "@/lib/auth/heritage-session";
import { requireOwner } from "@/lib/auth/heritage-actor";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { SupabaseOwnedMemorialListRepository } from "@/lib/adapters/supabase/owned-memorial-list-repository";
import type { OwnedMemorialSummary } from "@/lib/adapters/owned-memorial-list-repository";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { PendingLinkLabel } from "@/components/auth/PendingLinkLabel";
import { isLanguage, type Language } from "@/config/languages";
import { translate, translateWith } from "@/lib/i18n/translate";
import styles from "./page.module.css";

/** The owner space: every card stays the existing Builder/public-page path. */
export const dynamic = "force-dynamic";

const MAX_FREE_DRAFTS = 3;
const DATE_LOCALES: Record<Language, string> = {
  fr: "fr-FR",
  en: "en-GB",
  es: "es-ES",
};

function formatDate(iso: string, language: Language): string | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat(DATE_LOCALES[language], {
        dateStyle: "long",
        timeZone: "Europe/Paris",
      }).format(date);
}

type OwnerSpace =
  | { status: "memorials"; memorials: OwnedMemorialSummary[] }
  | { status: "none" }
  | { status: "error" };

type FreePublicationStatus =
  | { status: "available"; until: string }
  | { status: "available_on_save" }
  | { status: "used" }
  | { status: "expired" };

function requestedLanguage(raw: string | string[] | undefined): Language | null {
  return typeof raw === "string" && isLanguage(raw) ? raw : null;
}

function familyLanguage(requested: Language | null, memorials: readonly OwnedMemorialSummary[]): Language {
  return requested ?? memorials.find((memorial) => memorial.language !== null)?.language ?? "fr";
}

/**
 * QG 017 — display-only account state derived from the account's own real
 * memorial timestamps. No deadline is created or extended here.
 */
function freePublicationStatus(memorials: readonly OwnedMemorialSummary[], now: Date): FreePublicationStatus {
  const cycleStart = new Date(now);
  cycleStart.setUTCFullYear(cycleStart.getUTCFullYear() - 1);
  if (
    memorials.some(
      (memorial) =>
        memorial.freeFirstPublishedAt !== null &&
        Date.parse(memorial.freeFirstPublishedAt) > cycleStart.getTime(),
    )
  ) {
    return { status: "used" };
  }

  const available = memorials
    .filter((memorial) => memorial.activeFreeDraft)
    .map((memorial) => memorial.freeDeadlines?.publishUntil ?? null)
    .filter((until): until is string => until !== null && Date.parse(until) > now.getTime())
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0];
  if (available !== undefined) return { status: "available", until: available };

  const hasFreeHistory = memorials.some(
    (memorial) => memorial.activeFreeDraft || memorial.freeDeadlines != null || memorial.freeFirstPublishedAt !== null,
  );
  return hasFreeHistory ? { status: "expired" } : { status: "available_on_save" };
}

function freePublicationText(
  status: FreePublicationStatus,
  language: Language,
): string {
  switch (status.status) {
    case "available": {
      const until = formatDate(status.until, language);
      return until === null
        ? translate(language, "owner.freePublicationExpired")
        : translateWith(language, "owner.freePublicationAvailable", { date: until });
    }
    case "available_on_save":
      return translate(language, "owner.freePublicationAvailableOnSave");
    case "used":
      return translate(language, "owner.freePublicationUsed");
    case "expired":
      return translate(language, "owner.freePublicationExpired");
  }
}

export default async function OwnerPage(
  { searchParams = Promise.resolve({}) }: { searchParams?: Promise<{ langue?: string | string[] }> } = {},
) {
  let actor: Awaited<ReturnType<typeof getHeritageActor>> | null = null;
  let space: OwnerSpace;

  try {
    actor = await getHeritageActor();
  } catch (error) {
    console.error("Owner space: actor resolution failed:", error instanceof Error ? error.message : error);
  }

  if (actor && actor.audience === "visitor") redirect("/login");

  if (!actor) {
    space = { status: "error" };
  } else {
    const gate = requireOwner(actor);
    if (gate.status !== "granted") {
      space = { status: "none" };
    } else {
      try {
        const repository = new SupabaseOwnedMemorialListRepository(await createServerSupabaseClient());
        const memorials = await repository.listOwnedMemorials(gate.owner.id);
        space = memorials.length > 0 ? { status: "memorials", memorials } : { status: "none" };
      } catch (error) {
        console.error("Owner space: memorial list failed:", error instanceof Error ? error.message : error);
        space = { status: "error" };
      }
    }
  }

  const memorials = space.status === "memorials" ? space.memorials : [];
  const language = familyLanguage(requestedLanguage((await searchParams).langue), memorials);
  const email = actor?.identity?.email ?? null;
  const activeFreeDrafts = memorials.filter((memorial) => memorial.activeFreeDraft).length;
  const publication = freePublicationStatus(memorials, new Date());

  return (
    <main className={styles.main} lang={language}>
      <p className={styles.eyebrow}>{translate(language, "owner.eyebrow")}</p>
      <h1 className={styles.title}>{translate(language, "owner.title")}</h1>
      {email ? <p className={styles.email}>{email}</p> : null}

      {space.status !== "error" && actor?.audience === "owner" ? (
        <section className={styles.notice} data-owner-free-summary="">
          <p>
            {translateWith(language, "owner.activeDraftCount", {
              count: activeFreeDrafts,
              max: MAX_FREE_DRAFTS,
            })}
          </p>
          <p data-owner-free-publication={publication.status}>
            {freePublicationText(publication, language)}
          </p>
        </section>
      ) : null}

      {space.status === "memorials" && (
        <ul className={styles.list}>
          {space.memorials.map((memorial) => {
            const createdAt = formatDate(memorial.createdAt, language);
            const publishUntil = memorial.freeDeadlines?.publishUntil
              ? formatDate(memorial.freeDeadlines.publishUntil, language)
              : null;
            const draftUntil = memorial.freeDeadlines?.draftUntil
              ? formatDate(memorial.freeDeadlines.draftUntil, language)
              : null;
            return (
              <li key={memorial.id} className={styles.item}>
                <p className={styles.itemName}>{memorial.displayName ?? translate(language, "owner.defaultName")}</p>
                {createdAt ? (
                  <p className={styles.itemMeta}>{translateWith(language, "owner.createdAt", { date: createdAt })}</p>
                ) : null}
                {publishUntil ? (
                  <p className={styles.itemMeta} data-free-deadline="publish">
                    {translateWith(language, "owner.publishUntil", { date: publishUntil })}
                  </p>
                ) : null}
                {draftUntil ? (
                  <p className={styles.itemMeta} data-free-deadline="draft">
                    {translateWith(language, "owner.draftUntil", { date: draftUntil })}
                  </p>
                ) : null}
                <Link href={`/builder/${encodeURIComponent(memorial.id)}`} className={styles.itemLink}>
                  <PendingLinkLabel pendingLabel={translate(language, "owner.openingBuilder")}>
                    {translate(language, "owner.openBuilder")}
                  </PendingLinkLabel>
                </Link>
                {memorial.publicSlug ? (
                  <Link
                    href={`/hommage/${encodeURIComponent(memorial.publicSlug)}`}
                    prefetch={false}
                    className={styles.itemLink}
                  >
                    {translate(language, "owner.viewTribute")}
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {space.status === "none" && (
        <>
          <p className={styles.notice}>{translate(language, "owner.none")}</p>
          <Link href="/activate" className={styles.itemLink}>
            {translate(language, "owner.activate")}
          </Link>
        </>
      )}

      {space.status === "error" && (
        <p role="alert" className={styles.notice}>
          {translate(language, "owner.loadFailed")}
        </p>
      )}

      <LogoutButton />
    </main>
  );
}
