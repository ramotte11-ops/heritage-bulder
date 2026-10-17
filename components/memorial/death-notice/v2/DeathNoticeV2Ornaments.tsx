import { useId } from "react";
import type { SkinVariant } from "@/config/skins";
import type { DeathNoticePrecisionField } from "@/lib/memorial/death-notice";
import styles from "./DeathNoticeV2.module.css";

/**
 * Avis de décès V2 — phase 2 : ornements Mobile Light, reconstruits d'après
 * la maquette `01_MAQUETTES_ILLUSTREES/MOBILE_LIGHT.png` (autorité
 * artistique). Purement décoratifs (`aria-hidden`) : l'étiquette voisine
 * porte le sens. Aucun texte familial n'y entre.
 *
 *   - Médaillon : anneau cuivré biseauté et face de bronze brossé en CSS
 *     (module), pictogramme en relief en SVG (dégradé champagne, ombre
 *     portée sombre, liseré de lumière en haut). Ø 95 px de canevas.
 *   - Rameau : six feuilles et une tige en SVG, x 382–540 / y 287–366 de la
 *     maquette, posé dans le flux sous le titre.
 *   - Cœur : tracé au trait, 30 × 27 px de canevas.
 *
 * Tracés en unités de leur propre viewBox ; la taille rendue vient du
 * module CSS (px de canevas rapportés à la largeur réelle), le ratio est
 * toujours conservé : aucun ornement n'est déformé par la largeur.
 *
 * Phase 3 : mêmes tracés pour Light et Dark ; seules les couleurs changent,
 * par une palette relevée sur la maquette de CHAQUE variante
 * (`ORNAMENT_PALETTES`). La palette Light reprend exactement les valeurs
 * validées en phase 2.
 */

export interface OrnamentPalette {
  /** Dégradé du relief des pictogrammes (haut → bas). */
  reliefStops: readonly (readonly [number, string])[];
  reliefShadow: { color: string; opacity: number };
  reliefLight: { color: string; opacity: number };
  /** Nervures et découpes des pictogrammes (couleur de la face). */
  iconFace: string;
  /** Dégradé transversal d'une feuille du rameau (bord → bord). */
  leafStops: readonly (readonly [number, string])[];
  branchStem: string;
  branchVein: { color: string; opacity: number };
  /** Liseré autour du rameau : clair sur papier, ombre sur cuir. */
  branchHalo: { dy: number; blur: number; color: string; opacity: number };
  heartStroke: string;
}

export const ORNAMENT_PALETTES: Readonly<Record<SkinVariant, OrnamentPalette>> = Object.freeze({
  /** Mobile Light — phase 2, validé PO : valeurs inchangées. */
  light: {
    reliefStops: [
      [0, "#fffaf0"],
      [0.22, "#fadcb2"],
      [0.55, "#e2aa70"],
      [0.8, "#c4884f"],
      [1, "#9d5d2a"],
    ],
    reliefShadow: { color: "#140600", opacity: 0.95 },
    reliefLight: { color: "#fff3dc", opacity: 0.75 },
    iconFace: "#4a280f",
    leafStops: [
      [0, "#3a3a2a"],
      [0.3, "#5f5e46"],
      [0.5, "#959274"],
      [0.62, "#6b6a50"],
      [1, "#36372a"],
    ],
    branchStem: "#2f2f22",
    branchVein: { color: "#cfccb2", opacity: 0.45 },
    branchHalo: { dy: 0.6, blur: 0.6, color: "#fff6e6", opacity: 0.9 },
    heartStroke: "#1a1611",
  },
  /**
   * Mobile Dark — maquette Dark : pictogrammes du même bronze champagne ;
   * rameau champagne doré (#5a4a28 → #e2d0a2), sans liseré clair mais
   * avec une ombre douce sur le cuir ; cœur au trait doré (#ecd3a9).
   */
  dark: {
    reliefStops: [
      [0, "#fffaf0"],
      [0.22, "#fadcb2"],
      [0.55, "#e2aa70"],
      [0.8, "#c4884f"],
      [1, "#9d5d2a"],
    ],
    reliefShadow: { color: "#0d0400", opacity: 0.95 },
    reliefLight: { color: "#fff3dc", opacity: 0.75 },
    iconFace: "#4a280f",
    leafStops: [
      [0, "#5a4a28"],
      [0.3, "#9c8758"],
      [0.5, "#e2d0a2"],
      [0.62, "#b8a372"],
      [1, "#56462a"],
    ],
    branchStem: "#c2a872",
    branchVein: { color: "#f6e7bf", opacity: 0.55 },
    branchHalo: { dy: 0.8, blur: 0.8, color: "#0b0602", opacity: 0.7 },
    heartStroke: "#ecd3a9",
  },
});

