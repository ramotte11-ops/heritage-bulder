import type { CeremonyContent, CeremonyMoment } from "@/types/ceremony";

/**
 * Cérémonie Intemporel V2 — contenus de validation du pilote C1.
 * Données de Builder ordinaires (même type que `content.ceremony`, avec le
 * déroulement `programme` de B1), jamais des textes inventés par le
 * renderer.
 *
 * `reference` reprend mot pour mot les contenus du Master illustré : ils
 * servent seulement de référence visuelle de la PO (calage et
 * superposition) — rien n'est imposé aux familles.
 *
 * `reference-en` et `reference-es` : des contenus de démonstration
 * RÉDIGÉS en anglais et en espagnol, comme une famille les écrirait
 * (décision QG sur Traditions) — jamais une traduction automatique des
 * textes d'une famille, que le renderer n'opère pas.
 */

export interface CeremonyV2PilotCase {
  id: string;
  label: string;
  ceremony: CeremonyContent;
}

function moment(n: number, time: string | null, label: string, detail: string | null = null): CeremonyMoment {
  return { id: `pilot-${n}`, time, label, detail };
}

const MASTER_PROGRAMME: readonly CeremonyMoment[] = [
  moment(1, "14:00", "Accueil des proches"),
  moment(2, "14:30", "Cérémonie religieuse"),
  moment(3, "15:30", "Temps de recueillement"),
  moment(4, "16:00", "Verre de l’amitié", "Salle paroissiale"),
];

const REFERENCE: CeremonyContent = {
  date: "2023-10-21",
  time: "14:00",
  venueName: "Église Saint-Joseph",
  address: "1234, rue des Érables\nLyon, 69002",
  access: "Des places de stationnement sont disponibles à proximité de l’église.",
  note: "La cérémonie est accessible aux personnes à mobilité réduite.",
  programme: MASTER_PROGRAMME,
};

/** Sans déroulement : la clé `programme` est absente (B1 n'écrit jamais
 * de liste vide). */
const WITHOUT_PROGRAMME: CeremonyContent = {
  date: REFERENCE.date,
  time: REFERENCE.time,
  venueName: REFERENCE.venueName,
  address: REFERENCE.address,
  access: REFERENCE.access,
  note: REFERENCE.note,
};

export const CEREMONY_V2_PILOT_CASES: readonly CeremonyV2PilotCase[] = [
  { id: "reference", label: "Référence Master (déroulement de 4 moments)", ceremony: REFERENCE },
  { id: "no-programme", label: "Sans déroulement", ceremony: WITHOUT_PROGRAMME },
  {
    id: "one-moment",
    label: "Un seul moment, sans heure",
    ceremony: { ...REFERENCE, programme: [moment(1, null, "Cérémonie civile", "Salle des fêtes")] },
  },
  {
    id: "untimed",
    label: "Déroulement sans aucune heure",
    ceremony: {
      ...REFERENCE,
      programme: [moment(1, null, "Accueil des proches"), moment(2, null, "Hommage"), moment(3, null, "Verre de l’amitié")],
    },
  },
  {
    id: "long",
    label: "Contenus longs",
    ceremony: {
      date: "2024-02-29",
      time: "09:30",
      venueName: "Basilique Notre-Dame-de-Bon-Secours et chapelle du Souvenir de Saint-Martin-de-la-Vallée",
      address:
        "Entrée principale, 12 bis avenue du Général-de-Gaulle-et-de-la-Libération\nRésidence des Tilleuls, bâtiment C\n69002 Lyon",
      access:
        "Le parking de la salle des fêtes est ouvert dès 8 h ; merci de laisser libres les places réservées aux services funéraires devant l’église.\n\nUne navette partira de la gare SNCF à 8 h 45, puis de la place du Marché à 9 h 00.",
      note: "La cérémonie est accessible aux personnes à mobilité réduite par la porte latérale, rue des Lilas.\nUnenotetrèslonguesansaucunespacepourvérifierquelecontenunedébordejamaisdesoncartouchemêmesurlesécranslesplusétroits.",
      programme: [
        moment(1, "09:30", "Accueil des proches et des amis venus de loin, autour d’un café", "Parvis de la basilique, sous le grand tilleul"),
        moment(2, "10:00", "Cérémonie religieuse célébrée par le père Jean-Baptiste Delacroix-Montmorency"),
        moment(3, "11:15", "Temps de recueillement"),
        moment(4, null, "Lecture d’un poème choisi par ses petits-enfants"),
        moment(5, "12:00", "Inhumation au cimetière communal", "Allée des Cèdres, carré 4"),
        moment(6, "13:00", "Verre de l’amitié", "Salle paroissiale"),
        moment(7, "14:30", "Fin de la journée"),
        moment(8, "15:00", "Départ du car pour Saint-Étienne"),
      ],
    },
  },
  {
    id: "minimal",
    label: "Date seule, sans lieu ni informations",
    ceremony: { date: "2023-10-21", time: null, venueName: null, address: null, access: null, note: null },
  },
  {
    id: "place-only",
    label: "Lieu seul, sans adresse, avec déroulement",
    ceremony: {
      date: null,
      time: null,
      venueName: "Crématorium du Grand Lyon",
      address: null,
      access: null,
      note: null,
      programme: MASTER_PROGRAMME.slice(0, 2),
    },
  },
  {
    id: "reference-en",
    label: "Démonstration rédigée en anglais",
    ceremony: {
      date: "2023-10-21",
      time: "14:00",
      venueName: "St Joseph’s Church",
      address: "1234 Maple Street\nSpringfield, IL 62704",
      access: "Parking is available next to the church.",
      note: "The church is fully wheelchair accessible.",
      programme: [
        moment(11, "14:00", "Welcoming family and friends"),
        moment(12, "14:30", "Funeral service"),
        moment(13, "15:30", "A moment of reflection"),
        moment(14, "16:00", "Reception", "Parish hall"),
      ],
    },
  },
  {
    id: "reference-es",
    label: "Démonstration rédigée en espagnol",
    ceremony: {
      date: "2023-10-21",
      time: "14:00",
      venueName: "Iglesia de San José",
      address: "Calle de los Arces, 1234\n28013 Madrid",
      access: "Hay aparcamiento disponible junto a la iglesia.",
      note: "La ceremonia es accesible para personas con movilidad reducida.",
      programme: [
        moment(21, "14:00", "Recepción de los allegados"),
        moment(22, "14:30", "Misa funeral"),
        moment(23, "15:30", "Momento de recogimiento"),
        moment(24, "16:00", "Vino de honor", "Salón parroquial"),
      ],
    },
  },
];
