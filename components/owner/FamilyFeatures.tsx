import Link from "next/link";
import { OFFERING_KINDS, type OfferingKind } from "@/config/symbolic-offerings-v1-tokens";
import type { Language } from "@/config/languages";
import type { FamilyOffering, FamilyOfferingCounts } from "@/lib/adapters/family-space-repository";
import type { TranslationKey } from "@/lib/i18n/keys";
import { translate, translateWith } from "@/lib/i18n/translate";
import type { FamilyTribute } from "@/lib/owner/family-space";
import { ArrowIcon, BookIcon, GiftIcon, MessageIcon, OfferingIcon } from "./FamilyIcons";
import styles from "./FamilySpace.module.css";

/** Display order of the Studio mockup: cœur, bougie, fleur. */
const COUNTER_ORDER: readonly OfferingKind[] = ["coeur", "bougie", "lys"];

const COUNTER_LABELS: Record<OfferingKind, TranslationKey> = {
  coeur: "owner.offeringCoeur",
  bougie: "owner.offeringBougie",
  lys: "owner.offeringLys",
};

const ATTENTION_LABELS: Record<OfferingKind, TranslationKey> = {
  coeur: "owner.attentionCoeur",
  bougie: "owner.attentionBougie",
  lys: "owner.attentionLys",
};

/** Lot 2 — the same gestures, signed by the visitor (Carnet only, private). */
const SIGNED_ATTENTION_LABELS: Record<OfferingKind, TranslationKey> = {
  coeur: "owner.attentionCoeurSigned",
  bougie: "owner.attentionBougieSigned",
  lys: "owner.attentionLysSigned",
};

const DATE_LOCALES: Record<Language, string> = { fr: "fr-FR", en: "en-GB", es: "es-ES" };

/** « 15 nov. 2026 » — the family's language, Paris time like the rest of the space. */
export function formatAttentionDate(iso: string, language: Language): string | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat(DATE_LOCALES[language], { dateStyle: "medium", timeZone: "Europe/Paris" }).format(date);
}

/** What the dashboard knows about the selected tribute's attentions. */
export type FamilyAttentions =
  | { status: "ready"; counts: FamilyOfferingCounts; latest: readonly FamilyOffering[]; hasMore: boolean }
  | { status: "unavailable" };

/**
 * « Pour : … » — which tribute the three cards below speak about. Plain
 * links (no script): the choice is a URL claim the page validates against
 * the family's own tributes. Rendered only when there are several.
 */