/** Dégradés et filtres du relief des pictogrammes, propres à chaque SVG
 * (ids uniques par instance). */
function ReliefDefs({ id, palette }: { id: string; palette: OrnamentPalette }) {
  return (
    <defs>
      {/* En coordonnées du disque : un dégradé « objectBoundingBox » ne
          peint pas un trait parfaitement vertical (boîte de largeur nulle). */}
      <linearGradient id={`${id}-fill`} gradientUnits="userSpaceOnUse" x1="38" y1="12" x2="58" y2="84">
        {palette.reliefStops.map(([offset, color]) => (
          <stop key={offset} offset={offset} stopColor={color} />
        ))}
      </linearGradient>
      <filter id={`${id}-relief`} x="-25%" y="-25%" width="150%" height="150%">
        <feDropShadow dx="0.7" dy="1.4" stdDeviation="0.4" floodColor={palette.reliefShadow.color} floodOpacity={palette.reliefShadow.opacity} />
        <feDropShadow dx="-0.5" dy="-0.7" stdDeviation="0.2" floodColor={palette.reliefLight.color} floodOpacity={palette.reliefLight.opacity} />
      </filter>
    </defs>
  );
}

/** Feuille lancéolée de base à pointe, la plus large au tiers de la base
 * (unités libres). Sert aux pictogrammes et au rameau. */
function leafPath(base: [number, number], tip: [number, number], half: number): string {
  const [bx, by] = base;
  const [tx, ty] = tip;
  const dx = tx - bx;
  const dy = ty - by;
  const len = Math.hypot(dx, dy);
  const nx = -dy / len;
  const ny = dx / len;
  const c1x = bx + dx * 0.3;
  const c1y = by + dy * 0.3;
  const c2x = bx + dx * 0.72;
  const c2y = by + dy * 0.72;
  const k = half * 1.35;
  const f = (n: number) => n.toFixed(2);
  return [
    `M${f(bx)} ${f(by)}`,
    `C${f(c1x + nx * k)} ${f(c1y + ny * k)} ${f(c2x + nx * k * 0.7)} ${f(c2y + ny * k * 0.7)} ${f(tx)} ${f(ty)}`,
    `C${f(c2x - nx * k * 0.7)} ${f(c2y - ny * k * 0.7)} ${f(c1x - nx * k)} ${f(c1y - ny * k)} ${f(bx)} ${f(by)}`,
    "Z",
  ].join(" ");
}

/** Une feuille de pictogramme : pleine, nervure sombre. */
function IconLeaf({ base, tip, half, fill, face }: { base: [number, number]; tip: [number, number]; half: number; fill: string; face: string }) {
  const vx = base[0] + (tip[0] - base[0]) * 0.78;
  const vy = base[1] + (tip[1] - base[1]) * 0.78;
  return (
    <g>
      <path d={leafPath(base, tip, half)} fill={fill} />
      <path d={`M${base[0]} ${base[1]} L${vx} ${vy}`} stroke={face} strokeWidth="1.3" strokeLinecap="round" opacity="0.75" />
    </g>
  );
}

/** Les cinq pictogrammes, en unités d'un disque de 100 (centre 50, 50),
 * relevés sur les médaillons de la maquette (×4). */
