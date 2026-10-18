"use client";

import type { Language } from "@/config/languages";
import { translate } from "@/lib/i18n/translate";
import { useDraftRevisionCoordinator } from "@/lib/builder/draft-revision";
import styles from "./DraftConflictNotice.module.css";

export function DraftConflictNotice({ language }: { language: Language | null }) {
  const coordinator = useDraftRevisionCoordinator();
  if (coordinator?.conflictContent == null || language === null) return null;
  const activeLanguage = language;

  function downloadLocalCopy() {
    const payload = JSON.stringify(coordinator?.conflictDownloadValue ?? {}, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "heritage-modifications-non-enregistrees.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function reloadStoredVersion() {
    if (window.confirm(translate(activeLanguage, "autosave.conflictReloadConfirm"))) {
      window.location.reload();
    }
  }

  return (
    <section role="alert" className={styles.notice} aria-labelledby="draft-conflict-title">
      <strong id="draft-conflict-title">{translate(activeLanguage, "autosave.conflictTitle")}</strong>
      <span>{translate(activeLanguage, "autosave.conflictBody")}</span>
      <div className={styles.actions}>
        <button type="button" className={styles.action} onClick={downloadLocalCopy}>
          {translate(activeLanguage, "autosave.conflictDownload")}
        </button>
        <button type="button" className={styles.action} onClick={reloadStoredVersion}>
          {translate(activeLanguage, "autosave.conflictReload")}
        </button>
      </div>
    </section>
  );
}
