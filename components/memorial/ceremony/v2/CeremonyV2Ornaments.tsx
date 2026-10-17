import { useId } from "react";
import styles from "./CeremonyV2.module.css";

/**
 * Cérémonie Intemporel V2 — ornements reconstruits d'après le Master
 * illustré Mobile Light. Purement décoratifs (`aria-hidden`) : aucun texte
 * de la famille n'y entre.
 *
 *   - Rameaux d'olivier (feuilles pleines, tige sombre, halo clair) :
 *     sous le titre (x 385–560, y 298–382), sous l'heure (x 240–335,
 *     y 755–805) et sous la phrase du pied (x 405–550, y 1508–1580).
 *     Chaque tracé est relevé sur son propre rameau, en coordonnées de
 *     son viewBox (origine = coin haut gauche de la boîte relevée).
 *   - Pictogrammes au trait des médaillons : calendrier (date et heure),
 *     repère de lieu, trois personnes (déroulement), « i » cerclé
 *     (informations pratiques) — trait sombre régulier, extrémités
 *     franches, comme le Master.
 *   - Cœur au trait du pied (x 456–488, y 1427–1456).
 *
 * La taille rendue vient du module CSS (px de canevas rapportés à la
 * largeur réelle) ; le ratio est toujours conservé.
 */

type Point = readonly [number, number];
interface Leaf {
  base: Point;
  tip: Point;
  half: number;
}

/** Feuille lancéolée, la plus large au tiers de la base. */
function leafPath({ base, tip, half }: Leaf): string {
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
  const k = half * 1.5;
  const f = (n: number) => n.toFixed(2);
  return [
    `M${f(bx)} ${f(by)}`,
    `C${f(c1x + nx * k)} ${f(c1y + ny * k)} ${f(c2x + nx * k * 0.7)} ${f(c2y + ny * k * 0.7)} ${f(tx)} ${f(ty)}`,
    `C${f(c2x - nx * k * 0.7)} ${f(c2y - ny * k * 0.7)} ${f(c1x - nx * k)} ${f(c1y - ny * k)} ${f(bx)} ${f(by)}`,
    "Z",
  ].join(" ");
}

interface SprigShape {
  viewBox: string;
  stem: string;
  stemWidth: number;
  leaves: readonly Leaf[];
}

