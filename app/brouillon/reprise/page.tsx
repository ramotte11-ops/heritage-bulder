import { GuestDraftTransfer } from "@/components/builder/transfer/GuestDraftTransfer";
import styles from "@/components/builder/transfer/DurableSave.module.css";
import { translate } from "@/lib/i18n/translate";
import { DURABLE_SAVE_FALLBACK_LANGUAGE } from "@/components/builder/transfer/durable-save-language";
import { getAuthenticatedUser } from "@/lib/supabase/session";

/**
 * QG 008 Lot 2 — where the magic link brings the family back
 * (/auth/callback?next=/brouillon/reprise). Without a session, nothing is
 * read or sent: the family is offered a new link. With one, the transfer
 * runs in this browser (the guest draft lives in its IndexedDB); the
 * server refuses an unconfirmed address on every step.
 */
export default async function GuestDraftResumePage() {
  const user = await getAuthenticatedUser();
  const language = DURABLE_SAVE_FALLBACK_LANGUAGE;

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>{translate(language, "durableSave.title")}</h1>
      {user ? (
        <GuestDraftTransfer />
      ) : (
        <>
          <p className={styles.text}>{translate(language, "durableSave.signInAgain")}</p>
          <a className={styles.primary} href="/brouillon/sauvegarder">{translate(language, "durableSave.submit")}</a>
        </>
      )}
    </main>
  );
}
