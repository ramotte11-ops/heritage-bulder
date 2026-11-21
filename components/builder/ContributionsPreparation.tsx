"use client";

import type { Language } from "@/config/languages";
import type { SkinVariant } from "@/config/skins";
import { translate } from "@/lib/i18n/translate";
import { CONTRIBUTION_FEATURES, type ContributionFeature, type ContributionsFeatures } from "@/lib/memorial/contributions/contributions-settings";
import { ContributionsBuilderPreview } from "@/components/memorial/contributions/ContributionsBuilderPreview";
import styles from "./ContributionsPreparation.module.css";

/**
 * M7 — la préparation des Contributions des proches : trois interrupteurs
 * (condoléances, récits et anecdotes, photographies) et, aussitôt, l'aperçu
 * artistique où apparaissent les cartes d'exemple des fonctionnalités
 * ouvertes. Composant CONTRÔLÉ et sans écriture : l'écran qui l'accueille
 * (l'étape du parcours) décide quand enregistrer les choix — jamais les
 * exemples, qui ne sont que visuels.
 */

export interface ContributionsPreparationProps {
  language: Language;
  skinVariant: SkinVariant;
  features: ContributionsFeatures;
  onChange: (features: ContributionsFeatures) => void;
  disabled?: boolean;
}

const LABEL: Record<
  ContributionFeature,
  {
    title: "contributionsStep.condolences" | "contributionsStep.stories" | "contributionsStep.photos";
    hint: "contributionsStep.condolencesHint" | "contributionsStep.storiesHint" | "contributionsStep.photosHint";
  }
> = {
  condolences: { title: "contributionsStep.condolences", hint: "contributionsStep.condolencesHint" },
  stories: { title: "contributionsStep.stories", hint: "contributionsStep.storiesHint" },
  photos: { title: "contributionsStep.photos", hint: "contributionsStep.photosHint" },
};

export function ContributionsPreparation({ language, skinVariant, features, onChange, disabled = false }: ContributionsPreparationProps) {
  return (
    <>
      <fieldset className={styles.fieldset} disabled={disabled}>
        <legend className={styles.legend}>{translate(language, "contributionsStep.featuresLegend")}</legend>
        <div className={styles.features}>
          {CONTRIBUTION_FEATURES.map((f) => (
            <label key={f} className={styles.feature} data-feature={f} data-checked={features[f] ? "" : undefined}>
              <input
                type="checkbox"
                role="switch"
                className={styles.switchInput}
                checked={features[f]}
                onChange={(e) => onChange({ ...features, [f]: e.target.checked })}
                aria-describedby={`contributions-${f}-hint`}
              />
              <span className={styles.switchTrack} aria-hidden="true">
                <span className={styles.switchThumb} />
              </span>
              <span className={styles.featureText}>
                <span className={styles.featureTitle}>{translate(language, LABEL[f].title)}</span>
                <span id={`contributions-${f}-hint`} className={styles.featureHint}>
                  {translate(language, LABEL[f].hint)}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className={styles.previewBleed}>
        <ContributionsBuilderPreview
          features={features}
          skinVariant={skinVariant}
          language={language}
          labels={{
            region: translate(language, "contributionsStep.previewLabel"),
            note: translate(language, "contributionsStep.previewNote"),
            empty: translate(language, "contributionsStep.previewEmpty"),
            unavailable: translate(language, "contributionsStep.previewUnavailable"),
          }}
        />
      </div>
    </>
  );
}
