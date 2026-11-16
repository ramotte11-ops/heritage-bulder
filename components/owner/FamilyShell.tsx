import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "@/app/auth/actions";
import { inter, playfairDisplay } from "@/components/builder/fonts";
import type { Language } from "@/config/languages";
import { translate } from "@/lib/i18n/translate";
import { ChevronIcon, SprigOrnament, TornCornerOrnament, UserIcon } from "./FamilyIcons";
import { SignOutSubmit } from "./SignOutSubmit";
import styles from "./FamilySpace.module.css";

/**
 * Espace famille — le cadre commun des pages de l'espace : papier ivoire
 * du Builder, logo HERITAGE Hommage et son filet bicolore, « Mon compte »,
 * titre au rameau, coin de papier bordeaux. Aucune donnée, aucune décision :
 * la page qui l'utilise a déjà résolu la session.
 *
 * « Mon compte » est un `<details>` natif : il s'ouvre sans JavaScript et
 * ne contient que l'adresse du compte et la déconnexion existante
 * (`signOut`, inchangée).
 */
export function FamilyShell({
  language,
  email,
  title,
  subtitle,
  homeHref,
  children,
}: {
  language: Language;
  email: string | null;
  title: string;
  subtitle?: string | null;
  /** Where the logo leads: the dashboard itself. */
  homeHref: string;
  children: ReactNode;
}) {
  return (
    <main className={`${styles.space} ${playfairDisplay.variable} ${inter.variable}`} lang={language}>
      <div className={styles.frame}>
        <header className={styles.header}>
          <Link href={homeHref} className={styles.brand}>
            <p className={styles.wordmark}>HERITAGE</p>
            <p className={styles.wordmarkSub}>Hommage</p>
          </Link>
          <span className={styles.brandRule} aria-hidden="true" />

          {email ? (
            <details className={styles.account} data-family-account="">
              <summary className={styles.accountSummary} aria-label={translate(language, "owner.account")}>
                <UserIcon className={styles.accountIcon} />
                <span className={styles.accountLabel}>{translate(language, "owner.account")}</span>
                <ChevronIcon className={styles.accountChevron} />
              </summary>
              <div className={styles.accountPanel}>
                <p className={styles.accountEmail}>{email}</p>
                <form action={signOut}>
                  <SignOutSubmit
                    className={styles.signOut}
                    label={translate(language, "owner.signOut")}
                    pendingLabel={translate(language, "owner.signingOut")}
                  />
                </form>
              </div>
            </details>
          ) : null}
        </header>

        <h1 className={styles.title}>{title}</h1>
        <div className={styles.titleRule} aria-hidden="true">
          <SprigOrnament className={styles.sprig} />
        </div>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}

        {children}
      </div>
      <TornCornerOrnament className={styles.corner} />
    </main>
  );
}
