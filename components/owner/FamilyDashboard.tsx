import Link from "next/link";
import type { Language } from "@/config/languages";
import type { OwnerFreePublicationStatus } from "@/lib/adapters/owner-free-publication-status-repository";
import { translate, translateWith } from "@/lib/i18n/translate";
import { canCreateTribute, type FamilyTribute } from "@/lib/owner/family-space";
import type { FamilyTributePhoto } from "@/lib/owner/load-tribute-photos";
import { PlusIcon } from "./FamilyIcons";
import {
  AttentionsCard,
  ContributionsCard,
  OfferingsCard,
  TributeSwitcher,
  type FamilyAttentions,
} from "./FamilyFeatures";
import { FamilyShell } from "./FamilyShell";
import { TributeCard } from "./TributeCard";
import styles from "./FamilySpace.module.css";

const DATE_LOCALES: Record<Language, string> = { fr: "fr-FR", en: "en-GB", es: "es-ES" };

function formatDate(iso: string, language: Language): string | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat(DATE_LOCALES[language], { dateStyle: "long", timeZone: "Europe/Paris" }).format(date);
}

/** The account's free publication right, in the official wording (QG 017 A2). */
function freePublicationText(status: OwnerFreePublicationStatus, language: Language): string {
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

/** The real stored deadlines of one tribute — same rule as before: the
 * free publication date only while the ACCOUNT's window is open. */
function tributeNotes(
  tribute: FamilyTribute,
  publication: OwnerFreePublicationStatus,
  language: Language,
  now: Date,
): { kind: "publish" | "draft"; text: string }[] {
  const notes: { kind: "publish" | "draft"; text: string }[] = [];
  const publishUntil = tribute.freeDeadlines?.publishUntil ?? null;
  if (publication.status === "window_open" && publishUntil !== null && Date.parse(publishUntil) > now.getTime()) {
    const date = formatDate(publishUntil, language);
    if (date) notes.push({ kind: "publish", text: translateWith(language, "owner.publishUntil", { date }) });
  }
  const draftUntil = tribute.freeDeadlines?.draftUntil ?? null;
  if (draftUntil !== null) {
    const date = formatDate(draftUntil, language);
    if (date) notes.push({ kind: "draft", text: translateWith(language, "owner.draftUntil", { date }) });
  }
  return notes;
}

export type FamilyDashboardView =
  | {
      status: "tributes";
      tributes: readonly FamilyTribute[];
      photos: ReadonlyMap<string, FamilyTributePhoto>;
      selected: FamilyTribute;
      attentions: FamilyAttentions;
    }
  | { status: "none" }
  | { status: "error" };

/**
 * Espace famille — the dashboard itself, as pure presentation: everything
 * it shows was resolved by the page (session, tributes, photos, counters).
 * Used by `/owner` with real data, and by the development-only pilot with
 * illustrative data for visual review.
 */
export function FamilyDashboard({
  language,
  languageParam,
  email,
  isOwner,
  publication,
  view,
  now,
}: {
  language: Language;
  /** `?langue=` as explicitly requested, kept on the space's own links. */
  languageParam: Language | null;
  email: string | null;
  isOwner: boolean;
  publication: OwnerFreePublicationStatus;
  view: FamilyDashboardView;
  now: Date;
}) {
  const query = (params: Record<string, string>) => {
    const search = new URLSearchParams({ ...(languageParam ? { langue: languageParam } : {}), ...params });
    const text = search.toString();
    return text === "" ? "" : `?${text}`;
  };
  const mayCreate = canCreateTribute(publication);

  const createEntry = (
    <div className={styles.create}>
      {mayCreate ? (
        <Link href="/creer" prefetch={false} className={`${styles.pill} ${styles.pillWide}`} data-create-tribute="">
          <PlusIcon className={styles.pillIcon} />
          {translate(language, "owner.createTribute")}
        </Link>
      ) : (
        <span className={`${styles.pill} ${styles.pillWide}`} aria-disabled="true" data-create-tribute="limit">
          <PlusIcon className={styles.pillIcon} />
          {translate(language, "owner.createTribute")}
        </span>
      )}
    </div>
  );

  return (
    <FamilyShell
      language={language}
      email={email}
      title={translate(language, "owner.spaceTitle")}
      homeHref={`/owner${query({})}`}
    >
      {view.status === "error" ? (
        <p role="alert" className={styles.alert}>
          {translate(language, "owner.loadFailed")}
        </p>
      ) : (
        <section className={styles.tributes} aria-labelledby="family-tributes">
          <h2 id="family-tributes" className={styles.sectionHead}>
            {translate(language, "owner.tributesHeading")}
          </h2>

          {isOwner ? (
            <div className={styles.notes} data-owner-free-summary="">
              {publication.status !== "unknown" ? (
                <p>
                  {translateWith(language, "owner.activeDraftCount", {
                    count: publication.activeFreeDrafts,
                    max: publication.maxFreeDrafts,
                  })}
                </p>
              ) : null}
              {!mayCreate && publication.status !== "unknown" ? (
                <p data-create-limit="">
                  {translateWith(language, "owner.createLimit", { max: publication.maxFreeDrafts })}
                </p>
              ) : null}
              <p data-owner-free-publication={publication.status}>{freePublicationText(publication, language)}</p>
              {(publication.status === "used" || publication.status === "expired") && publication.renewsAt !== null ? (
                <p data-owner-free-renewal="">
                  {translateWith(language, "owner.freePublicationRenewsAt", {
                    date: formatDate(publication.renewsAt, language) ?? "",
                  })}
                </p>
              ) : null}
            </div>
          ) : null}

          {view.status === "tributes" ? (
            <ul className={styles.list}>
              {view.tributes.map((tribute) => (
                <li key={tribute.id}>
                  <TributeCard
                    tribute={tribute}
                    photo={view.photos.get(tribute.id) ?? null}
                    language={language}
                    notes={tributeNotes(tribute, publication, language, now)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <div className={`${styles.list} ${styles.empty}`}>
              <p>{translate(language, "owner.none")}</p>
              <Link href="/activate" className={styles.textLink}>
                {translate(language, "owner.activate")}
              </Link>
            </div>
          )}

          {createEntry}
        </section>
      )}

      {view.status === "tributes" ? (
        <>
          <hr className={styles.rule} />
          <TributeSwitcher
            tributes={view.tributes}
            selectedId={view.selected.id}
            language={language}
            hrefFor={(tributeId) => `/owner${query({ hommage: tributeId })}`}
          />
          <div className={styles.features} data-family-features={view.selected.id}>
            <ContributionsCard language={language} />
            <OfferingsCard attentions={view.attentions} language={language} />
            <AttentionsCard
              attentions={view.attentions}
              tribute={view.selected}
              language={language}
              journalHref={`/owner/hommages/${encodeURIComponent(view.selected.id)}/attentions${query({})}`}
            />
          </div>
        </>
      ) : null}
    </FamilyShell>
  );
}
