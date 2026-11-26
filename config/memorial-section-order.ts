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
 *   7. symbolicOfferings  Offrandes symboliques V1 (Preview du Builder,
 *                    simulée ; page publique depuis QG 016)
 *   8. testimonials  Contributions des proches (les condoléances y sont
 *                    intégrées : catégorie « condolences » d'A15)
 *   9. video         « Des instants pour se souvenir » (VID-08)
 *  10. condolences   identifiant historique conservé, sans renderer :
 *                    jamais dessiné, aucune rubrique autonome
 *  11. Livre de mémoire — futur chantier, aucune réservation technique
 *
 * VID-08 — ordre définitif retenu par la PO (25 novembre 2026) :
 * OFFRANDES → CONTRIBUTIONS DES PROCHES → VIDÉO HOMMAGE → pied de page.
 * La rubrique Condoléances n'est plus une section publique autonome : les
 * condoléances font partie des Contributions des proches. L'identifiant
 * `condolences` reste dans le catalogue (contrainte CHECK de
 * `memorials.enabled_sections`, sélection A00, données existantes) ; sans
 * renderer, il n'est jamais dessiné. Rien n'est supprimé.
 *
 * M3 — décision PO du 20 octobre : GALERIE → OFFRANDES SYMBOLIQUES →
 * CONTRIBUTIONS DES PROCHES. VID-08 : la Vidéo, construite, prend la
 * place décidée par la PO, après les Contributions (voir ci-dessus).
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
  "symbolicOfferings",
  "testimonials",
  "video",
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
