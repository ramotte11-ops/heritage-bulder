"use client";

import { useState } from "react";
import type { Language } from "@/config/languages";
import { translate } from "@/lib/i18n/translate";
import styles from "./FirstSaveNotice.module.css";

/**
 * QG 004-B — the discreet confirmation after the first durable save (no
 * extra screen): shown under the current Builder screen, in the Preview
 * host's footer slot, once, after the guest draft transfer. Texts validated
 * by the PO. The deadlines themselves are the database's
 * (anchor_free_memorial_v1: 10 days to publish the free notice and 45 days
 * of preparation, both from this first save); this only tells them.
 */
export function FirstSaveNotice({ language }: { language: Language }) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  return (
    <aside className={styles.notice} role="status" data-first-save-notice="">
      <p className={styles.title}>{t("firstSave.title")}</p>
      <p className={styles.text}>{t("firstSave.body")}</p>
      <p className={styles.title}>{t("firstSave.freeTitle")}</p>
      <p className={styles.text}>{t("firstSave.freeBody")}</p>
      <p className={styles.title}>{t("firstSave.prepTitle")}</p>
      <p className={styles.text}>{t("firstSave.prepBody")}</p>
      <button type="button" className={styles.dismiss} onClick={() => setOpen(false)}>
        {t("firstSave.dismiss")}
      </button>
    </aside>
  );
}
