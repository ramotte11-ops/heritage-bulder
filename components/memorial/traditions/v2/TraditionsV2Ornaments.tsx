import { useId } from "react";
import styles from "./TraditionsV2.module.css";

/**
 * Traditions & repères V2 — ornements reconstruits d'après les Masters
 * Mobile Light et Mobile Dark (`MOBILE_{LIGHT,DARK}_MASTER_ILLUSTRE.png`).
 * Purement décoratifs (`aria-hidden`) : aucun texte de la famille n'y
 * entre.
 *
 *   - Rameau d'olivier : six feuilles pleines et une tige, x 376–548 /
 *     y 352–432 du Master (sous le titre) ; le même tracé, réduit et
 *     incliné, sert au pied (entre ses deux filets).
 *     Sur le Dark, le même tracé en bronze doré (x 398–516, y 415–461).
 *   - Cœurs (Dark) : cœur au trait du pied, entre les deux filets
 *     (x 457–485, y 1451–1476), et cœur dessiné à main levée sous la
 *     mention « Des gestes qui ont du sens » (x 837–869, y 127–177).
 *   - Rameau au trait : le pictogramme NEUTRE de chaque médaillon de
 *     repère (décision PO : aucun pictogramme culturel ou religieux
 *     imposé), dans le style des pictogrammes du Master (trait sombre
 *     régulier, extrémités franches).
 *
 * Tracés en unités de leur propre viewBox ; la taille rendue vient du
 * module CSS (px de canevas rapportés à la largeur réelle), le ratio est
 * toujours conservé.
 */

/** Feuille lancéolée, la plus large au tiers de la base. */
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

/** Feuilles du rameau, en coordonnées du Master moins (376, 352). */
const SPRIG_LEAVES: readonly { base: [number, number]; tip: [number, number]; half: number }[] = [
  { base: [37.5, 47.5], tip: [68.8, 17.5], half: 7 },
  { base: [75, 46], tip: [110, 11], half: 8 },
  { base: [113.8, 42.5], tip: [162.5, 11.3], half: 8.5 },
  { base: [41, 51], tip: [78.8, 75], half: 6.5 },
  { base: [80, 50], tip: [123.8, 72.5], half: 7 },
  { base: [115, 44], tip: [160, 59], half: 7.5 },
];

/** Teintes du rameau : dégradé des feuilles, tige, halo de détourage. */
const SPRIG_TONES = {
  // Light : feuillage gris-vert, halo clair sur le papier ivoire.
  olive: {
    stops: ["#3f3f30", "#6d6b55", "#9a977d", "#5f5e4a", "#36362a"],
    stem: "#33332a",
    halo: { color: "#fff7ea", opacity: 0.95 },
  },
  // Dark : bronze doré du Master (#dcb87a au plus clair), ombre sombre.
  bronze: {
    stops: ["#8a6633", "#c9a062", "#ecd29c", "#b8904f", "#7d5a2c"],
    stem: "#b58c52",
    halo: { color: "#1c1008", opacity: 0.45 },
  },
} as const;

/** Rameau d'olivier (SVG 172 × 80). */
export function OliveSprig({ className, tone = "olive" }: { className: string; tone?: keyof typeof SPRIG_TONES }) {
  const id = useId().replace(/:/g, "");
  const t = SPRIG_TONES[tone];
  return (
    <svg className={className} viewBox="0 0 172 80" aria-hidden="true" focusable="false" data-ornament="rameau">
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
        <path d="M11 49 C 48 49.5 88 47.5 116 43" fill="none" stroke={t.stem} strokeWidth="2.6" strokeLinecap="round" />
        {SPRIG_LEAVES.map((leaf, index) => (
          <path key={index} d={leafPath(leaf.base, leaf.tip, leaf.half)} fill={`url(#${id}-leaf)`} />
        ))}
      </g>
    </svg>
  );
}

/** Rameau au trait, pictogramme neutre des médaillons (SVG 64 × 64). */
export function LineSprig({ className }: { className: string }) {
  const leaves: readonly { base: [number, number]; tip: [number, number]; half: number }[] = [
    { base: [27, 41], tip: [15, 31], half: 4.6 },
    { base: [33, 32], tip: [21, 20], half: 4.6 },
    { base: [31, 44], tip: [44, 38], half: 4.6 },
    { base: [37, 33], tip: [49, 25], half: 4.6 },
    { base: [40, 22], tip: [44, 9], half: 4.2 },
  ];
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinejoin="round" strokeLinecap="round">
        <path d="M20 55 C 27 44 34 33 40 22" />
        {leaves.map((leaf, index) => (
          <path key={index} d={leafPath(leaf.base, leaf.tip, leaf.half)} />
        ))}
      </g>
    </svg>
  );
}

/** Cœur au trait du pied (Dark), SVG 28 × 25. */
export function LineHeart({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 28 25" aria-hidden="true" focusable="false" data-ornament="coeur">
      <path
        d="M14 23.2 C 9.5 19.4 2.2 14.2 2.2 8.1 C 2.2 4.4 4.9 1.9 8.1 1.9 C 10.6 1.9 12.6 3.4 14 5.6 C 15.4 3.4 17.4 1.9 19.9 1.9 C 23.1 1.9 25.8 4.4 25.8 8.1 C 25.8 14.2 18.5 19.4 14 23.2 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Cœur dessiné à main levée (Dark), sous la mention du coin : allongé,
 * légèrement penché, la boucle droite qui ne se referme pas tout à fait.
 * SVG 32 × 50. */
export function HandHeart({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 32 50" aria-hidden="true" focusable="false" data-ornament="coeur">
      <path
        d="M13.5 47.5 C 9 38 2.4 29 2.6 18.5 C 2.8 12.6 6.2 9.6 9.6 10.6 C 12.6 11.5 13.8 15 14.6 18.6 C 16.4 11 19.6 2.6 25.2 3.1 C 29.4 3.5 30.2 9.4 28.6 15.6 C 26.4 24.6 19.6 35.5 13.5 47.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Filtre de bord irrégulier des feuillets (déplacement SVG), un par
 * section ; référencé par le CSS via `--deckle`. */
export function DeckleFilter({ id }: { id: string }) {
  return (
    <svg className={styles.filterDefs} aria-hidden="true" focusable="false">
      <filter id={id} x="-2%" y="-4%" width="104%" height="108%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.16 0.19" numOctaves="3" seed="7" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="5" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}
