import Link from "next/link";
import type { Language } from "@/config/languages";
import { translate } from "@/lib/i18n/translate";
import type { FamilyTribute } from "@/lib/owner/family-space";
import { ContributionCategories } from "./contributions/ContributionCategories";
import { ContributionsWorkspace } from "./contributions/ContributionsWorkspace";
import type { ContributionListResult, ContributionSettingsResult, ContributionView } from "./contributions/contribution-views";
import { BackIcon } from "./FamilyIcons";
import { FamilyShell } from "./FamilyShell";
import familyStyles from "./FamilySpace.module.css";
import styles from "./contributions/FamilyContributions.module.css";

/**
 * Espace famille, Lot 3 — « Les contributions reçues » d'un hommage : les
 * quatre vues et la modération, puis, discrète, la section des catégories.
 * Présentation seulement : les lectures sont faites par la route, les
 * actions par les Server Actions E5 depuis les composants clients.
 */
export function FamilyContributions({
  language,
  email,
  tribute,
  view,
  list,
  pending,
  settings,
  spaceHref,
  viewHref,
}: {
  language: Language;
  email: string | null;
  tribute: FamilyTribute;
  view: ContributionView;
  list: ContributionListResult;
  pending: number | null;
  settings: ContributionSettingsResult;
  spaceHref: string;
  viewHref: Record<ContributionView, string>;
}) {
  return (
    <FamilyShell
      language={language}
      email={email}
      title={translate(language, "owner.contribPageTitle")}
      subtitle={tribute.displayName ?? translate(language, "owner.defaultName")}
      homeHref={spaceHref}
    >
      <div className={styles.page} data-family-contributions={tribute.id}>
        <p className={familyStyles.back}>
          <Link href={spaceHref} className={familyStyles.textLink}>
            <BackIcon className={familyStyles.textLinkIcon} />
            {translate(language, "owner.backToSpace")}
          </Link>
        </p>
        <p className={styles.intro}>{translate(language, "owner.contribIntro")}</p>
        <ContributionsWorkspace memorialId={tribute.id} view={view} language={language} initial={list} initialPending={pending} hrefFor={viewHref} />
        <ContributionCategories memorialId={tribute.id} language={language} initial={settings} />
      </div>
    </FamilyShell>
  );
}
