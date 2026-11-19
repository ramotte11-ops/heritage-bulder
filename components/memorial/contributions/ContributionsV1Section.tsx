"use client";

import { useMemo } from "react";
import type { Language } from "@/config/languages";
import type { SkinVariant } from "@/config/skins";
import { translate } from "@/lib/i18n/translate";
import { contributionsLabels, contributionsTexts } from "@/lib/memorial/contributions/contributions-labels";
import type { ContributionsFeatures } from "@/lib/memorial/contributions/contributions-settings";
import type { ContributionSceneItem } from "@/lib/memorial/contributions/contributions-scene";
import { albumOrder, contributionsPublicState, selectSceneContributions } from "@/lib/memorial/contributions/public-contributions";
import type { PublicContribution } from "@/lib/memorial/contributions/public-contribution-types";
import { ebGaramond, ebGaramondItalic, laBelleAurore, offeringsMediumSerif } from "@/components/builder/fonts";
import { contributionsSignatureScript } from "./contribution-fonts";
import { ContributionsBuilderPreview } from "./ContributionsBuilderPreview";
import { ContributionsSection } from "./ContributionsSection";
import type { ContributionContent } from "./ContributionsSceneDesktop";
import { ContributionsLabelsProvider } from "./contributions-labels-context";
import { useContributionsHost } from "./contributions-host";

/** Les polices des Masters, posées par la rubrique elle-même (même liste que l'aperçu M7). */
const SCENE_FONTS = [ebGaramond, ebGaramondItalic, offeringsMediumSerif, laBelleAurore, contributionsSignatureScript].map((f) => f.variable).join(" ");

/**
 * M8-E3 — la rubrique « Contributions des proches » dans le Mémorial
 * assemblé (renderer `ContributionsV1Section`, section `testimonials`).
 *
 *  - Aperçu du Builder (hôte `preview`) : la démonstration M7, cartes
 *    fictives des catégories choisies en A15, avec la mention « aperçu ».
 *  - Page publique (hôte `public`) : les contributions RÉELLES, filtrées par
 *    les catégories EN VIGUEUR (O9) :
 *      0 publiée → Master M0 de l'état vide ;
 *      1 à 3     → toutes, sans « Voir tous » ;
 *      4 et plus → scène M5 (sélection O8) et « Voir tous » → Album P1.
 *    Aucune catégorie en vigueur → aucune rubrique.
 * Scènes, Album, Light/Dark, animations et pile des cartes : les composants
 * M4–M6 tels quels.
 */
export interface ContributionsV1SectionProps {
  skinVariant: SkinVariant;
  language: Language;
  /** Le nom de la personne (Hero), pour le sous-titre. */
  displayName: string | null;
  /** Les choix A15 de la copie lue (brouillon dans le Builder, copie publiée en public). */
  features: ContributionsFeatures;
}

function toScene(c: PublicContribution): { item: ContributionSceneItem; content: ContributionContent } | null {
  if (c.type === "photo") {
    if (!c.photo || !c.photo.width || !c.photo.height) return null;
    return {
      item: { id: c.id, kind: "photo", photo: { width: c.photo.width, height: c.photo.height } },
      content: { author: c.authorName, text: null, caption: c.caption, photo: { src: c.photo.url, width: c.photo.width, height: c.photo.height } },
    };
  }
  if (!c.text) return null;
  return {
    item: { id: c.id, kind: c.type === "condolence" ? "condolence" : "story" },
    content: { author: c.authorName, text: c.text, caption: null, photo: null },
  };
}

export function ContributionsV1Section({ skinVariant, language, displayName, features }: ContributionsV1SectionProps) {
  const host = useContributionsHost();
  const labels = useMemo(() => contributionsLabels(language), [language]);
  const texts = useMemo(() => contributionsTexts(language, displayName), [language, displayName]);

  const publicView = useMemo(() => {
    if (host.mode !== "public" || host.initial === null) return null;
    const { categories, items } = host.initial;
    const album = albumOrder(items, categories);
    const mapped = album.map(toScene).filter((x): x is NonNullable<typeof x> => x !== null);
    const contents = Object.fromEntries(mapped.map((m) => [m.item.id, m.content]));
    const byId = new Map(mapped.map((m) => [m.item.id, m.item]));
    const scene = selectSceneContributions(
      album.filter((c) => byId.has(c.id)),
      categories,
    ).map((c) => byId.get(c.id)!);
    return { state: contributionsPublicState(categories, mapped.length), items: mapped.map((m) => m.item), scene, contents };
  }, [host]);

  if (host.mode === "preview") {
    return (
      <section className={SCENE_FONTS} data-contributions-host="preview" aria-label={texts.title}>
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
      </section>
    );
  }

  if (publicView === null || publicView.state.kind === "closed") return null;
  return (
    <div className={SCENE_FONTS} data-contributions-host="public" data-contributions-state={publicView.state.kind}>
      <ContributionsLabelsProvider value={labels}>
        <ContributionsSection
          theme={skinVariant}
          items={publicView.items}
          sceneItems={publicView.scene}
          contents={publicView.contents}
          title={texts.title}
          subtitle={texts.subtitle}
          closing={texts.closing}
          closingEmpty={texts.closingEmpty}
          language={language}
        />
      </ContributionsLabelsProvider>
    </div>
  );
}
