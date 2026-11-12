import { redirect } from "next/navigation";
import { DurableSaveForm } from "@/components/builder/transfer/DurableSaveForm";
import {
  DURABLE_SAVE_RETURN_PATH,
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
 * A family already signed in goes straight to the transfer (whose server
 * side still refuses an unconfirmed address).
 */
export default async function DurableSavePage({
  searchParams,
}: {
  searchParams: Promise<{ langue?: string | string[] }>;
}) {
  const language = durableSaveLanguage((await searchParams).langue);
  if (await getAuthenticatedUser()) redirect(DURABLE_SAVE_RETURN_PATH);

  return (
    <main className={styles.main} lang={language}>
      <h1 className={styles.title}>{translate(language, "durableSave.title")}</h1>
      <p className={styles.text}>{translate(language, "durableSave.intro")}</p>
      <p className={styles.text}><strong>{translate(language, "durableSave.sameBrowser")}</strong></p>
      <DurableSaveForm language={language} />
      <div className={styles.actions}>
        <a className={styles.secondary} href="/creer">{translate(language, "durableSave.backToBuilder")}</a>
      </div>
    </main>
  );
}
