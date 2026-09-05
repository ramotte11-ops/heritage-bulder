import Link from "next/link";
import { EDITORIAL_CONTEXTS, MEMORIAL_TYPES } from "@/config/memorial";
import { LANGUAGES } from "@/config/languages";
import { SKINS } from "@/config/skins";
import styles from "./FoundationStatus.module.css";

/**
 * Mission 001 technical confirmation page.
 *
 * This is NOT the HERITAGE homepage, Hero, or any final design — it exists
 * only to confirm that the project builds, runs, and that the product
 * configuration (memorial types, editorial contexts, skins, languages) is
 * wired correctly end to end.
 */
export function FoundationStatus() {
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>HERITAGE HOMMAGE</h1>
      <p className={styles.subtitle}>Technical foundation initialized.</p>

      <dl className={styles.config}>
        <div className={styles.row}>
          <dt>Memorial types</dt>
          <dd>{MEMORIAL_TYPES.join(", ")}</dd>
        </div>
        <div className={styles.row}>
          <dt>Editorial contexts</dt>
          <dd>{EDITORIAL_CONTEXTS.join(", ")}</dd>
        </div>
        <div className={styles.row}>
          <dt>Skins</dt>
          <dd>{SKINS.join(", ")}</dd>
        </div>
        <div className={styles.row}>
          <dt>Languages</dt>
          <dd>{LANGUAGES.join(", ")}</dd>
        </div>
      </dl>

      <Link href="/builder/demo" className={styles.builderLink}>
        Ouvrir le Builder (démonstration) →
      </Link>
    </main>
  );
}
