import type { TraditionEntry, TraditionsContent } from "@/types/traditions";

/**
 * Traditions & repères V2 — contenus de validation du pilote Mobile Light.
 * Données de Builder ordinaires (même type que `content.traditions`), jamais
 * des textes inventés par le renderer.
 *
 * `reference` reprend mot pour mot les quatre repères du Master illustré :
 * ils servent seulement de référence visuelle de la PO (calage et
 * superposition) — aucun repère n'est imposé aux familles.
 */

export interface TraditionsV2PilotCase {
  id: string;
  label: string;
  traditions: TraditionsContent;
}

function entry(n: number, title: string | null, text: string): TraditionEntry {
  return { id: `pilot-${n}`, origin: "custom", suggestionId: null, title, text };
}

const MASTER_ENTRIES: readonly TraditionEntry[] = [
  entry(
    1,
    "Cérémonie & recueillement",
    "Merci d’arriver quelques minutes en avance afin de partager ensemble un moment de calme et de recueillement.",
  ),
  entry(
    2,
    "Fleurs & attentions",
    "Si vous le souhaitez, vous pouvez offrir des fleurs ou une pensée symbolique. Votre présence est déjà un grand soutien.",
  ),
  entry(
    3,
    "Accompagnement au cimetière",
    "Pour ceux qui le souhaitent, un temps d’accompagnement aura lieu au cimetière après la cérémonie.",
  ),
  entry(
    4,
    "Autres traditions & souhaits",
    "La famille reste à l’écoute de vos gestes et de vos attentions, dans le respect des souhaits d’Élise et de ses proches.",
  ),
];

const EXTRA_ENTRIES: readonly TraditionEntry[] = [
  entry(5, "Tenue", "Aucune tenue particulière n’est demandée ; venez comme vous êtes."),
  entry(6, "Collation", "Une collation sera servie à la salle des fêtes après l’inhumation."),
  entry(7, "Musique", "Si vous jouez d’un instrument, la famille serait heureuse de vous entendre."),
  entry(8, "Dons", "Vos dons peuvent être adressés à l’association des bibliothèques rurales."),
];

const ALL = [...MASTER_ENTRIES, ...EXTRA_ENTRIES];

function first(count: number): TraditionsContent {
  return { entries: ALL.slice(0, count) };
}

export const TRADITIONS_V2_PILOT_CASES: readonly TraditionsV2PilotCase[] = [
  { id: "reference", label: "Référence Master (4 repères)", traditions: first(4) },
  { id: "one", label: "1 repère", traditions: first(1) },
  { id: "two", label: "2 repères", traditions: first(2) },
  { id: "six", label: "6 repères", traditions: first(6) },
  { id: "eight", label: "8 repères", traditions: first(8) },
  {
    id: "untitled",
    label: "Titres absents",
    traditions: {
      entries: [
        entry(1, null, MASTER_ENTRIES[0].text),
        entry(2, MASTER_ENTRIES[1].title, MASTER_ENTRIES[1].text),
        entry(3, null, "Merci."),
      ],
    },
  },
  {
    id: "long",
    label: "Titres et textes longs",
    traditions: {
      entries: [
        entry(
          1,
          "Accompagnement au cimetière communal de Saint-Benoît-sur-Loire",
          "Pour celles et ceux qui le souhaitent, un temps d’accompagnement aura lieu au cimetière communal après la cérémonie religieuse.\n\nLe cortège partira à pied depuis l’église ; les personnes qui le préfèrent pourront rejoindre directement l’entrée principale, avenue des Tilleuls, où un membre de la famille les accueillera.\n\nMerci de garer vos véhicules sur le parking de la salle des fêtes afin de laisser l’accès libre aux services funéraires.",
        ),
        entry(
          2,
          "Fleurs",
          "Selon le souhait de notre mère, ni fleurs ni couronnes : si vous le désirez, vos dons peuvent être adressés à l’association des bibliothèques rurales du Loiret, qu’elle a soutenue pendant plus de quarante ans, ou à la maison de santé des Tilleuls, dont l’équipe l’a accompagnée avec tant de douceur.",
        ),
        entry(
          3,
          "Une pensée",
          "Unenotetrèslonguesansaucunespacepourvérifierquelecontenunedébordejamaisdesonfeuilletmêmesurlesécranslesplusétroits.",
        ),
      ],
    },
  },
];
