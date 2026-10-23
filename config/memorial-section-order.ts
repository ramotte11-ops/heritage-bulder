import type { SectionId } from "./sections";

/**
 * Fondation Memorial assemblé — the canonical order in which an assembled
 * Memorial lists its sections.
 *
 * ORDRE CANONIQUE VALIDÉ — rectificatif final du QG (ordre des rubriques).
 *
 *   1. hero          Hero
 *   2. deathNotice   Avis de décès
 *   3. ceremony      Cérémonie
 *   4. story         Récit de vie
 *   5. traditions    Traditions & repères
 *   6. gallery       Galerie photos
 *   7. video         Vidéo — emplacement réservé (inchangé)
 *   8. symbolicOfferings  Offrandes symboliques V1 (M3 : Preview du
 *                    Builder seulement — voir plus bas)
 *   9. testimonials  Contributions des proches
 *  10. condolences   Condoléances (rubrique distincte, jamais fusionnée)
 *  11. Livre de mémoire — futur chantier, aucune réservation technique
 *
 * M3 — décision PO du 20 octobre : GALERIE → OFFRANDES SYMBOLIQUES →
 * CONTRIBUTIONS DES PROCHES. La Vidéo ne doit être ni déplacée ni
 * supprimée : elle garde sa place, juste après la Galerie, et les
 * Offrandes s'insèrent entre elle et les Contributions. Tant que la Vidéo
 * n'a pas de renderer, elle n'est jamais dessinée : les Offrandes
 * apparaissent donc directement après la Galerie. Quand la Vidéo sera
 * construite, l'ordre relatif Vidéo / Offrandes reste une décision QG.
 *
 * `story` → `traditions` is an artistic authority: their Masters were
 * designed to follow each other. Nothing may be inserted between them.
 *
 * This is the ONE place the composition model
 * (lib/memorial/composition/compose-memorial.ts) reads section order
 * from. It deliberately does not derive order from anything else:
 *
 *  - not from the Guided Flow (the order in which the family is ASKED
 *    for each matter is a conversation design, not a page layout — the
 *    Builder still asks Traditions (A09) before the Récit (A10–A12));
 *  - not from `config/sections.ts`'s `MEMORIAL_SECTIONS` (the catalog of
 *    WHICH sections exist — read through Mission 027's section-selection,
 *    never through this file);
 *  - not from the order components happen to appear in code.
 *
 * B02-L2 — one single HERITAGE route: there is no per-editorial-context
 * order. Whether the death notice, traditions and condolences show is
 * decided by A00 inside section-selection, not by this list; a section
 * without a renderer (video, testimonials, condolences) is listed here
 * but never drawn (`noRenderer`).
 */
export const MEMORIAL_SECTION_ORDER: readonly SectionId[] = [
  "hero",
  "deathNotice",
  "ceremony",
  "story",
  "traditions",
  "gallery",
  "video",
  "symbolicOfferings",
  "testimonials",
  "condolences",
];

/**
 * Rubriques réservées — a place in the V1 editorial order for a rubrique
 * confirmed by the QG but not built yet. Deliberately NOT `SectionId`s:
 * the composition never reads this list, so a reserved slot can never
 * render.
 *
 * Empty since M3: `symbolicOfferings`, the one reservation (formerly
 * after condolences), became a real `SectionId`, placed by the PO
 * decision of 20 October after the Galerie and before the Contributions
 * des proches.
 */
export const RESERVED_MEMORIAL_SLOTS = [] as const;

export type ReservedMemorialSlot = (typeof RESERVED_MEMORIAL_SLOTS)[number];

/** The full V1 editorial order: the existing sections, then the reserved
 * slots. Documentation and guard only — nothing renders from it. */
export const MEMORIAL_EDITORIAL_ORDER: readonly (SectionId | ReservedMemorialSlot)[] = [
  ...MEMORIAL_SECTION_ORDER,
  ...RESERVED_MEMORIAL_SLOTS,
];