export function TributeSwitcher({
  tributes,
  selectedId,
  language,
  hrefFor,
}: {
  tributes: readonly FamilyTribute[];
  selectedId: string;
  language: Language;
  hrefFor: (tributeId: string) => string;
}) {
  if (tributes.length < 2) return null;
  return (
    <nav className={styles.switcher} aria-label={translate(language, "owner.switcherLabel")} data-tribute-switcher="">
      <span>{translate(language, "owner.switcherLabel")}</span>
      <ul className={styles.switcherList}>
        {tributes.map((tribute) => (
          <li key={tribute.id}>
            <Link
              href={hrefFor(tribute.id)}
              scroll={false}
              className={styles.switcherLink}
              aria-current={tribute.id === selectedId ? "true" : undefined}
            >
              {tribute.displayName ?? translate(language, "owner.defaultName")}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * « Gérer les contributions ». Lot 1 : la rubrique publique de dépôt
 * n'existe pas encore (Lot 3) ; la carte tient sa place sans simuler une
 * fonction — pas de lien, « Bientôt disponible ».
 */
/** Lot 3 — what the dashboard knows about the selected tribute's contributions. */
export type FamilyContributionsSummary = { status: "ready"; pending: number } | { status: "unavailable" };

/**
 * « Gérer les contributions » (Lot 3) — the real number of stories and
 * photographs awaiting the family's approval (condolences are published at
 * once and never counted, contract E5 § 3.1), and the way to the tribute's
 * contributions page. An unreadable count is said plainly; the way in stays.
 */
export function ContributionsCard({
  language,
  summary,
  href,
}: {
  language: Language;
  summary: FamilyContributionsSummary;
  href: string;
}) {
  const pending = summary.status === "ready" ? summary.pending : null;
  return (
    <section className={styles.feature} data-feature="contributions" data-available="true">
      <div className={styles.featureHead}>
        <MessageIcon className={styles.featureIcon} />
        <h2 className={styles.featureTitle}>{translate(language, "owner.contributionsTitle")}</h2>
        <ArrowIcon className={styles.featureArrow} />
      </div>
      <p className={styles.featureBody}>{translate(language, "owner.contributionsBody")}</p>
      <p className={styles.contributionsCount} data-contributions-pending={pending ?? "unavailable"}>
        {pending === null
          ? translate(language, "owner.contributionsPendingUnavailable")
          : pending === 0
            ? translate(language, "owner.contributionsPendingNone")
            : pending === 1
              ? translate(language, "owner.contributionsPendingOne")
              : translateWith(language, "owner.contributionsPendingMany", { count: String(pending) })}
      </p>
      <p className={styles.featureFoot}>
        <Link href={href} className={styles.textLink} data-contributions-open="">
          {translate(language, "owner.contributionsOpen")}
          <ArrowIcon className={styles.textLinkIcon} />
        </Link>
      </p>
    </section>
  );
}

export function OfferingCounters({ counts, language }: { counts: FamilyOfferingCounts; language: Language }) {
  return (
    <ul className={styles.counters}>
      {COUNTER_ORDER.map((kind) => (
        <li key={kind} className={styles.counter} data-kind={kind}>
          <span className={styles.counterDisc}>
            <OfferingIcon kind={kind} className={styles.counterIcon} />
          </span>
          <span className={styles.counterValue} data-offering-count={kind} aria-label={`${translate(language, COUNTER_LABELS[kind])} : ${counts[kind]}`}>
            {counts[kind]}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function AttentionList({ offerings, language }: { offerings: readonly FamilyOffering[]; language: Language }) {
  return (
    <ul className={styles.attentions}>
      {offerings.map((offering) => (
        <li key={offering.id} className={styles.attention} data-kind={offering.kind}>
          <OfferingIcon kind={offering.kind} className={styles.attentionIcon} />
          <p className={styles.attentionText}>
            {typeof offering.signature === "string" && offering.signature !== "" ? (
              // Lot 2 — the visitor's signature, private: shown here, to the family only.
              translateWith(language, SIGNED_ATTENTION_LABELS[offering.kind], { name: offering.signature })
            ) : (
              translate(language, ATTENTION_LABELS[offering.kind])
            )}
            <time className={styles.attentionDate} dateTime={offering.createdAt}>
              {formatAttentionDate(offering.createdAt, language)}
            </time>
          </p>
        </li>
      ))}
    </ul>
  );
}

/** « Offrandes reçues » — the real totals of the selected tribute. */
export function OfferingsCard({ attentions, language }: { attentions: FamilyAttentions; language: Language }) {
  return (
    <section className={styles.feature} data-feature="offerings">
      <div className={styles.featureHead}>
        <GiftIcon className={styles.featureIcon} />
        <h2 className={styles.featureTitle}>{translate(language, "owner.offeringsTitle")}</h2>
      </div>
      {attentions.status === "ready" ? (
        <OfferingCounters counts={attentions.counts} language={language} />
      ) : (
        <p className={styles.featureEmpty} role="status">
          {translate(language, "owner.attentionsUnavailable")}
        </p>
      )}
    </section>
  );
}

/** « Carnet des attentions » — the latest gestures and the way to all of them. */
export function AttentionsCard({
  attentions,
  tribute,
  language,
  journalHref,
}: {
  attentions: FamilyAttentions;
  tribute: FamilyTribute;
  language: Language;
  journalHref: string;
}) {
  const total =
    attentions.status === "ready" ? OFFERING_KINDS.reduce((sum, kind) => sum + attentions.counts[kind], 0) : 0;

  return (
    <section className={styles.feature} data-feature="attentions">
      <div className={styles.featureHead}>
        <BookIcon className={styles.featureIcon} />
        <h2 className={styles.featureTitle}>{translate(language, "owner.attentionsTitle")}</h2>
      </div>
      {attentions.status !== "ready" ? (
        <p className={styles.featureEmpty} role="status">
          {translate(language, "owner.attentionsUnavailable")}
        </p>
      ) : total === 0 ? (
        <p className={styles.featureEmpty} data-attentions-empty="">
          {translate(
            language,
            tribute.state === "in_preparation" ? "owner.attentionsNotPublished" : "owner.attentionsEmpty",
          )}
        </p>
      ) : (
        <>
          <AttentionList offerings={attentions.latest} language={language} />
          <p className={styles.featureFoot}>
            <Link href={journalHref} className={styles.textLink}>
              {translate(language, "owner.attentionsAll")}
              <ArrowIcon className={styles.textLinkIcon} />
            </Link>
          </p>
        </>
      )}
    </section>
  );
}
