import type { Language } from "@/config/languages";

/**
 * VID-05A — textes de la rubrique « Des instants pour se souvenir ».
 *
 * Français : titre et sous-titre OFFICIELS (décision PO, VID-02 V1.1),
 * universels, identiques quels que soient le genre de la personne et le
 * nombre de vidéos. Anglais et espagnol : traductions proposées, à valider
 * par la PO avant toute publication.
 */
export interface VideoHommageTexts {
  title: string;
  subtitle: string;
  defaultTitle(position: number): string;
  /** Nom accessible d'un sélecteur : « Lire Souvenir 2, 3 minutes 21 ». */
  selectLabel(title: string, duration: string | null): string;
  playerLabel(title: string): string;
  preparing: string;
  error: string;
  localUnavailable: string;
  empty: string;
  selectorsLabel: string;
}

function spokenDuration(duration: string | null, minutes: string, seconds: string): string {
  if (duration === null) return "";
  const [m, s] = duration.split(":");
  return `, ${Number(m)} ${minutes} ${Number(s)} ${seconds}`;
}

export const VIDEO_HOMMAGE_TEXTS: Record<Language, VideoHommageTexts> = {
  fr: {
    title: "Des instants pour se souvenir",
    subtitle: "Quelques instants précieux à revivre et à partager.",
    defaultTitle: (position) => `Souvenir ${position}`,
    selectLabel: (title, duration) => `Lire ${title}${spokenDuration(duration, "min", "s")}`,
    playerLabel: (title) => `Vidéo : ${title}`,
    preparing: "Vidéo en préparation",
    error: "Cette vidéo ne peut pas être lue pour le moment.",
    localUnavailable: "Pour revoir cette vidéo, sélectionnez-la à nouveau sur votre appareil.",
    empty: "Aucune vidéo pour le moment.",
    selectorsLabel: "Choisir un souvenir",
  },
  en: {
    title: "Moments to remember",
    subtitle: "A few precious moments to relive and to share.",
    defaultTitle: (position) => `Memory ${position}`,
    selectLabel: (title, duration) => `Play ${title}${spokenDuration(duration, "min", "s")}`,
    playerLabel: (title) => `Video: ${title}`,
    preparing: "Video being prepared",
    error: "This video cannot be played right now.",
    localUnavailable: "To watch this video again, select it again on your device.",
    empty: "No video yet.",
    selectorsLabel: "Choose a memory",
  },
  es: {
    title: "Momentos para recordar",
    subtitle: "Algunos momentos preciosos para revivir y compartir.",
    defaultTitle: (position) => `Recuerdo ${position}`,
    selectLabel: (title, duration) => `Reproducir ${title}${spokenDuration(duration, "min", "s")}`,
    playerLabel: (title) => `Vídeo: ${title}`,
    preparing: "Vídeo en preparación",
    error: "Este vídeo no se puede reproducir por ahora.",
    localUnavailable: "Para volver a ver este vídeo, selecciónelo de nuevo en su dispositivo.",
    empty: "Todavía no hay vídeos.",
    selectorsLabel: "Elegir un recuerdo",
  },
};
