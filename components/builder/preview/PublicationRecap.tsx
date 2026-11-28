import type { ReactNode } from "react";
import type { Language } from "@/config/languages";
import type { SectionId } from "@/config/sections";
import { translate, translateWith } from "@/lib/i18n/translate";
import type { TranslationKey } from "@/lib/i18n/keys";
import type { PublicationRecap as Recap } from "@/lib/memorial/publication-recap";
import styles from "./PreviewPublicationPanel.module.css";

/**
 * 05-R1 — the body of the ONE publication confirmation: a short recap of
 * what will be public, what stays private (free tribute), how long, and
 * what can no longer be changed. Text only: the complete tribute's recap
 * never shows the photographs again (décision PO), and the free gallery
 * choice is the existing one, handed in as `gallerySlot`, unchanged.
 *
 * Display only — every fact comes from `describePublicationRecap`, itself
 * derived from data the server already computed for the Preview.
 * 05-R2 (après 06-F) : the complete tribute's term is deliberately absent.
 */

const SECTION_LABEL_KEYS: Partial<Record<SectionId, TranslationKey>> = {
  hero: "publish.recapHero",
  deathNotice: "visibility.section.deathNotice",
  story: "visibility.section.story",
  ceremony: "visibility.section.ceremony",
  traditions: "visibility.section.traditions",
  gallery: "visibility.section.gallery",
  testimonials: "visibility.section.testimonials",
  condolences: "visibility.section.condolences",
  video: "visibility.section.video",
  memoryMessage: "visibility.section.memoryMessage",
  symbolicOfferings: "visibility.section.symbolicOfferings",
};

function sectionLabel(language: Language, sectionId: SectionId): string | null {
  const key = SECTION_LABEL_KEYS[sectionId];
  return key === undefined ? null : translate(language, key);
}

export interface PublicationRecapProps {
  language: Language;
  recap: Recap;
  /** The free gallery choice (more than six photos), rendered as today. */
  gallerySlot?: ReactNode;
}

export function PublicationRecap({ language, recap, gallerySlot }: PublicationRecapProps) {
  const free = recap.offer === "free";
  const t = (key: TranslationKey) => translate(language, key);

  const contributionLines: TranslationKey[] = [];
  if (recap.contributions !== null) {
    const { condolences, stories, photos } = recap.contributions;
    if (condolences) contributionLines.push("publish.recapCondolences");
    if (stories && photos) contributionLines.push("publish.recapStoriesPhotos");
    else if (stories) contributionLines.push("publish.recapStories");
    else if (photos) contributionLines.push("publish.recapPhotos");
  }

  function details(sectionId: SectionId): ReactNode {
    if (sectionId === "gallery" && recap.galleryCount !== null) {
      if (free) return gallerySlot === undefined ? <p className={styles.recapDetail}>{t("publish.freeGalleryLimit")}</p> : null;
      return (
        <p className={styles.recapDetail} data-publication-recap-gallery="">
          {translateWith(language, "publish.completeGallery", { count: recap.galleryCount })}
        </p>
      );
    }
    if (sectionId === "video" && !free && recap.videoCount !== null) {
      return <p className={styles.recapDetail}>{t("publish.completeVideos")}</p>;
    }
    if (sectionId === "testimonials" && contributionLines.length > 0) {
      return contributionLines.map((key) => (
        <p key={key} className={styles.recapDetail}>
          {t(key)}
        </p>
      ));
    }
    return null;
  }

  const privateItems: ReactNode[] = [];
  if (free && recap.previewOnlyVideoCount > 0) {
    privateItems.push(
      <li key="videos" data-publication-recap-private-videos="">
        {t("publish.freeVideos")}
      </li>,
    );
  }
  for (const sectionId of recap.hiddenSections) {
    const label = sectionLabel(language, sectionId);
    if (label === null) continue;
    privateItems.push(<li key={`hidden-${sectionId}`}>{translateWith(language, "publish.recapHiddenSection", { section: label })}</li>);
  }

  return (
    <div className={styles.recap} data-publication-recap={recap.offer}>
      <section className={styles.recapBlock} aria-labelledby="publication-recap-visible">
        <h3 id="publication-recap-visible" className={styles.recapHeading}>
          {t("publish.recapVisible")}
        </h3>
        <ul className={styles.recapList} data-publication-recap-visible="">
          {recap.visible.map(({ sectionId, archived }) => {
            const label = sectionLabel(language, sectionId);
            if (label === null) return null;
            return (
              <li key={`${sectionId}-${archived ? "archived" : "flow"}`} data-section={sectionId}>
                {archived ? translateWith(language, "publish.recapArchived", { section: label }) : label}
                {!archived && details(sectionId)}
              </li>
            );
          })}
        </ul>
        {gallerySlot}
      </section>

      {(free || privateItems.length > 0) && (
        <section className={styles.recapBlock} aria-labelledby="publication-recap-private" data-publication-recap-private="">
          <h3 id="publication-recap-private" className={styles.recapHeading}>
            {t("publish.recapPrivate")}
          </h3>
          {free && recap.previewOnlyVideoCount > 0 && <p className={styles.recapDetail}>{t("publish.freePreviewNote")}</p>}
          {privateItems.length > 0 && <ul className={styles.recapList}>{privateItems}</ul>}
          {free && <p className={styles.recapDetail}>{t("publish.freeReserved")}</p>}
        </section>
      )}

      {free && (
        <section className={styles.recapBlock} aria-labelledby="publication-recap-duration" data-publication-recap-duration="">
          <h3 id="publication-recap-duration" className={styles.recapHeading}>
            {t("publish.recapDuration")}
          </h3>
          <p className={styles.recapDetail}>{t("publish.freeDuration")}</p>
          <p className={styles.recapDetail}>{t("publish.freeQuota")}</p>
        </section>
      )}

      {/* 05-R1-C — partage : le lien existe dès la publication ; le QR code
          est annoncé sans promesse de disponibilité immédiate (aucun
          générateur n'existe encore). Ni l'un ni l'autre n'ouvre un accès
          au-delà de la visibilité de l'offre ; aucune durée premium avant 05-R2. */}
      <section className={styles.recapBlock} aria-labelledby="publication-recap-share" data-publication-recap-share="">
        <h3 id="publication-recap-share" className={styles.recapHeading}>
          {t("publish.shareTitle")}
        </h3>
        <p className={styles.recapDetail}>{t("publish.shareLink")}</p>
        <p className={styles.recapDetail}>{t("publish.shareQr")}</p>
        <p className={styles.recapDetail}>{t(free ? "publish.shareFreeAccess" : "publish.shareCompleteAccess")}</p>
        <p className={styles.recapDetail}>{t("publish.shareCemetery")}</p>
      </section>

      <section className={styles.recapBlock} aria-labelledby="publication-recap-after" data-publication-recap-locks="">
        <h3 id="publication-recap-after" className={styles.recapHeading}>
          {t("publish.recapAfter")}
        </h3>
        <p className={styles.recapDetail}>{t("publish.recapLocked")}</p>
      </section>
    </div>
  );
}
