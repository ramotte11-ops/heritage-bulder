import { PendingActionLabel } from "@/components/builder/PendingActionLabel";
import { inter, playfairDisplay } from "@/components/builder/fonts";
import { TornCornerOrnament } from "@/components/owner/FamilyIcons";
import type { Language } from "@/config/languages";
import { translate } from "@/lib/i18n/translate";
import styles from "@/components/owner/FamilySpace.module.css";
import loadingStyles from "./loading.module.css";

/** The Builder loading boundary's order: French first (first market). */
const LOADING_LANGUAGES: readonly Language[] = ["fr", "en", "es"];

/**
 * Mission 04-G / L1.3 — instant App Router fallback for the family space.
 *
 * Built only from the family space's own frame (`FamilyShell`'s ivory
 * paper, HERITAGE Hommage wordmark and two-tone rule, torn paper corner)
 * and the shared Builder feedback (`PendingActionLabel`). At this point
 * the session has not been read yet, so the family's language is not
 * known: like the Builder's own loading boundary
 * (app/builder/[memorialId]/loading.tsx), the existing « Un instant… »
 * is shown in the three Builder languages. No data, no decision.
 */
export default function OwnerLoading() {
  return (
    <main className={`${styles.space} ${playfairDisplay.variable} ${inter.variable}`}>
      <div className={styles.frame}>
        <header className={styles.header}>
          <div className={styles.brand}>
            <p className={styles.wordmark}>HERITAGE</p>
            <p className={styles.wordmarkSub}>Hommage</p>
          </div>
          <span className={styles.brandRule} aria-hidden="true" />
        </header>

        <div className={`${styles.subtitle} ${loadingStyles.status}`} aria-busy="true">
          <PendingActionLabel
            pending
            pendingLabel={
              <span className={loadingStyles.copy}>
                {LOADING_LANGUAGES.map((language) => (
                  <span key={language} lang={language}>
                    {translate(language, "common.pleaseWait")}
                  </span>
                ))}
              </span>
            }
          >
            {null}
          </PendingActionLabel>
        </div>
      </div>
      <TornCornerOrnament className={styles.corner} />
    </main>
  );
}
