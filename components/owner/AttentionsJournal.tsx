import Link from "next/link";
import { OFFERING_KINDS } from "@/config/symbolic-offerings-v1-tokens";
import type { Language } from "@/config/languages";
import type { FamilyOfferingCounts, FamilyOfferingPage } from "@/lib/adapters/family-space-repository";
import { translate } from "@/lib/i18n/translate";
import type { FamilyTribute } from "@/lib/owner/family-space";
import { AttentionList, OfferingCounters } from "./FamilyFeatures";
import { BackIcon, BookIcon, GiftIcon } from "./FamilyIcons";
import { FamilyShell } from "./FamilyShell";
import styles from "./FamilySpace.module.css";

/**
 * Espace famille — « Carnet des attentions » d'un hommage, en pure
 * présentation : totaux réels, puis chaque geste reçu avec sa date, du plus
 * récent au plus ancien. `counts`/`offerings` à `null` : la lecture a échoué,
 * et la page le dit sans rien inventer.
 */
export function AttentionsJournal({
  language,
  email,
  tribute,
  counts,
  offerings,
  spaceHref,
  newerHref,
  olderHref,
}: {
  language: Language;
  email: string | null;
  tribute: FamilyTribute;
  counts: FamilyOfferingCounts | null;
  offerings: FamilyOfferingPage | null;
  spaceHref: string;
  newerHref: string | null;
  olderHref: string | null;
}) {
  const total = counts ? OFFERING_KINDS.reduce((sum, kind) => sum + counts[kind], 0) : 0;

  return (
    <FamilyShell
      language={language}
      email={email}
      title={translate(language, "owner.attentionsTitle")}
      subtitle={tribute.displayName ?? translate(language, "owner.defaultName")}
      homeHref={spaceHref}
    >
      <div className={styles.journal}>
        <p className={styles.back}>
          <Link href={spaceHref} className={styles.textLink}>
            <BackIcon className={styles.textLinkIcon} />
            {translate(language, "owner.backToSpace")}
          </Link>
        </p>

        {counts === null || offerings === null ? (
          <p role="alert" className={styles.alert}>
            {translate(language, "owner.attentionsUnavailable")}
          </p>
        ) : (
          <>
            <section className={styles.feature} data-feature="offerings">
              <div className={styles.featureHead}>
                <GiftIcon className={styles.featureIcon} />
                <h2 className={styles.featureTitle}>{translate(language, "owner.offeringsTitle")}</h2>
              </div>
              <OfferingCounters counts={counts} language={language} />
            </section>

            <section className={styles.feature} data-feature="attentions">
              <div className={styles.featureHead}>
                <BookIcon className={styles.featureIcon} />
                <h2 className={styles.featureTitle}>{translate(language, "owner.attentionsTitle")}</h2>
              </div>
              <p className={styles.featureBody}>{translate(language, "owner.attentionsPrivate")}</p>
              {total === 0 ? (
                <p className={styles.featureEmpty} data-attentions-empty="">
                  {translate(
                    language,
                    tribute.state === "in_preparation" ? "owner.attentionsNotPublished" : "owner.attentionsEmpty",
                  )}
                </p>
              ) : (
                <AttentionList offerings={offerings.offerings} language={language} />
              )}
              {newerHref !== null || olderHref !== null ? (
                <nav className={styles.pager}>
                  {newerHref !== null ? (
                    <Link href={newerHref} className={styles.textLink} data-attentions-newer="">
                      <BackIcon className={styles.textLinkIcon} />
                      {translate(language, "owner.attentionsNewer")}
                    </Link>
                  ) : (
                    <span />
                  )}
                  {olderHref !== null ? (
                    <Link href={olderHref} className={styles.textLink} data-attentions-older="">
                      {translate(language, "owner.attentionsOlder")}
                    </Link>
                  ) : null}
                </nav>
              ) : null}
            </section>
          </>
        )}
      </div>
    </FamilyShell>
  );
}