/** Rameaux relevés sur le Master (voir l'en-tête du fichier). */
const SPRIGS: Record<"title" | "date" | "footer" | "titleDark" | "dateDark" | "footerDark", SprigShape> = {
  // Sous le titre : trois feuilles dessus, deux dessous (175 × 84).
  title: {
    viewBox: "0 0 175 84",
    stem: "M8 60.5 C 40 56 80 50 113 36.5",
    stemWidth: 2.6,
    leaves: [
      { base: [30, 55], tip: [58, 21], half: 7 },
      { base: [70, 47], tip: [104, 7.5], half: 8 },
      { base: [112, 37], tip: [164, 13.5], half: 9 },
      { base: [44, 57], tip: [85, 75], half: 7 },
      { base: [86, 49], tip: [138, 66], half: 8 },
    ],
  },
  // Sous l'heure : petit rameau horizontal, trois feuilles de chaque côté
  // (95 × 50).
  date: {
    viewBox: "0 0 95 50",
    stem: "M8 28 C 30 28 48 26 64 22.5",
    stemWidth: 1.8,
    leaves: [
      { base: [22, 27], tip: [42, 11], half: 4.5 },
      { base: [41, 25], tip: [60, 8], half: 4.5 },
      { base: [62, 22.5], tip: [87, 11], half: 5 },
      { base: [25, 29], tip: [47, 42], half: 4.5 },
      { base: [47, 27], tip: [68, 37], half: 4.5 },
      { base: [63, 24], tip: [82, 29], half: 4 },
    ],
  },
  // Au pied, sous la phrase manuscrite : trois feuilles de chaque côté
  // (145 × 72).
  footer: {
    viewBox: "0 0 145 72",
    stem: "M11 40.5 C 40 40 70 37 100 32.5",
    stemWidth: 2.2,
    leaves: [
      { base: [37, 39], tip: [66, 13], half: 6.5 },
      { base: [67, 35], tip: [94, 9], half: 6.5 },
      { base: [96, 32], tip: [124, 9], half: 6.5 },
      { base: [44, 42], tip: [79, 62], half: 6.5 },
      { base: [77, 39], tip: [111, 54], half: 6.5 },
      { base: [100, 34], tip: [134, 44], half: 6 },
    ],
  },
  // Mobile Dark (C2), relevés sur le Master illustré Dark : feuilles plus
  // allongées et plus couchées que celles du Light.
  // Sous le titre (x 390–560, y 280–350) : trois feuilles dessus, deux
  // dessous (170 × 70).
  titleDark: {
    viewBox: "0 0 170 70",
    stem: "M11 47.5 C 40 46 75 41 107.5 32",
    stemWidth: 2.4,
    leaves: [
      { base: [35, 44], tip: [62, 16], half: 7 },
      { base: [69, 39], tip: [101, 7.5], half: 7.5 },
      { base: [107.5, 32], tip: [156, 12.5], half: 8.5 },
      { base: [45, 47.5], tip: [82, 65.5], half: 7 },
      { base: [86, 40], tip: [132, 55], half: 7.5 },
    ],
  },
  // Sous l'heure (x 238–342, y 710–764) : trois feuilles de chaque côté
  // (104 × 54).
  dateDark: {
    viewBox: "0 0 104 54",
    stem: "M7.5 31 C 30 30.5 50 28 70 23.5",
    stemWidth: 1.8,
    leaves: [
      { base: [25, 28], tip: [45, 11], half: 5 },
      { base: [45, 27], tip: [67, 8], half: 5 },
      { base: [70, 23.5], tip: [97, 12], half: 5.5 },
      { base: [27.5, 32], tip: [50, 46], half: 5 },
      { base: [50, 30], tip: [76, 41], half: 5 },
      { base: [67, 27], tip: [90, 32.5], half: 4.5 },
    ],
  },
  // Au pied (x 410–555, y 1458–1526) : trois feuilles de chaque côté
  // (145 × 68).
  footerDark: {
    viewBox: "0 0 145 68",
    stem: "M11 39 C 40 38.5 72 36 100 31",
    stemWidth: 2.2,
    leaves: [
      { base: [34, 37.5], tip: [64, 12], half: 6.5 },
      { base: [65, 34], tip: [92.5, 7.5], half: 6.5 },
      { base: [96, 30.5], tip: [122.5, 7], half: 6.5 },
      { base: [41, 41], tip: [77.5, 62], half: 6.5 },
      { base: [75, 37.5], tip: [112.5, 54.5], half: 6.5 },
      { base: [100, 32], tip: [135, 39], half: 6 },
    ],
  },
};

/** Teintes des rameaux : feuillage gris-vert et halo ivoire (Light) ;
 * bronze doré relevé sur le Master Dark (#d6aa72 au plus clair, tige
 * #a57b4a), ombre brune sur le cuir. */
const SPRIG_TONES = {
  olive: {
    stops: ["#2f3025", "#525343", "#7c7b65", "#4b4c3c", "#2a2b22"],
    stem: "#2f3027",
    halo: { color: "#fff8ec", opacity: 0.95 },
  },
  bronze: {
    stops: ["#6e4a2a", "#a37444", "#d6aa72", "#9a6c3e", "#5e3f22"],
    stem: "#a57b4a",
    halo: { color: "#1a0f07", opacity: 0.5 },
  },
} as const;

export type SprigTone = keyof typeof SPRIG_TONES;
export type SprigShapeName = keyof typeof SPRIGS;

/** Rameau d'olivier : feuillage gris-vert et halo clair sur le papier
 * ivoire (Light), bronze doré sur le cuir (Dark). */
