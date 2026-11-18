import type { ContributionKind, ContributionSceneItem } from "@/lib/memorial/contributions/contributions-scene";

/**
 * M5-A — contributions FICTIVES de démonstration (pilote seulement). Les
 * textes des Masters de la PO sont repris pour les premières ; les autres
 * sont écrits pour la démonstration. Aucune n'est une contribution réelle.
 */

export interface DemoContributionContent {
  /** Auteur (signature d'une carte, deuxième ligne de la légende d'une photo). */
  author: string;
  /** Message de condoléances, récit ou anecdote ; null pour une photo. */
  text: string | null;
  /** Légende d'une photographie ; null pour une carte. */
  caption: string | null;
  photo: { src: string; width: number; height: number } | null;
}

export type DemoContribution = ContributionSceneItem & { content: DemoContributionContent };

const DEMO = "/assets/contributions/v1/demo";

const CONDOLENCES: DemoContributionContent[] = [
  { author: "Marie et Pierre", text: "Nous vous adressons nos pensées les plus affectueuses. Élise restera dans nos cœurs.", caption: null, photo: null },
  { author: "La famille Durand", text: "De tout cœur avec vous dans cette épreuve. Nos pensées vous accompagnent.", caption: null, photo: null },
  { author: "Hélène et Jacques", text: "Avec toute notre affection, nous partageons votre peine.", caption: null, photo: null },
  { author: "Les voisins du Clos", text: "Élise était une lumière pour tout le quartier. Sincères condoléances.", caption: null, photo: null },
];

const STORIES: DemoContributionContent[] = [
  {
    author: "Sophie",
    text: "Ta bienveillance, ton sourire et ta façon unique de rendre chaque moment plus doux resteront toujours dans nos cœurs. Merci d’avoir été une lumière dans nos vies.",
    caption: null,
    photo: null,
  },
  { author: "Marc", text: "Tu as illuminé nos vies par ta gentillesse et ta force tranquille. Ton souvenir continuera de m’inspirer chaque jour.", caption: null, photo: null },
  {
    author: "Antoine",
    text: "Chaque été, Élise nous attendait au portail avec une corbeille de cerises et mille questions sur l’année écoulée. Elle se souvenait de tout : nos examens, nos amours, nos petits chagrins. Elle nous apprenait les noms des fleurs du jardin, nous racontait la maison de son enfance à Collioure et riait plus fort que nous de ses propres histoires. Ce rire-là, je l’entends encore.",
    caption: null,
    photo: null,
  },
  { author: "Camille", text: "Ses dimanches au jardin, son thé à la menthe et sa patience infinie. Merci pour tout.", caption: null, photo: null },
];

const PHOTOS: DemoContributionContent[] = [
  { author: "Marion, sa petite-fille", text: null, caption: "Nos dimanches au jardin.", photo: { src: `${DEMO}/photo-demo-jardin.webp`, width: 291, height: 270 } },
  { author: "Julien, son petit-fils", text: null, caption: "L’été des marguerites.", photo: { src: `${DEMO}/photo-demo-jardin-portrait.webp`, width: 202, height: 270 } },
  { author: "Claire, sa fille", text: null, caption: "Le jardin en juin.", photo: { src: `${DEMO}/photo-demo-jardin-paysage.webp`, width: 291, height: 218 } },
  { author: "Paul, son voisin", text: null, caption: "Toujours un sourire.", photo: { src: `${DEMO}/photo-demo-jardin.webp`, width: 291, height: 270 } },
];

const LETTER: Record<string, ContributionKind> = { C: "condolence", R: "story", P: "photo" };

/** Compositions de démonstration : C condoléance, R récit, P photographie (1 à 4, ou plus pour « Voir tous »). */
export function demoContributions(combo: string): DemoContribution[] {
  const used = { condolence: 0, story: 0, photo: 0 };
  return [...combo.toUpperCase()]
    .filter((c) => c in LETTER)
    .map((c, i) => {
      const kind = LETTER[c];
      const pool = kind === "condolence" ? CONDOLENCES : kind === "story" ? STORIES : PHOTOS;
      const content = pool[used[kind]++ % pool.length];
      const item: DemoContribution = { id: `demo-${i}-${c}`, kind, content };
      if (content.photo) item.photo = { width: content.photo.width, height: content.photo.height };
      return item;
    });
}

export const DEMO_TITLE = "Contributions des proches";
export const DEMO_SUBTITLE = "Souvenirs, pensées et mots d’amour partagés par la famille et les amis en mémoire d’Élise Martin.";
export const DEMO_CLOSING = "Vos mots font vivre sa mémoire et perpétuent sa lumière.";
