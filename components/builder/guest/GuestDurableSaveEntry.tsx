"use client";

import { useContext, useState } from "react";
import type { Language } from "@/config/languages";
import { translate } from "@/lib/i18n/translate";
import { PreviewFlushRegistryContext } from "@/lib/builder/preview-flush-registry";
import styles from "./GuestDurableSaveEntry.module.css";

/**
 * QG 008 Lot 2 — « Enregistrer mon hommage » in the guest Builder.
 *
 * Deliberately a plain navigation: the guest Builder loads no Supabase
 * module and no server action (guest-import-graph.test.ts). The e-mail
 * form and the transfer live on their own routes (/brouillon/sauvegarder,
 * /brouillon/reprise).
 *
 * Before leaving, it drains the current screen's local autosave through
 * the same registry the Preview uses, so what the family just typed is in
 * the local draft the transfer will read. Nothing is sent anywhere here:
 * the 45 days of preparation start only at the durable save, after the
 * address is verified.
 */
export const DURABLE_SAVE_PATH = "/brouillon/sauvegarder";

export function durableSaveHref(language: Language): string {
  return `${DURABLE_SAVE_PATH}?langue=${language}`;
}

export function GuestDurableSaveEntry({
  language,
  navigate = (href: string) => window.location.assign(href),
}: {
  language: Language;
  navigate?: (href: string) => void;
}) {
  const registry = useContext(PreviewFlushRegistryContext);
  const [leaving, setLeaving] = useState(false);

  async function leave() {
    if (leaving) return;
    setLeaving(true);
    try {
      await registry?.flushAll();
    } catch {
      // A failed local flush keeps the family here: the last saved step
      // is safe, the screen shows its own save state.
      setLeaving(false);
      return;
    }
    navigate(durableSaveHref(language));
  }

  return (
    <aside className={styles.entry} data-guest-durable-save="">
      <button type="button" className={styles.button} onClick={leave} disabled={leaving}>
        {leaving ? translate(language, "common.pleaseWait") : translate(language, "durableSave.entry")}
      </button>
      <p className={styles.hint}>{translate(language, "durableSave.entryHint")}</p>
    </aside>
  );
}
