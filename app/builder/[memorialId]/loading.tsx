import { PendingActionLabel } from "@/components/builder/PendingActionLabel";
import { inter, playfairDisplay } from "@/components/builder/fonts";
import screenStyles from "@/components/builder/BuilderScreen.module.css";
import styles from "./loading.module.css";

/**
 * Instant App Router fallback for the Builder's dynamic route.
 *
 * At this point the memorial has not been read yet, so its chosen
 * language is not available. The short status is deliberately shown in
 * the three Builder languages, following T01's existing pre-language
 * convention, rather than guessing from the browser or duplicating a
 * memorial read inside the fallback.
 */
export default function BuilderLoading() {
  return (
    <main className={`${screenStyles.page} ${playfairDisplay.variable} ${inter.variable}`}>
      <p className={screenStyles.signature}>
        Stories
        <br />
        live
        <br />
        forever
      </p>

      <div className={`${screenStyles.frame} ${styles.frame}`}>
        <header className={screenStyles.brand}>
          <p className={screenStyles.wordmark}>HERITAGE</p>
          <p className={screenStyles.wordmarkSub}>Hommage</p>
        </header>

        <div className={styles.status} aria-busy="true">
          <PendingActionLabel
            pending
            pendingLabel={
              <span className={styles.copy}>
                <span lang="fr">Ouverture de votre hommage…</span>
                <span lang="en">Opening your tribute…</span>
                <span lang="es">Abriendo su homenaje…</span>
              </span>
            }
          >
            {null}
          </PendingActionLabel>
        </div>
      </div>
    </main>
  );
}
