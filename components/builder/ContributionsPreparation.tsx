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
 *
 * UX-A15 (issue #110) — les interrupteurs forment une BARRE COMPACTE, ivoire
 * légèrement translucide, sur une seule ligne, posée juste au-dessus du
 * Master. Elle est collante dans la zone du Master : quand on fait défiler
 * pour voir les cartes, elle reste en haut de l'écran (au-dessus du titre
 * décoratif du Master), si bien que chaque clic produit un changement
 * visible. Aucun défilement automatique, aucun bouton ajouté ; le Master,
 * ses compositions et ses animations sont inchangés. Le titre du groupe et
 * les aides restent lus par les lecteurs d'écran (masqués visuellement).
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
    short: "contributionsStep.condolencesShort" | "contributionsStep.storiesShort" | "contributionsStep.photosShort";
    hint: "contributionsStep.condolencesHint" | "contributionsStep.storiesHint" | "contributionsStep.photosHint";
  }
> = {
  condolences: { title: "contributionsStep.condolences", short: "contributionsStep.condolencesShort", hint: "contributionsStep.condolencesHint" },
  stories: { title: "contributionsStep.stories", short: "contributionsStep.storiesShort", hint: "contributionsStep.storiesHint" },
  photos: { title: "contributionsStep.photos", short: "contributionsStep.photosShort", hint: "contributionsStep.photosHint" },
};

export function ContributionsPreparation({ language, skinVariant, features, onChange, disabled = false }: ContributionsPreparationProps) {
  return (
    <div className={styles.workspace} data-contributions-workspace="">
      <div className={styles.barWrap} data-contributions-bar="">
        <fieldset className={styles.bar} disabled={disabled}>
          <legend className={styles.visuallyHidden}>{translate(language, "contributionsStep.featuresLegend")}</legend>
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
                  {/* Nom accessible : le libellé complet ; à l'écran, le libellé court sur Mobile. */}
                  <span className={styles.featureTitle}>{translate(language, LABEL[f].title)}</span>
                  <span className={styles.featureShort} aria-hidden="true">
                    {translate(language, LABEL[f].short)}
                  </span>
                  <span id={`contributions-${f}-hint`} className={styles.visuallyHidden}>
                    {translate(language, LABEL[f].hint)}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

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
    </div>
  );
}
