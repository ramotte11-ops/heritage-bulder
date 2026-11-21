import type { MemorialContent } from "@/types/memorial";

/**
 * M7 — PRÉPARATION de la rubrique « Contributions des proches » dans le
 * Builder : ce que la famille choisit d'ouvrir à ses proches.
 *
 * Stocké dans le brouillon, sous `content.contributions` :
 *
 *   { "features": { "condolences": true, "stories": false, "photos": true } }
 *
 * - Ce sont des choix de PRÉPARATION, jamais des droits de publication : la
 *   publication (offre gratuite ou complète, types de messages admis) reste
 *   décidée côté serveur par la politique existante
 *   (`lib/memorial/publication-policy.ts`), qui ne lit pas cette clé.
 *   La projection publiée est une liste blanche : `contributions` n'entre
 *   dans aucune copie publiée tant que M8 ne l'a pas explicitement ajoutée.
 * - Les exemples montrés dans le Builder sont VISUELS : ils ne sont jamais
 *   écrits ici (ni ailleurs). Seuls trois booléens le sont.
 * - Réversible : chaque choix se rouvre et se change tant que la famille
 *   prépare son hommage ; rien n'est supprimé.
 * - Lecture défensive (même discipline que `readGuidedFlowState`) : une
 *   valeur mal formée est signalée `corrupted`, jamais silencieusement
 *   remplacée ; une clé inconnue sous `contributions` (version future)
 *   est conservée telle quelle à l'écriture.
 */

export const CONTRIBUTION_FEATURES = ["condolences", "stories", "photos"] as const;
export type ContributionFeature = (typeof CONTRIBUTION_FEATURES)[number];

export type ContributionsFeatures = Readonly<Record<ContributionFeature, boolean>>;

/** Rien d'ouvert : l'état de départ d'une famille qui n'a pas encore choisi. */
export const NO_CONTRIBUTION_FEATURES: ContributionsFeatures = { condolences: false, stories: false, photos: false };

export type ContributionsSettingsRead =
  | { status: "absent"; features: ContributionsFeatures }
  | { status: "valid"; features: ContributionsFeatures }
  | { status: "corrupted" };

interface ContributionsContent {
  contributions?: unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Lit les choix de préparation ; `absent` = jamais choisi (rien d'ouvert). */
export function inspectContributionsSettings(content: MemorialContent): ContributionsSettingsRead {
  const raw = (content as ContributionsContent).contributions;
  if (raw === undefined) return { status: "absent", features: NO_CONTRIBUTION_FEATURES };
  if (!isPlainObject(raw) || !isPlainObject(raw.features)) return { status: "corrupted" };
  const features = raw.features;
  const out: Record<ContributionFeature, boolean> = { condolences: false, stories: false, photos: false };
  for (const f of CONTRIBUTION_FEATURES) {
    const v = features[f];
    if (v === undefined) continue;
    if (typeof v !== "boolean") return { status: "corrupted" };
    out[f] = v;
  }
  return { status: "valid", features: out };
}

/** Au moins une fonctionnalité ouverte : la rubrique existe pour la famille. */
export function hasOpenContributionFeature(features: ContributionsFeatures): boolean {
  return CONTRIBUTION_FEATURES.some((f) => features[f]);
}

/**
 * Écrit les trois choix, sans toucher à aucune autre clé du brouillon ; les
 * clés inconnues de `contributions` et de `contributions.features` (versions
 * futures) sont gardées telles quelles. `Object.fromEntries` garde une clé
 * stockée telle que `"__proto__"` une propriété ordinaire.
 */
export function writeContributionsSettings(content: MemorialContent, features: ContributionsFeatures): MemorialContent {
  const raw = (content as ContributionsContent).contributions;
  const previous = isPlainObject(raw) ? raw : {};
  const previousFeatures = isPlainObject(previous.features) ? previous.features : {};
  const nextFeatures = Object.fromEntries([
    ...Object.entries(previousFeatures).filter(([k]) => !(CONTRIBUTION_FEATURES as readonly string[]).includes(k)),
    ...CONTRIBUTION_FEATURES.map((f) => [f, features[f] === true] as const),
  ]);
  const contributions = Object.fromEntries([...Object.entries(previous).filter(([k]) => k !== "features"), ["features", nextFeatures]]);
  return { ...content, contributions } as MemorialContent;
}
