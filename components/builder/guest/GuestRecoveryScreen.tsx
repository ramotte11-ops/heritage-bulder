"use client";

import { useEffect } from "react";
import type { Language } from "@/config/languages";
import type { TranslationKey } from "@/lib/i18n/keys";
import { translate } from "@/lib/i18n/translate";
import { BuilderScreen } from "@/components/builder/BuilderScreen";
import { PrimaryButton } from "@/components/builder/PrimaryButton";
import screenStyles from "@/components/builder/BuilderScreen.module.css";
import styles from "./GuestRecoveryScreen.module.css";

/** Stable, non-personal reasons — the only thing ever reported. */
export type GuestRecoveryReason =
  | "hero_photo_missing"
  | "hero_crop_missing"
  | "skin_variant_missing"
  | "loading_slow"
  | "storage_blocked"
  | "storage_unavailable";

/**
 * QG 003 — the discreet technical trace of a recovery: a reason code only,
 * never draft content, a name, a photo, an address or an identifier.
 */
export function reportGuestRecovery(reason: GuestRecoveryReason | "hero_photo_unreadable"): void {
  console.warn("[HERITAGE] guest builder recovery:", reason);
}

/**
 * QG 003 — what the guest Builder shows instead of an empty screen when a
 * restored draft cannot render its step: the Builder's own chrome
 * (`BuilderScreen`: background, logo, progress), a short reassurance that
 * nothing is lost, and ONE way forward. The action is never destructive:
 * it reopens a step or reloads the page; no draft, text or photo is ever
 * erased from here.
 */
export function GuestRecoveryScreen({
  reason,
  language,
  progress = 0,
  title = "guestRecovery.title",
  body,
  action,
  onAction,
  pending = false,
  failed = false,
}: {
  reason: GuestRecoveryReason;
  language: Language;
  progress?: number;
  title?: TranslationKey;
  body: TranslationKey;
  action: TranslationKey;
  onAction: () => void;
  pending?: boolean;
  failed?: boolean;
}) {
  useEffect(() => {
    reportGuestRecovery(reason);
  }, [reason]);

  return (
    <BuilderScreen progress={progress}>
      <section className={styles.copy} data-guest-builder-recovery={reason} lang={language}>
        <h1 className={styles.title}>{translate(language, title)}</h1>
        <p className={styles.body}>{translate(language, body)}</p>
        <p className={styles.kept}>{translate(language, "guestRecovery.kept")}</p>
        {failed ? <p role="alert" className={styles.alert}>{translate(language, "guestRecovery.actionFailed")}</p> : null}
      </section>
      <form
        className={screenStyles.ctaWrap}
        onSubmit={(event) => {
          event.preventDefault();
          onAction();
        }}
      >
        <PrimaryButton type="submit" pending={pending}>
          {translate(language, action)}
        </PrimaryButton>
      </form>
    </BuilderScreen>
  );
}