function Pictogram({ field, fill, face }: { field: DeathNoticePrecisionField; fill: string; face: string }) {
  switch (field) {
    case "generalLocation":
      return (
        <g>
          <path
            d="M50 76.5 C45.5 68.5 35.5 58 35.5 44.5 A14.5 14.5 0 0 1 64.5 44.5 C64.5 58 54.5 68.5 50 76.5 Z"
            fill="none"
            stroke={fill}
            strokeWidth="6"
            strokeLinejoin="round"
          />
          <circle cx="50" cy="44.5" r="6.6" fill="none" stroke={fill} strokeWidth="3.4" />
          <circle cx="50" cy="44.5" r="2.2" fill={fill} />
        </g>
      );
    case "familyMessage":
      return (
        <g>
          <circle cx="31" cy="42.5" r="5.4" fill={fill} />
          <circle cx="69" cy="42.5" r="5.4" fill={fill} />
          <circle cx="31" cy="42.5" r="1.6" fill={face} opacity="0.7" />
          <circle cx="69" cy="42.5" r="1.6" fill={face} opacity="0.7" />
          <path d="M20 66 V58.5 C20 52.5 24 50 31 50 C35.5 50 38.5 51 40.5 52.5 V66 Z" fill={fill} />
          <path d="M80 66 V58.5 C80 52.5 76 50 69 50 C64.5 50 61.5 51 59.5 52.5 V66 Z" fill={fill} />
          <circle cx="50" cy="34" r="7.4" fill="none" stroke={fill} strokeWidth="3.8" />
          <path
            d="M38 68 V57.5 C38 50.5 42.5 46.5 50 46.5 C57.5 46.5 62 50.5 62 57.5 V68 Z"
            fill={fill}
            stroke={face}
            strokeWidth="1.8"
          />
        </g>
      );
    case "thought":
      return (
        <g>
          <path d="M38.5 77.5 C43 75 47.5 72.5 50 68.5 V27" fill="none" stroke={fill} strokeWidth="3" strokeLinecap="round" />
          <IconLeaf base={[50.5, 30]} tip={[57, 12.5]} half={5.6} fill={fill} face={face} />
          <IconLeaf base={[50, 45]} tip={[32, 34]} half={6.2} fill={fill} face={face} />
          <IconLeaf base={[50, 41]} tip={[67, 29.5]} half={6.2} fill={fill} face={face} />
          <IconLeaf base={[50, 59]} tip={[30, 51]} half={6.6} fill={fill} face={face} />
          <IconLeaf base={[50, 55.5]} tip={[70, 46]} half={6.6} fill={fill} face={face} />
        </g>
      );
    case "quote":
      return (
        <g fill={fill}>
          {[39, 62].map((cx) => (
            <path
              key={cx}
              d={`M${cx - 10} 58 A10 10 0 1 0 ${cx + 0.5} 48.1 C${cx - 3.2} 47.4 ${cx - 5.2} 45 ${cx - 4} 41.2 C${cx - 2.6} 37 ${cx + 1.6} 34.2 ${cx + 6.8} 32.4 L${cx + 5.4} 28.6 C${cx - 3.8} 31 ${cx - 10} 38.6 ${cx - 10} 58 Z`}
            />
          ))}
        </g>
      );
    case "other":
      return (
        <g>
          <path d="M50 82 V40" fill="none" stroke={fill} strokeWidth="3.2" strokeLinecap="round" />
          <path d="M50 50 C43.5 43.5 43 30.5 50 18.5 C57 30.5 56.5 43.5 50 50 Z" fill={fill} />
          <path d="M50 45 C48.2 38.5 48.4 30.5 50 25" fill="none" stroke={face} strokeWidth="1.8" strokeLinecap="round" opacity="0.8" />
          <IconLeaf base={[50, 63]} tip={[30, 42.5]} half={6} fill={fill} face={face} />
          <IconLeaf base={[50, 63]} tip={[70, 42.5]} half={6} fill={fill} face={face} />
        </g>
      );
  }
}

/** Médaillon bronze d'une précision : présent si, et seulement si, son
 * bloc l'est (rendu par ce bloc). */
export function Medallion({ field, palette }: { field: DeathNoticePrecisionField; palette: OrnamentPalette }) {
  const id = useId().replace(/:/g, "");
  return (
    <span className={styles.medallion} data-ornament="medaillon" aria-hidden="true">
      <svg className={styles.medallionIcon} viewBox="0 0 100 100" focusable="false">
        <ReliefDefs id={id} palette={palette} />
        <g filter={`url(#${id}-relief)`}>
          <Pictogram field={field} fill={`url(#${id}-fill)`} face={palette.iconFace} />
        </g>
      </svg>
    </span>
  );
}