export function OliveSprig({
  className,
  shape,
  tone = "olive",
}: {
  className: string;
  shape: SprigShapeName;
  tone?: SprigTone;
}) {
  const id = useId().replace(/:/g, "");
  const s = SPRIGS[shape];
  const t = SPRIG_TONES[tone];
  return (
    <svg className={className} viewBox={s.viewBox} aria-hidden="true" focusable="false" data-ornament="rameau">
      <defs>
        <linearGradient id={`${id}-leaf`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={t.stops[0]} />
          <stop offset="0.38" stopColor={t.stops[1]} />
          <stop offset="0.52" stopColor={t.stops[2]} />
          <stop offset="0.66" stopColor={t.stops[3]} />
          <stop offset="1" stopColor={t.stops[4]} />
        </linearGradient>
        <filter id={`${id}-halo`} x="-20%" y="-30%" width="140%" height="160%">
          <feMorphology in="SourceAlpha" operator="dilate" radius="1.1" result="grown" />
          <feGaussianBlur in="grown" stdDeviation="0.9" result="soft" />
          <feFlood floodColor={t.halo.color} floodOpacity={t.halo.opacity} />
          <feComposite in2="soft" operator="in" result="halo" />
          <feMerge>
            <feMergeNode in="halo" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter={`url(#${id}-halo)`}>
        <path d={s.stem} fill="none" stroke={t.stem} strokeWidth={s.stemWidth} strokeLinecap="round" />
        {s.leaves.map((leaf, index) => (
          <path key={index} d={leafPath(leaf)} fill={`url(#${id}-leaf)`} />
        ))}
      </g>
    </svg>
  );
}

const PICTO_STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 3.4,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** Calendrier (SVG 48 × 48). */
export function CalendarIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true" focusable="false" data-ornament="pictogramme">
      <g {...PICTO_STROKE}>
        <rect x="5" y="9" width="38" height="34" rx="4.5" />
        <path d="M5 18.5 H43 M15 4.5 V12.5 M33 4.5 V12.5" />
      </g>
    </svg>
  );
}

/** Repère de lieu (SVG 48 × 48). */
export function PinIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true" focusable="false" data-ornament="pictogramme">
      <g {...PICTO_STROKE}>
        <path d="M24 45 C 18 36 9 28 9 18.5 C 9 9.9 15.7 3.5 24 3.5 C 32.3 3.5 39 9.9 39 18.5 C 39 28 30 36 24 45 Z" />
        <circle cx="24" cy="18" r="5.5" />
      </g>
    </svg>
  );
}

/** Trois personnes (SVG 56 × 48). */
export function GatheringIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 56 48" aria-hidden="true" focusable="false" data-ornament="pictogramme">
      <g {...PICTO_STROKE}>
        <circle cx="28" cy="11" r="7" />
        <path d="M13 41 C 13 31 19.5 24.5 28 24.5 C 36.5 24.5 43 31 43 41 Z" />
        <circle cx="10.5" cy="19.5" r="4.6" />
        <path d="M3 41 V37.5 C 3 32 6 29 11.5 29" />
        <circle cx="45.5" cy="19.5" r="4.6" />
        <path d="M53 41 V37.5 C 53 32 50 29 44.5 29" />
        <path d="M3 41 H53" />
      </g>
    </svg>
  );
}

/** « i » cerclé (SVG 48 × 48). */
export function InfoIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true" focusable="false" data-ornament="pictogramme">
      <g {...PICTO_STROKE}>
        <circle cx="24" cy="24" r="20.5" />
        <path d="M20.5 21 H24.5 V33.5 M20 33.5 H29" />
      </g>
      <circle cx="24" cy="14.5" r="2.4" fill="currentColor" />
    </svg>
  );
}

/** Cœur au trait du pied (SVG 32 × 30). */
export function LineHeart({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 32 30" aria-hidden="true" focusable="false" data-ornament="coeur">
      <path
        d="M16 27.5 C 11 23 2.5 17 2.5 10 C 2.5 5.6 5.6 2.6 9.4 2.6 C 12.3 2.6 14.6 4.4 16 7 C 17.4 4.4 19.7 2.6 22.6 2.6 C 26.4 2.6 29.5 5.6 29.5 10 C 29.5 17 21 23 16 27.5 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Cœur à main levée de la mention du coin (Master Desktop Light :
 * x 1561–1603, y 190–242) : lobe droit plus haut, pointe prolongée d'un
 * court trait (SVG 44 × 54). */
export function CornerHeart({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 44 54" aria-hidden="true" focusable="false" data-ornament="coeur">
      <path
        d="M24.5 47.5 C 15 40.5 3.5 30.5 2.2 18 C 1.6 11 5.5 7.4 10.5 7.6 C 15 7.8 18.6 10 21 13.4 C 24 7.2 29 1.6 35 1.6 C 40 1.6 42.6 5.2 42.2 11 C 41.6 20.5 33.5 33.5 24.5 47.5 L 21.6 52.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Filtre de bord irrégulier des cartouches (déplacement SVG), un par
 * section ; référencé par le CSS via `--deckle`. */
export function DeckleFilter({ id }: { id: string }) {
  return (
    <svg className={styles.filterDefs} aria-hidden="true" focusable="false">
      <filter id={id} x="-2%" y="-4%" width="104%" height="108%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.16 0.19" numOctaves="3" seed="5" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="4" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}
