import type { Language } from "@/config/languages";
import { translate, translateWith } from "@/lib/i18n/translate";

/**
 * M8-E3 — les libellés de la rubrique « Contributions des proches », en
 * FR/EN/ES (O11 : une seule rubrique, même nom dans tous les écrans).
 *
 * Le français est le texte des Masters validés (M0 à M6), inchangé. Les
 * versions anglaise et espagnole reprennent les propositions du contrat
 * M8-P (§ 6) ; elles restent à valider par la PO avec la fenêtre de dépôt
 * (E4). Les textes des proches ne sont jamais traduits.
 */

export interface ContributionsLabels {
  leaveMessage: string;
  viewAll: string;
  readMore: string;
  close: string;
  condolenceOverline: string;
  emptyWelcome: string;
  emptyInvitation: string;
  condolenceOf: (name: string) => string;
  storyOf: (name: string) => string;
  photoBy: (name: string) => string;
  messageFrom: (name: string) => string;
  openCondolence: (name: string) => string;
  openStory: (name: string) => string;
  openPhoto: (name: string) => string;
}

export function contributionsLabels(language: Language): ContributionsLabels {
  const t = (k: Parameters<typeof translate>[1]) => translate(language, k);
  const tn = (k: Parameters<typeof translateWith>[1]) => (name: string) => translateWith(language, k, { name });
  return {
    leaveMessage: t("contributionsScene.leaveMessage"),
    viewAll: t("contributionsScene.viewAll"),
    readMore: t("contributionsScene.readMore"),
    close: t("contributionsScene.close"),
    condolenceOverline: t("contributionsScene.condolenceOverline"),
    emptyWelcome: t("contributionsScene.emptyWelcome"),
    emptyInvitation: t("contributionsScene.emptyInvitation"),
    condolenceOf: tn("contributionsScene.condolenceOf"),
    storyOf: tn("contributionsScene.storyOf"),
    photoBy: tn("contributionsScene.photoBy"),
    messageFrom: tn("contributionsScene.messageFrom"),
    openCondolence: tn("contributionsScene.openCondolence"),
    openStory: tn("contributionsScene.openStory"),
    openPhoto: tn("contributionsScene.openPhoto"),
  };
}

/** « de Jean Dupont », mais « d’Élise Martin », « d’Hélène » (élision française). */
export function frenchOfName(name: string): string {
  return /^[aeiouyhàâäéèêëîïôöùûüÿæœ]/i.test(name) ? `d’${name}` : `de ${name}`;
}

export interface ContributionsTexts {
  title: string;
  subtitle: string;
  closing: string;
  closingEmpty: string;
}

/** Titre, sous-titre (avec le nom de la personne), phrases finales. */
export function contributionsTexts(language: Language, displayName: string | null): ContributionsTexts {
  const name = displayName?.trim() ?? "";
  const subtitle =
    name === ""
      ? translate(language, "contributionsScene.subtitleNoName")
      : language === "fr"
        ? translateWith(language, "contributionsScene.subtitle", { ofName: frenchOfName(name) })
        : translateWith(language, "contributionsScene.subtitle", { name });
  return {
    title: translate(language, "contributionsScene.title"),
    subtitle,
    closing: translate(language, "contributionsScene.closing"),
    closingEmpty: translate(language, "contributionsScene.closingEmpty"),
  };
}