/** Feuilles du rameau : base, pointe et demi-largeur (unités du viewBox,
 * origine = x 382 / y 284 de la maquette). */
const BRANCH_LEAVES: readonly { base: [number, number]; tip: [number, number]; half: number }[] = [
  { base: [32, 55.5], tip: [60.5, 19.7], half: 9.6 },
  { base: [67, 52], tip: [109.3, 7.2], half: 12 },
  { base: [109.5, 40.5], tip: [158, 2.5], half: 12.6 },
  { base: [36, 60.5], tip: [80.5, 83], half: 10.6 },
  { base: [74.5, 53.5], tip: [125.5, 74], half: 10.8 },
  { base: [106, 44.5], tip: [158, 57], half: 10.2 },
];

/** Rameau décoratif sous le titre. */
export function Branch({ palette }: { palette: OrnamentPalette }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg className={styles.branch} data-ornament="rameau" aria-hidden="true" viewBox="0 0 160 86" focusable="false">
      <defs>
        {BRANCH_LEAVES.map((leaf, i) => {
          const [bx, by] = leaf.base;
          const [tx, ty] = leaf.tip;
          const len = Math.hypot(tx - bx, ty - by);
          const nx = (-(ty - by) / len) * leaf.half;
          const ny = ((tx - bx) / len) * leaf.half;
          const mx = (bx + tx) / 2;
          const my = (by + ty) / 2;
          return (
            <linearGradient
              key={i}
              id={`${id}-leaf${i}`}
              gradientUnits="userSpaceOnUse"
              x1={mx + nx}
              y1={my + ny}
              x2={mx - nx}
              y2={my - ny}
            >
              {palette.leafStops.map(([offset, color]) => (
                <stop key={offset} offset={offset} stopColor={color} />
              ))}
            </linearGradient>
          );
        })}
        <filter id={`${id}-halo`} x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow
            dx="0"
            dy={palette.branchHalo.dy}
            stdDeviation={palette.branchHalo.blur}
            floodColor={palette.branchHalo.color}
            floodOpacity={palette.branchHalo.opacity}
          />
        </filter>
      </defs>
      <g filter={`url(#${id}-halo)`}>
        <path
          d="M1.8 61 C14 60.5 24 59.5 33 57.5 C46 54.5 58 52.5 68 50.5 C84 47 98 43.5 108.5 41 C111 40.2 112.8 39.4 114 38.6"
          fill="none"
          stroke={palette.branchStem}
          strokeWidth="2.7"
          strokeLinecap="round"
        />
        {BRANCH_LEAVES.map((leaf, i) => (
          <g key={i}>
            <path d={leafPath(leaf.base, leaf.tip, leaf.half)} fill={`url(#${id}-leaf${i})`} />
            <path
              d={`M${leaf.base[0]} ${leaf.base[1]} L${leaf.base[0] + (leaf.tip[0] - leaf.base[0]) * 0.86} ${leaf.base[1] + (leaf.tip[1] - leaf.base[1]) * 0.86}`}
              stroke={palette.branchVein.color}
              strokeWidth="0.7"
              strokeLinecap="round"
              opacity={palette.branchVein.opacity}
            />
          </g>
        ))}
      </g>
    </svg>
  );
}

/** Cœur au trait entre les dates et l'annonce. */
export function Heart({ palette }: { palette: OrnamentPalette }) {
  return (
    <svg className={styles.heart} data-ornament="coeur" aria-hidden="true" viewBox="0 0 30 27" focusable="false">
      <path
        d="M15 25.2 L4.1 14.3 C0.9 11.1 1 6 4.3 3.2 C7.4 0.6 11.9 1.3 14.2 4.6 L15 5.8 L15.8 4.6 C18.1 1.3 22.6 0.6 25.7 3.2 C29 6 29.1 11.1 25.9 14.3 Z"
        fill="none"
        stroke={palette.heartStroke}
        strokeWidth="2.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}
