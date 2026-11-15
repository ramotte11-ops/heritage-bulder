import Link from "next/link";
import { redirect } from "next/navigation";
import { getHeritageActor } from "@/lib/auth/heritage-session";
import { requireOwner } from "@/lib/auth/heritage-actor";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { SupabaseOwnedMemorialListRepository } from "@/lib/adapters/supabase/owned-memorial-list-repository";
import type { OwnedMemorialSummary } from "@/lib/adapters/owned-memorial-list-repository";
import {
  UNKNOWN_OWNER_FREE_PUBLICATION_STATUS,
  type OwnerFreePublicationStatus,
} from "@/lib/adapters/owner-free-publication-status-repository";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { PendingLinkLabel } from "@/components/auth/PendingLinkLabel";
import { isLanguage, type Language } from "@/config/languages";
import { translate, translateWith } from "@/lib/i18n/translate";
import { loadOwnerFreePublicationStatus } from "@/lib/memorial/load-owner-free-publication-status";
import styles from "./page.module.css";

/** The owner space: every card stays the existing Builder/public-page path. */
export const dynamic = "force-dynamic";

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

function requestedLanguage(raw: string | string[] | undefined): Language | null {
  return typeof raw === "string" && isLanguage(raw) ? raw : null;
}

function familyLanguage(requested: Language | null, memorials: readonly OwnedMemorialSummary[]): Language {
  return requested ?? memorials.find((memorial) => memorial.language !== null)?.language ?? "fr";
}

function freePublicationText(
  status: OwnerFreePublicationStatus,
  language: Language,
): string {
  switch (status.status) {
    case "window_open": {
      const until = formatDate(status.windowUntil, language);
      return until === null
        ? translate(language, "owner.freePublicationUnknown")
        : translateWith(language, "owner.freePublicationAvailable", { date: until });
    }
    case "opens_on_next_save":
      return translate(language, "owner.freePublicationAvailableOnSave");
    case "used":
      return translate(language, "owner.freePublicationUsed");
    case "expired":
      return translate(language, "owner.freePublicationExpired");
    case "unknown":
      return translate(language, "owner.freePublicationUnknown");
  }
}

export default async function OwnerPage(
  { searchParams = Promise.resolve({}) }: { searchParams?: Promise<{ langue?: string | string[] }> } = {},
) {
  let actor: Awaited<ReturnType<typeof getHeritageActor>> | null = null;
  let space: OwnerSpace;
  let publication: OwnerFreePublicationStatus = UNKNOWN_OWNER_FREE_PUBLICATION_STATUS;

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
      publication = await loadOwnerFreePublicationStatus(gate.owner.id);
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
  const now = new Date();

  return (
    <main className={styles.main} lang={language}>
      <p className={styles.eyebrow}>{translate(language, "owner.eyebrow")}</p>
      <h1 className={styles.title}>{translate(language, "owner.title")}</h1>
      {email ? <p className={styles.email}>{email}</p> : null}

      {space.status !== "error" && actor?.audience === "owner" ? (
        <section className={styles.notice} data-owner-free-summary="">
          {publication.status !== "unknown" ? (
            <p>
              {translateWith(language, "owner.activeDraftCount", {
                count: publication.activeFreeDrafts,
                max: publication.maxFreeDrafts,
              })}
            </p>
          ) : null}
          <p data-owner-free-publication={publication.status}>
            {freePublicationText(publication, language)}
          </p>
          {(publication.status === "used" || publication.status === "expired") && publication.renewsAt !== null ? (
            <p data-owner-free-renewal="">
              {translateWith(language, "owner.freePublicationRenewsAt", {
                date: formatDate(publication.renewsAt, language) ?? "",
              })}
            </p>
          ) : null}
        </section>
      ) : null}

      {space.status === "memorials" && (
        <ul className={styles.list}>
          {space.memorials.map((memorial) => {
            const createdAt = formatDate(memorial.createdAt, language);
            const storedPublishUntil = memorial.freeDeadlines?.publishUntil ?? null;
            const publishUntil =
              publication.status === "window_open" &&
              storedPublishUntil !== null &&
              Date.parse(storedPublishUntil) > now.getTime()
              ? formatDate(storedPublishUntil, language)
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
