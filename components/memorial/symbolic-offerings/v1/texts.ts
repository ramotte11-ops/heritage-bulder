import type { Language } from "@/config/languages";
import type { OfferingKind } from "@/config/symbolic-offerings-v1-tokens";

/**
 * Offrandes symboliques V1 — textes vivants de la rubrique, FR / EN / ES.
 *
 * FR : formulations validées (maquettes, confirmations officielles ; échec
 * court arbitré par le QG en F1). EN / ES : traductions F1 validées par le
 * QG, fidèles au FR et aux conventions des dictionnaires HERITAGE (EN :
 * « their » pour la personne disparue, orthographe américaine,
 * « Try again » ; ES : vouvoiement, « su memoria », « Reintentar »).
 *
 * Les coupures de ligne sont celles des compositions validées, propres à
 * chaque mise en page (Mobile / Desktop) : chaque entrée est une ligne
 * imposée, posée par sa ligne de base dans la géométrie de
 * `config/symbolic-offerings-v1-tokens.ts`, qui ne change pas avec la
 * langue. Longueurs contrôlées dans les quatre variantes (F1).
 *
 * La signature « HOMMAGE INTEMPOREL » reste identique dans les trois
 * langues (décision QG).
 */
export interface OfferingsV1LayoutTexts {
  intro: readonly string[];
  footer: readonly string[];
  confirmations: Readonly<Record<OfferingKind, readonly string[]>>;
}

export interface OfferingsV1Texts {
  heritage: string;
  subtitle: string;
  title: string;
  script: string;
  cards: Readonly<Record<OfferingKind, { title: string; description: readonly string[] }>>;
  layouts: Readonly<Record<"mobile" | "desktop", OfferingsV1LayoutTexts>>;
  continue: string;
  failure: string;
  retry: string;
  /** Mention de la Preview du Builder (réponse simulée). */
  previewNotice: string;
}

const SIGNATURE = { heritage: "HERITAGE", subtitle: "HOMMAGE INTEMPOREL" } as const;

export const OFFERINGS_V1_TEXTS: Readonly<Record<Language, OfferingsV1Texts>> = {
  fr: {
    ...SIGNATURE,
    title: "Un geste",
    script: "pour sa mémoire",
    cards: {
      lys: { title: "Déposer une fleur", description: ["Une fleur pour exprimer", "votre affection."] },
      bougie: { title: "Allumer une bougie", description: ["Une lumière pour garder", "son souvenir vivant."] },
      coeur: { title: "Offrir un cœur", description: ["Un symbole d’amour", "toujours présent."] },
    },
    layouts: {
      mobile: {
        intro: ["À travers un simple geste,", "faites vivre votre présence", "et honorez son souvenir."],
        footer: ["Chaque geste est une pensée", "offerte en sa mémoire."],
        confirmations: {
          bougie: ["Une lumière brille désormais", "en sa mémoire."],
          lys: ["Une fleur déposée en sa mémoire."],
          coeur: ["Une pensée d’amour offerte", "en sa mémoire."],
        },
      },
      desktop: {
        intro: ["À travers un simple geste, faites vivre votre présence", "et honorez son souvenir."],
        footer: ["Chaque geste est une pensée offerte en sa mémoire."],
        confirmations: {
          bougie: ["Une lumière brille désormais en sa mémoire."],
          lys: ["Une fleur déposée en sa mémoire."],
          coeur: ["Une pensée d’amour offerte en sa mémoire."],
        },
      },
    },
    continue: "Poursuivre la visite",
    failure: "Votre geste n’a pas pu être enregistré.",
    retry: "Réessayer",
    previewNotice: "Aperçu — essai libre des gestes. La confirmation est simulée : aucun geste n’est enregistré.",
  },
  en: {
    ...SIGNATURE,
    title: "A gesture",
    // « in their memory » rejeté en F1 : le jambage du « y » manuscrit
    // traverse la ligne d'introduction.
    script: "in remembrance",
    cards: {
      lys: { title: "Lay a flower", description: ["A flower to express", "your affection."] },
      bougie: { title: "Light a candle", description: ["A light to keep", "their memory alive."] },
      coeur: { title: "Offer a heart", description: ["A symbol of love", "ever present."] },
    },
    layouts: {
      mobile: {
        intro: ["Through a simple gesture,", "make your presence felt", "and honor their memory."],
        footer: ["Each gesture is a thought", "offered in their memory."],
        confirmations: {
          bougie: ["A light now shines", "in their memory."],
          lys: ["A flower laid in their memory."],
          coeur: ["A loving thought offered", "in their memory."],
        },
      },
      desktop: {
        intro: ["Through a simple gesture, make your presence felt", "and honor their memory."],
        footer: ["Each gesture is a thought offered in their memory."],
        confirmations: {
          bougie: ["A light now shines in their memory."],
          lys: ["A flower laid in their memory."],
          coeur: ["A loving thought offered in their memory."],
        },
      },
    },
    continue: "Continue the visit",
    failure: "Your gesture could not be saved.",
    retry: "Try again",
    previewNotice: "Preview — try the gestures freely. The confirmation is simulated: no gesture is saved.",
  },
  es: {
    ...SIGNATURE,
    title: "Un gesto",
    script: "en su memoria",
    cards: {
      lys: { title: "Depositar una flor", description: ["Una flor para expresar", "su afecto."] },
      bougie: { title: "Encender una vela", description: ["Una luz para mantener", "vivo su recuerdo."] },
      coeur: { title: "Ofrecer un corazón", description: ["Un símbolo de amor", "siempre presente."] },
    },
    layouts: {
      mobile: {
        intro: ["A través de un simple gesto,", "haga sentir su presencia", "y honre su recuerdo."],
        footer: ["Cada gesto es un pensamiento", "ofrecido en su memoria."],
        confirmations: {
          bougie: ["Una luz brilla ahora", "en su memoria."],
          lys: ["Una flor depositada en su memoria."],
          coeur: ["Un pensamiento de amor", "ofrecido en su memoria."],
        },
      },
      desktop: {
        intro: ["A través de un simple gesto, haga sentir su presencia", "y honre su recuerdo."],
        footer: ["Cada gesto es un pensamiento ofrecido en su memoria."],
        confirmations: {
          bougie: ["Una luz brilla ahora en su memoria."],
          lys: ["Una flor depositada en su memoria."],
          coeur: ["Un pensamiento de amor ofrecido en su memoria."],
        },
      },
    },
    continue: "Continuar la visita",
    failure: "Su gesto no se pudo guardar.",
    retry: "Reintentar",
    previewNotice: "Vista previa — pruebe libremente los gestos. La confirmación es simulada: no se guarda ningún gesto.",
  },
};
