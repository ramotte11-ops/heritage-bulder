import { DurableSaveForm } from "@/components/builder/transfer/DurableSaveForm";
import { GuestDraftTransfer } from "@/components/builder/transfer/GuestDraftTransfer";
import {
  durableSaveLanguage,
} from "@/components/builder/transfer/durable-save-language";
import styles from "@/components/builder/transfer/DurableSave.module.css";
import { translate } from "@/lib/i18n/translate";
import { getAuthenticatedUser } from "@/lib/supabase/session";

/**
 * QG 008 Lot 2 — « Enregistrer votre hommage » : the e-mail step.
 *
 *   /brouillon/sauvegarder?langue=fr
 *
 * QG 017: a family already signed in stays on this page and sees the
 * connected address plus the read-only save preview before any new transfer.
 */
export default async function DurableSavePage({
  searchParams,
}: {
  searchParams: Promise<{ langue?: string | string[] }>;
}) {
  const language = durableSaveLanguage((await searchParams).langue);
  const user = await getAuthenticatedUser();

  return (
    <main className={styles.main} lang={language}>
      <h1 className={styles.title}>{translate(language, "durableSave.title")}</h1>
      {user ? (
        <GuestDraftTransfer accountEmail={user.email ?? ""} fallbackLanguage={language} />
      ) : (
        <>
          <p className={styles.text}>{translate(language, "durableSave.intro")}</p>
          <p className={styles.text}><strong>{translate(language, "durableSave.sameBrowser")}</strong></p>
          <DurableSaveForm language={language} />
        </>
      )}
      <div className={styles.actions}>
        <a className={styles.secondary} href="/creer">{translate(language, "durableSave.backToBuilder")}</a>
      </div>
    </main>
  );
}
