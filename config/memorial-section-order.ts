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
 *   7. video         Vidéo — emplacement réservé
 *   8. testimonials  Contributions des proches
 *   9. condolences   Condoléances (rubrique distincte, jamais fusionnée)
 *  10. Offrandes symboliques — V1 confirmée, identifiant à définir :
 *      réservée dans `RESERVED_MEMORIAL_SLOTS` ci-dessous, hors SectionId
 *  11. Livre de mémoire — futur chantier, aucune réservation technique
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
  "testimonials",
  "condolences",
];

/**
 * Rubriques réservées — a place in the V1 editorial order for a rubrique
 * confirmed by the QG but not built yet.
 *
 * Deliberately NOT `SectionId`s: they are not in the catalog, have no
 * selection status, no readiness rule, no renderer, no label, no
 * translation and nothing stored in Supabase or in a draft. The
 * composition never reads this list, so a reserved slot can never
 * render. `symbolicOfferings` is a provisional reservation key only —
 * the definitive section identifier is still to be decided by the QG,
 * and becomes a `SectionId` (appended to `MEMORIAL_SECTION_ORDER` at
 * this place) only when the rubrique is actually built.
 */
export const RESERVED_MEMORIAL_SLOTS = ["symbolicOfferings"] as const;

export type ReservedMemorialSlot = (typeof RESERVED_MEMORIAL_SLOTS)[number];

/** The full V1 editorial order: the existing sections, then the reserved
 * slots. Documentation and guard only — nothing renders from it. */
export const MEMORIAL_EDITORIAL_ORDER: readonly (SectionId | ReservedMemorialSlot)[] = [
  ...MEMORIAL_SECTION_ORDER,
  ...RESERVED_MEMORIAL_SLOTS,
];
