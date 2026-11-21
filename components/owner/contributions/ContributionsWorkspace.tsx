"use client";

import Link from "next/link";
import { useState } from "react";
import type { Language } from "@/config/languages";
import { translate } from "@/lib/i18n/translate";
import { CONTRIBUTION_VIEWS, VIEW_LABELS, type ContributionListResult, type ContributionView } from "./contribution-views";
import { ContributionsManager } from "./ContributionsManager";
import styles from "./FamilyContributions.module.css";

/**
 * Lot 3 — the four views (links: each opens with a fresh server read, so
 * photographs always come with new URLs) and the selected view's list. The
 * pending total in « À examiner » follows every moderation.
 */
export function ContributionsWorkspace({
  memorialId,
  view,
  language,
  initial,
  initialPending,
  hrefFor,
}: {
  memorialId: string;
  view: ContributionView;
  language: Language;
  initial: ContributionListResult;
  initialPending: number | null;
  hrefFor: Record<ContributionView, string>;
}) {
  const [pending, setPending] = useState<number | null>(initialPending);

  return (
    <>
      <nav className={styles.views} aria-label={translate(language, "owner.contribViewsLabel")}>
        <ul className={styles.viewList}>
          {CONTRIBUTION_VIEWS.map((v) => (
            <li key={v}>
              <Link href={hrefFor[v]} className={styles.viewLink} aria-current={v === view ? "page" : undefined} data-contributions-tab={v}>
                {translate(language, VIEW_LABELS[v])}
                {v === "pending" && pending !== null && pending > 0 ? (
                  <span className={styles.viewCount} data-pending-total={pending}>
                    {pending}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <ContributionsManager key={view} memorialId={memorialId} view={view} language={language} initial={initial} onPendingChange={setPending} />
    </>
  );
}
