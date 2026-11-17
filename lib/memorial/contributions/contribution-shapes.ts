import type { V2Slot } from "@/config/gallery-a13-v2-manifests";
import {
  CONTRIBUTIONS_MASTER_ITEMS,
  CONTRIBUTIONS_POLAROID,
  CONTRIBUTIONS_TEXT_CARD_FORMATS,
  type ContributionsFormat,
  type ContributionsTheme,
  type Zone,
} from "@/config/contributions-master-measurements";
import { shapeAt, type GroupShape } from "@/lib/memorial/album/album-group-solver";
import type { PaperProfile, PhotoSource, PolaroidLayout, Rect } from "@/lib/memorial/gallery/dynamic-polaroid-layout";
import { slotRectToCanvas, type Point } from "@/lib/memorial/gallery/dynamic-polaroid-qa";
import { v2SlotToA13 } from "@/lib/memorial/gallery/gallery-v2";

/**
 * M4 — Contributions des proches : les FORMES que la fabrique du solveur A13
 * partagé (`AlbumSolverProfile.shapeFor`) produit pour la rubrique.
 *
 * - CARTE (condoléance, récit haut, récit large) : papier de taille FIXE,
 *   relevée sur le Master du thème (`CONTRIBUTIONS_MASTER_ITEMS`), sans
 *   moyenne Light / Dark ; jamais mise à l'échelle (une condoléance a donc
 *   les mêmes dimensions partout dans une scène) ; ancrée en son centre et
 *   inclinée comme sur le Master. Sa zone PROTÉGÉE (`photo0`, le rôle que
 *   tient la photographie pour un Polaroid) est l'enveloppe du corps, de la
 *   signature et de l'en-tête fixe : avec `minima.photo = 1`, aucun objet
 *   peint au-dessus ne peut en couvrir un seul pixel.
 * - POLAROID : le Polaroid A13 inchangé (`shapeAt` → `layoutDynamicPolaroid` :
 *   ratio naturel, jamais de recadrage) avec le papier relevé en M0. Sa zone
 *   protégée est la bande de LÉGENDE (légende et auteur restent intégralement
 *   lisibles) ; la photographie accepte le « léger chevauchement
 *   photographique » de la PO, borné par le papier visible ≥ 0,90 (M4.1).
 *
 * Pur, sans thème au-delà du choix de la géométrie de Master, sans DOM.
 */

export type ContributionTextFormat = "condolence" | "story-tall" | "story-wide";

/** Zones de la carte, en px du papier (origine : coin haut-gauche du papier). */
export interface CardLayout {
  format: ContributionTextFormat;
  /** Papier dans le repère local du slot (origine : centre, avant rotation). */
  paper: Rect;
  body: Rect;
  signature: Rect;
  overline: Rect | null;
  ornaments: Rect[];
  /** Enveloppe protégée : corps ∪ signature ∪ en-tête. */
  protectedText: Rect;
}

export type ContributionShapeLayout = { kind: "card"; card: CardLayout } | { kind: "polaroid"; polaroid: PolaroidLayout };

/** Format du papier d'un emplacement de Master : R1 = récit haut, R2 = récit large, C1 = condoléance. */
const FORMAT_SOURCE_SLOT = { "story-tall": "R1", "story-wide": "R2", condolence: "C1" } as const;

/**
 * Papier d'un format pour un Master (frame × thème). Une seule valeur par
 * format et par Master : toutes les cartes d'un même format sont identiques.
 */
export function cardPaperSize(format: ContributionTextFormat, frame: ContributionsFormat, theme: ContributionsTheme) {
  const item = CONTRIBUTIONS_MASTER_ITEMS[frame][theme][FORMAT_SOURCE_SLOT[format]];
  return { width: item.size.width, height: item.size.height };
}

const zoneRect = (z: Zone, w: number, h: number): Rect => ({ x: z.x0 * w, y: z.y0 * h, width: (z.x1 - z.x0) * w, height: (z.y1 - z.y0) * h });

function hull(rects: readonly Rect[]): Rect {
  const x0 = Math.min(...rects.map((r) => r.x));
  const y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.width));
  const y1 = Math.max(...rects.map((r) => r.y + r.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

export function cardLayout(format: ContributionTextFormat, paper: { width: number; height: number }): CardLayout {
  const spec = CONTRIBUTIONS_TEXT_CARD_FORMATS[format];
  const { width: w, height: h } = paper;
  const body = zoneRect(spec.body, w, h);
  const signature = zoneRect(spec.signature, w, h);
  const overline = spec.overline ? zoneRect(spec.overline, w, h) : null;
  return {
    format,
    paper: { x: -w / 2, y: -h / 2, width: w, height: h },
    body,
    signature,
    overline,
    ornaments: spec.ornaments.map((z) => zoneRect(z, w, h)),
    protectedText: hull(overline ? [body, signature, overline] : [body, signature]),
  };
}

/** Un rectangle du papier (origine coin haut-gauche) dans le repère local du slot. */
export const paperToLocal = (card: CardLayout, r: Rect): Rect => ({ x: card.paper.x + r.x, y: card.paper.y + r.y, width: r.width, height: r.height });

function polygonBox(poly: Point[]): [number, number, number, number] {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** Forme CARTE au centre témoin du slot. `s` est ignoré : une carte n'est jamais mise à l'échelle. */
export function cardShape(v: V2Slot, format: ContributionTextFormat, frame: ContributionsFormat, theme: ContributionsTheme): GroupShape<ContributionShapeLayout> {
  const card = cardLayout(format, cardPaperSize(format, frame, theme));
  const slot = v2SlotToA13(v);
  const outer0 = slotRectToCanvas(slot, card.paper);
  const photo0 = slotRectToCanvas(slot, paperToLocal(card, card.protectedText));
  return { s: 1, layout: { kind: "card", card }, slot, outer0, photo0, bbox: polygonBox(outer0), area: card.paper.width * card.paper.height };
}

/**
 * Papier du Polaroid de contribution (M0, px source Desktop) : marges
 * latérales et haute fixes, bande basse proportionnelle (≈ 22 % de la hauteur).
 */
export const CONTRIBUTIONS_POLAROID_PAPER: PaperProfile = {
  photoSidePadding: { percent: 0, minPx: CONTRIBUTIONS_POLAROID.paper.sidePaddingPx, maxPx: CONTRIBUTIONS_POLAROID.paper.sidePaddingPx },
  bottomBand: { heightFactor: CONTRIBUTIONS_POLAROID.paper.bottomBandFraction, minPx: 0, maxPx: Number.MAX_SAFE_INTEGER },
};

/** Bande de légende du Polaroid (repère local du slot), entre les marges latérales. */
export function polaroidCaptionBand(l: PolaroidLayout): Rect {
  return { x: l.outer.x + l.window.x, y: l.outer.y + l.band.y, width: l.window.width, height: l.band.height };
}

/** Forme POLAROID : le Polaroid A13 inchangé ; zone protégée = bande de légende. */
export function polaroidShape(v: V2Slot, source: PhotoSource, s: number): GroupShape<ContributionShapeLayout> {
  const base = shapeAt(v, source, s, CONTRIBUTIONS_POLAROID_PAPER);
  const l = base.layout;
  const guarded = polaroidCaptionBand(l);
  return { ...base, layout: { kind: "polaroid", polaroid: l }, photo0: slotRectToCanvas(base.slot, guarded) };
}
