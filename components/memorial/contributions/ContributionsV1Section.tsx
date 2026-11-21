"use client";

import { useCallback, useMemo, useRef, useState, type MouseEvent } from "react";
import dynamic from "next/dynamic";
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
import { useContributionsHost, useLivePublicContributions } from "./contributions-host";
import { ContributionsPhotoRecoveryProvider } from "./contributions-photo-recovery";

/**
 * M8-E6-F — « La lettre des proches » et son transport réel, chargés
 * seulement quand un visiteur l'ouvre : ni la page publique ni le Builder ne
 * portent ce code tant qu'elle reste fermée.
 */
const PublicDepositLetter = dynamic(() => import("./PublicDepositLetter"), { ssr: false });

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

  const live = useLivePublicContributions(host);

  // M8-E6-F — « Laisser un message » : chaque scène (Desktop, Mobile, état vide)
  // porte ce bouton ; un seul écouteur ici l'ouvre, sans toucher aux Masters.
  // Le dépôt n'existe que si la page l'a transmis (verrou de publication ouvert).
  const deposit = host.mode === "public" ? host.deposit : undefined;
  const [writing, setWriting] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  // Fermeture : le focus revient au bouton d'origine ; si la rubrique a changé
  // de scène entre-temps (premier message : état vide → cartes), au bouton
  // « Laisser un message » de la nouvelle scène.
  const closeLetter = useCallback(() => {
    setWriting(false);
    // La nouvelle scène peut se composer quelques images plus tard (mesure de sa
    // largeur) et remplacer le bouton tout juste ciblé : pendant ~30 images, le
    // focus est vérifié et replacé sur un « Laisser un message » présent.
    let frames = 0;
    const settle = () => {
      const active = document.activeElement as HTMLElement | null;
      const onButton = active?.isConnected && active.getAttribute("data-action") === "leave-message" && sectionRef.current?.contains(active);
      // Seulement si le focus est perdu : jamais contre un déplacement fait par le visiteur.
      const lost = !active || active === document.body || !active.isConnected;
      if (!onButton && (frames === 0 || lost)) {
        const target = opener.current?.isConnected ? opener.current : sectionRef.current?.querySelector<HTMLElement>('[data-action="leave-message"]');
        target?.focus({ preventScroll: true });
      }
      if (++frames < 30) requestAnimationFrame(settle);
    };
    requestAnimationFrame(settle);
  }, []);
  const onSectionClick = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const button = (e.target as HTMLElement).closest<HTMLElement>('[data-action="leave-message"]');
    if (!button) return;
    opener.current = button;
    setWriting(true);
  }, []);
  const { refresh } = live;
  const onDeposited = useCallback(
    (_kind: string, status: "published" | "pending") => {
      // Une condoléance est publiée aussitôt : elle apparaît dans la rubrique sans recharger.
      if (status === "published") refresh();
    },
    [refresh],
  );
  const publicView = useMemo(() => {
    if (host.mode !== "public" || live.initial === null) return null;
    const { categories, total } = live.initial;
    // L'Album : les pages lues, continues, ordre P1. La scène O8 y ajoute les
    // plus récentes des catégories absentes de ces pages.
    const album = albumOrder(live.items, categories);
    const mapped = album.map(toScene).filter((x): x is NonNullable<typeof x> => x !== null);
    const extras = albumOrder(live.sceneExtras, categories).map(toScene).filter((x): x is NonNullable<typeof x> => x !== null);
    const contents = Object.fromEntries([...mapped, ...extras].map((m) => [m.item.id, m.content]));
    const byId = new Map([...mapped, ...extras].map((m) => [m.item.id, m.item]));
    const scene = selectSceneContributions(
      [...album, ...live.sceneExtras].filter((c) => byId.has(c.id)),
      categories,
    ).map((c) => byId.get(c.id)!);
    // « Voir tous » et l'état vide suivent le TOTAL publié (vue d'ensemble), pas les pages déjà lues.
    const count = Math.max(total, mapped.length + extras.length);
    return { state: contributionsPublicState(categories, mapped.length + extras.length === 0 ? 0 : count), items: mapped.map((m) => m.item), scene, contents };
  }, [host.mode, live.initial, live.items, live.sceneExtras]);

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
    <div
      ref={sectionRef}
      className={SCENE_FONTS}
      data-contributions-host="public"
      data-contributions-state={publicView.state.kind}
      data-contributions-deposit={deposit ? "open" : "none"}
      onClick={deposit ? onSectionClick : undefined}
    >
      <ContributionsLabelsProvider value={labels}>
        <ContributionsPhotoRecoveryProvider value={live.recoverPhoto}>
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
          albumHasMore={live.hasMore}
          onAlbumEndReached={live.loadNextPage}
        />
        </ContributionsPhotoRecoveryProvider>
      </ContributionsLabelsProvider>
      {writing && deposit && live.initial ? (
        <PublicDepositLetter
          slug={deposit.slug}
          actions={deposit.actions}
          language={language}
          theme={skinVariant}
          categories={live.initial.categories}
          onClose={closeLetter}
          returnFocusRef={opener}
          fontsClassName={SCENE_FONTS}
          onDeposited={onDeposited}
        />
      ) : null}
    </div>
  );
}
