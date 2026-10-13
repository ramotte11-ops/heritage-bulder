import type { HeroContent } from "@/types/hero";
import type { DeathNoticeContent, DeathNoticePrecisions } from "@/types/death-notice";
import { EMPTY_DEATH_NOTICE_PRECISIONS } from "@/types/death-notice";

/**
 * Avis de décès V2 — phase 1 : contenus de validation du pilote Mobile
 * Light. Ce sont des données de Builder ordinaires (mêmes types que
 * `content.hero` / `content.deathNotice`), jamais des textes inventés par
 * le renderer.
 *
 * `REFERENCE` reprend mot pour mot les textes de la maquette Mobile Light.
 * Les guillemets de trois précisions y sont TAPÉS par la famille (la
 * maquette les montre) : le renderer n'en ajoute jamais (décision PO).
 */

export interface DeathNoticeV2PilotCase {
  id: string;
  label: string;
  hero: HeroContent;
  deathNotice: DeathNoticeContent;
}

function hero(displayName: string, birth: HeroContent["birth"], death: HeroContent["death"]): HeroContent {
  return { displayName, birth, death, shortPhrase: null, photo: null };
}

function notice(announcementText: string, precisions: Partial<DeathNoticePrecisions>): DeathNoticeContent {
  return { announcementText, precisions: { ...EMPTY_DEATH_NOTICE_PRECISIONS, ...precisions } };
}

const REFERENCE_PRECISIONS: DeathNoticePrecisions = {
  generalLocation: "Paris, France",
  familyMessage: "“Ton sourire nous accompagnera toujours.”",
  thought: "“Chaque souvenir est une lumière qui demeure.”",
  quote: "“Ce qui est aimé ne disparaît jamais vraiment.”",
  other: "La famille remercie chaleureusement tous ceux qui partagent son souvenir.",
};

const REFERENCE_ANNOUNCEMENT =
  "C’est avec une profonde tristesse que sa famille annonce le départ d’Élise, dont la douceur et la générosité resteront à jamais dans nos cœurs.";

export const DEATH_NOTICE_V2_PILOT_CASES: readonly DeathNoticeV2PilotCase[] = [
  {
    id: "reference",
    label: "Référence maquette (5 précisions)",
    hero: hero("Élise Martin", { precision: "year", year: 1948 }, { precision: "year", year: 2023 }),
    deathNotice: notice(REFERENCE_ANNOUNCEMENT, REFERENCE_PRECISIONS),
  },
  {
    id: "long",
    label: "Contenu long (nom, dates complètes, annonce et 5 précisions longues)",
    hero: hero(
      "Marie-Christine Évelyne de La Rochefoucauld-Montbrison",
      { precision: "date", date: "1938-09-12" },
      { precision: "date", date: "2026-03-03" },
    ),
    deathNotice: notice(
      "C’est avec une immense tristesse que ses enfants, ses petits-enfants et toute sa famille vous font part du décès de Marie-Christine, survenu paisiblement entourée des siens.\n\nInstitutrice pendant quarante ans dans le même village, elle a appris à lire à trois générations d’enfants, qui se souviennent de sa patience, de son rire et de ses carnets remplis de poèmes. Elle aimait les jardins, les longues promenades au bord de la Loire et les tablées du dimanche où chacun trouvait sa place.\n\nSa bienveillance, sa curiosité et sa fidélité en amitié resteront pour nous un exemple et une source de réconfort.",
      {
        generalLocation: "Dans l’intimité familiale, à Saint-Benoît-sur-Loire, puis au cimetière de Germigny-des-Prés, auprès de son époux.",
        familyMessage:
          "Nous remercions du fond du cœur l’équipe soignante de la maison de santé des Tilleuls, qui l’a accompagnée avec tant de douceur, ainsi que ses voisins et amis pour leur présence fidèle pendant ces derniers mois.",
        thought:
          "Tu nous as appris que la gentillesse n’est jamais une faiblesse, et qu’un jardin se cultive comme une amitié : avec patience, chaque jour, même quand il pleut.",
        quote: "Ceux que nous aimons ne nous quittent jamais tout à fait ; ils marchent à nos côtés, chaque jour, invisibles mais toujours présents.",
        other:
          "Ni fleurs ni couronnes : selon son souhait, vos dons peuvent être adressés à l’association des bibliothèques rurales du Loiret, qu’elle a soutenue toute sa vie.",
      },
    ),
  },
  {
    id: "none",
    label: "Sans précision",
    hero: hero("Élise Martin", { precision: "year", year: 1948 }, { precision: "year", year: 2023 }),
    deathNotice: notice(REFERENCE_ANNOUNCEMENT, {}),
  },
  {
    id: "one",
    label: "Une précision (citation)",
    hero: hero("Élise Martin", { precision: "year", year: 1948 }, { precision: "year", year: 2023 }),
    deathNotice: notice(REFERENCE_ANNOUNCEMENT, { quote: REFERENCE_PRECISIONS.quote }),
  },
  {
    id: "two",
    label: "Deux précisions (lieu, citation)",
    hero: hero("Élise Martin", { precision: "year", year: 1948 }, { precision: "year", year: 2023 }),
    deathNotice: notice(REFERENCE_ANNOUNCEMENT, {
      generalLocation: REFERENCE_PRECISIONS.generalLocation,
      quote: REFERENCE_PRECISIONS.quote,
    }),
  },
  {
    id: "three",
    label: "Trois précisions (lieu, pensée, autre)",
    hero: hero("Élise Martin", { precision: "date", date: "1948-04-17" }, null),
    deathNotice: notice(REFERENCE_ANNOUNCEMENT, {
      generalLocation: REFERENCE_PRECISIONS.generalLocation,
      thought: REFERENCE_PRECISIONS.thought,
      other: REFERENCE_PRECISIONS.other,
    }),
  },
  {
    id: "four",
    label: "Quatre précisions",
    hero: hero("Élise Martin", { precision: "year", year: 1948 }, { precision: "year", year: 2023 }),
    deathNotice: notice(REFERENCE_ANNOUNCEMENT, {
      generalLocation: REFERENCE_PRECISIONS.generalLocation,
      familyMessage: REFERENCE_PRECISIONS.familyMessage,
      thought: REFERENCE_PRECISIONS.thought,
      quote: REFERENCE_PRECISIONS.quote,
    }),
  },
];
