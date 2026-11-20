"use client";

import { useState } from "react";
import type { Language } from "@/config/languages";
import type { TranslationKey } from "@/lib/i18n/keys";
import { translate } from "@/lib/i18n/translate";
import { getContributionSettings, updateContributionCategories } from "@/lib/memorial/contributions/family-contribution-actions";
import familyStyles from "../FamilySpace.module.css";
import type { ContributionSettingsResult } from "./contribution-views";
import styles from "./FamilyContributions.module.css";

/**
 * Lot 3 — « Ce que vos proches peuvent partager » : the same three
 * categories as the Builder's A15 step, through the SAME server action
 * (`updateContributionCategories`, contract E5 § 3.5) — no second logic.
 *
 * Always the three booleans; `expectedRevision` = the revision read. After
 * publication the change is immediate (deposits refused, public reading
 * hidden, contributions kept). `stale_revision`: the tribute changed
 * elsewhere — re-read, show the real state, let the family choose again;
 * never re-send on its own. The daily digest (Brevo) is not offered: no
 * e-mail is sent yet.
 */

type Features = { condolences: boolean; stories: boolean; photos: boolean };
type Settings = Extract<ContributionSettingsResult, { status: "ok" }>["settings"];

const CATEGORIES: readonly { key: keyof Features; title: TranslationKey; hint: TranslationKey }[] = [
  { key: "condolences", title: "contributionsStep.condolences", hint: "contributionsStep.condolencesHint" },
  { key: "stories", title: "contributionsStep.stories", hint: "contributionsStep.storiesHint" },
  { key: "photos", title: "contributionsStep.photos", hint: "contributionsStep.photosHint" },
];

type Message = { tone: "done" | "info" | "error"; key: TranslationKey } | null;

export function ContributionCategories({
  memorialId,
  language,
  initial,
}: {
  memorialId: string;
  language: Language;
  initial: ContributionSettingsResult;
}) {
  const [settings, setSettings] = useState<Settings | null>(initial.status === "ok" ? initial.settings : null);
  const [features, setFeatures] = useState<Features | null>(initial.status === "ok" ? initial.settings.features : null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message>(
    initial.status === "ok" && initial.settings.corrupted ? { tone: "info", key: "owner.contribSettingsCorrupted" } : null,
  );

  async function reread(): Promise<boolean> {
    let fresh: ContributionSettingsResult;
    try {
      fresh = await getContributionSettings(memorialId);
    } catch {
      return false;
    }
    if (fresh.status !== "ok") return false;
    setSettings(fresh.settings);
    setFeatures(fresh.settings.features);
    return true;
  }

  async function save() {
    if (settings === null || features === null) return;
    setSaving(true);
    setMessage(null);
    let result: Awaited<ReturnType<typeof updateContributionCategories>>;
    try {
      result = await updateContributionCategories(memorialId, { ...features }, settings.draftRevision ?? undefined);
    } catch {
      result = { status: "unavailable" };
    }
    if (result.status === "ok") {
      setSettings({ ...settings, features: { ...features }, corrupted: false, draftRevision: result.draftRevision });
      setMessage({ tone: "done", key: "owner.contribSettingsSaved" });
    } else if (result.status === "stale_revision") {
      const reread_ = await reread();
      setMessage({ tone: "info", key: reread_ ? "owner.contribSettingsStale" : "owner.contribFailure" });
    } else {
      setMessage({ tone: "error", key: "owner.contribFailure" });
    }
    setSaving(false);
  }

  if (settings === null || features === null) {
    return (
      <section className={styles.settings} data-contribution-settings="unavailable" aria-labelledby="contribution-settings-title">
        <h2 id="contribution-settings-title" className={styles.settingsTitle}>
          {translate(language, "owner.contribSettingsTitle")}
        </h2>
        <p className={styles.settingsNote}>{translate(language, "owner.contribSettingsUnavailable")}</p>
      </section>
    );
  }

  return (
    <section className={styles.settings} data-contribution-settings="ready" aria-labelledby="contribution-settings-title">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <fieldset className={styles.fieldset} disabled={saving}>
          <legend id="contribution-settings-title" className={styles.settingsTitle}>
            {translate(language, "owner.contribSettingsTitle")}
          </legend>
          <p className={styles.settingsNote}>{translate(language, "owner.contribSettingsBody")}</p>
          {!settings.firstPublished ? <p className={styles.settingsNote}>{translate(language, "owner.contribSettingsDraft")}</p> : null}
          <ul className={styles.options}>
            {CATEGORIES.map(({ key, title, hint }) => (
              <li key={key}>
                <label className={styles.option}>
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={features[key]}
                    onChange={(event) => setFeatures({ ...features, [key]: event.target.checked })}
                    data-contribution-category={key}
                  />
                  <span>
                    <span className={styles.optionTitle}>{translate(language, title)}</span>
                    <span className={styles.optionHint}>{translate(language, hint)}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <p className={styles.settingsActions}>
            <button type="submit" className={familyStyles.pill} aria-busy={saving || undefined} data-contribution-settings-save="">
              {saving ? translate(language, "owner.contribLoading") : translate(language, "owner.contribSettingsSave")}
            </button>
          </p>
        </fieldset>
      </form>
      <p role="status" aria-live="polite" className={styles.notice} data-tone={message?.tone} hidden={message === null}>
        {message !== null ? translate(language, message.key) : null}
      </p>
    </section>
  );
}
