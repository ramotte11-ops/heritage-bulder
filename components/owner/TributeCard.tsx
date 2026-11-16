import Link from "next/link";
import { PendingLinkLabel } from "@/components/auth/PendingLinkLabel";
import { heroPhotoPath } from "@/components/builder/preview/hero-photo-path";
import type { Language } from "@/config/languages";
import type { TranslationKey } from "@/lib/i18n/keys";
import { translate, translateWith } from "@/lib/i18n/translate";
import type { FamilyTribute, FamilyTributeState } from "@/lib/owner/family-space";
import type { FamilyTributePhoto } from "@/lib/owner/load-tribute-photos";
import { ArrowIcon, CheckIcon, EmptyPhotoOrnament, PencilIcon } from "./FamilyIcons";
import styles from "./FamilySpace.module.css";

const STATE_LABELS: Record<FamilyTributeState, TranslationKey> = {
  in_preparation: "owner.stateInPreparation",
  published: "owner.statePublished",
  editing: "owner.stateEditing",
  no_longer_visible: "owner.stateNoLongerVisible",
  archived: "owner.stateArchived",
};

/**
 * Espace famille — la carte d'un hommage : tirage papier de la photographie
 * du Hero, nom, années, statut réel, actions.
 *
 * Les actions sont les chemins existants, inchangés : `/builder/{id}` (qui
 * ré-autorise à chaque requête) et `/hommage/{slug}` (uniquement quand le
 * serveur a décidé que la page publique répond : `publicSlug`).
 *
 * - en préparation : « Reprendre l'atelier » ;
 * - publié : « Voir l'hommage », puis le lien secondaire « Modifier » ;
 * - autres états : « Reprendre l'atelier », comme aujourd'hui.
 * Sans photographie : un emplacement sobre et « Ajouter la photo », qui ouvre
 * l'écran photo du Builder (`heroPhotoPath`).
 */
export function TributeCard({
  tribute,
  photo,
  language,
  notes,
}: {
  tribute: FamilyTribute;
  photo: FamilyTributePhoto | null;
  language: Language;
  /** Discreet real deadlines of this tribute, already worded. */
  notes: readonly { kind: "publish" | "draft"; text: string }[];
}) {
  const name = tribute.displayName ?? translate(language, "owner.defaultName");
  const builderPath = `/builder/${encodeURIComponent(tribute.id)}`;
  const published = tribute.state === "published" && tribute.publicSlug !== null;

  return (
    <article className={styles.card} data-tribute={tribute.id} data-tribute-state={tribute.state}>
      <div className={styles.print}>
        <div className={styles.printPaper}>
          <div className={styles.window}>
            {photo ? (
              // A short-lived signed URL of the private bucket: not a
              // candidate for the image optimizer, exactly like the Hero.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className={photo.frame ? styles.photo : `${styles.photo} ${styles.photoCover}`}
                src={photo.readUrl}
                alt={translateWith(language, "owner.photoAlt", { name })}
                style={
                  photo.frame
                    ? {
                        left: `${photo.frame.leftPercent}%`,
                        top: `${photo.frame.topPercent}%`,
                        width: `${photo.frame.widthPercent}%`,
                        height: `${photo.frame.heightPercent}%`,
                      }
                    : undefined
                }
                decoding="async"
              />
            ) : (
              <div className={styles.noPhoto} data-tribute-no-photo="">
                <EmptyPhotoOrnament className={styles.noPhotoOrnament} />
                <p className={styles.noPhotoText}>{translate(language, "owner.noPhoto")}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={styles.body}>
        <h3 className={styles.name}>{name}</h3>
        {tribute.years ? <p className={styles.years}>{tribute.years}</p> : null}

        <p className={styles.badge} data-state={tribute.state}>
          {tribute.state === "published" ? (
            <CheckIcon className={styles.badgeIcon} />
          ) : tribute.state === "in_preparation" || tribute.state === "editing" ? (
            <PencilIcon className={styles.badgeIcon} />
          ) : null}
          {translate(language, STATE_LABELS[tribute.state])}
        </p>

        {notes.map((note) => (
          <p key={note.kind} className={styles.meta} data-free-deadline={note.kind}>
            {note.text}
          </p>
        ))}

        <div className={styles.actions}>
          {published ? (
            <>
              <Link
                href={`/hommage/${encodeURIComponent(tribute.publicSlug as string)}`}
                prefetch={false}
                className={styles.pill}
              >
                {translate(language, "owner.viewTributeShort")}
                <ArrowIcon className={styles.pillIcon} />
              </Link>
              <Link href={builderPath} className={styles.textLink} data-tribute-edit="">
                <PendingLinkLabel pendingLabel={translate(language, "owner.openingBuilder")}>
                  {translate(language, "owner.editTribute")}
                </PendingLinkLabel>
              </Link>
            </>
          ) : (
            <Link href={builderPath} className={`${styles.pill} ${styles.pillPrimary}`}>
              <PendingLinkLabel pendingLabel={translate(language, "owner.openingBuilder")}>
                {translate(language, "owner.resumeBuilder")}
              </PendingLinkLabel>
              <ArrowIcon className={styles.pillIcon} />
            </Link>
          )}
          {tribute.photo === null ? (
            <Link href={heroPhotoPath(builderPath) as string} className={styles.textLink} data-tribute-add-photo="">
              {translate(language, "owner.addPhoto")}
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}
