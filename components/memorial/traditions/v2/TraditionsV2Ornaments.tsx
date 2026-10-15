import { useId } from "react";
import styles from "./TraditionsV2.module.css";

/**
 * Traditions & repères V2 — ornements reconstruits d'après le Master
 * Mobile Light (`MOBILE_LIGHT_MASTER_ILLUSTRE.png`). Purement décoratifs
 * (`aria-hidden`) : aucun texte de la famille n'y entre.
 *
 *   - Rameau d'olivier : six feuilles pleines et une tige, x 376–548 /
 *     y 352–432 du Master (sous le titre) ; le même tracé, réduit et
 *     incliné, sert au pied (entre ses deux filets).
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

/** Rameau d'olivier (SVG 172 × 80). */
export function OliveSprig({ className }: { className: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg className={className} viewBox="0 0 172 80" aria-hidden="true" focusable="false" data-ornament="rameau">
      <defs>
        <linearGradient id={`${id}-leaf`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3f3f30" />
          <stop offset="0.38" stopColor="#6d6b55" />
          <stop offset="0.52" stopColor="#9a977d" />
          <stop offset="0.66" stopColor="#5f5e4a" />
          <stop offset="1" stopColor="#36362a" />
        </linearGradient>
        <filter id={`${id}-halo`} x="-20%" y="-30%" width="140%" height="160%">
          <feMorphology in="SourceAlpha" operator="dilate" radius="1.1" result="grown" />
          <feGaussianBlur in="grown" stdDeviation="0.9" result="soft" />
          <feFlood floodColor="#fff7ea" floodOpacity="0.95" />
          <feComposite in2="soft" operator="in" result="halo" />
          <feMerge>
            <feMergeNode in="halo" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter={`url(#${id}-halo)`}>
        <path d="M11 49 C 48 49.5 88 47.5 116 43" fill="none" stroke="#33332a" strokeWidth="2.6" strokeLinecap="round" />
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
