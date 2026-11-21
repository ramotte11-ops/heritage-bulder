/**
 * M8-E6-A — les pictogrammes au trait de « La lettre des proches » (planche
 * PO) : cœur, livre ouvert, image, cadenas, avion de papier, fermeture, et le
 * filet orné d'une feuille. Dessinés en SVG, couleur héritée (currentColor).
 */

type IconProps = { className?: string };

const base = { width: "1em", height: "1em", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, focusable: false };

export function HeartIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 20.2s-7.6-4.6-7.6-10.1A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.6 2.7c0 5.5-7.6 10.1-7.6 10.1Z" />
    </svg>
  );
}

export function BookIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 6.8C10 5.4 7.3 5 3.5 5.2v12.5c3.8-.2 6.5.2 8.5 1.6 2-1.4 4.7-1.8 8.5-1.6V5.2C16.7 5 14 5.4 12 6.8Z" />
      <path d="M12 6.8v12.5" />
      <path d="M5.8 8.3c1.6 0 3 .3 4.2.9M5.8 11c1.6 0 3 .3 4.2.9M14 9.2c1.2-.6 2.6-.9 4.2-.9M14 11.9c1.2-.6 2.6-.9 4.2-.9" />
    </svg>
  );
}

export function ImageIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3.2" y="4.6" width="17.6" height="14.8" rx="1.6" />
      <circle cx="15.6" cy="9.2" r="1.6" />
      <path d="m3.6 17.4 5.1-5.3 3.8 3.9 2.3-2.2 5.6 4.8" />
    </svg>
  );
}

export function LockIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="5.2" y="10.6" width="13.6" height="9.4" rx="1.6" />
      <path d="M8.2 10.6V8a3.8 3.8 0 0 1 7.6 0v2.6" />
      <path d="M12 14.4v2" />
    </svg>
  );
}

export function PlaneIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M20.8 3.6 3.4 10.7l6.8 2.9 2.9 6.8 7.7-16.8Z" />
      <path d="m10.2 13.6 10.6-10" />
    </svg>
  );
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg {...base} strokeWidth={1.6} className={className}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

/** Filet – feuille – filet, sous le titre (planche). */
export function LeafDivider({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 120 14" width="120" height="14" aria-hidden="true" focusable="false" fill="none">
      <path d="M2 7h38M80 7h38" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.7" />
      <path d="M49 9.6c3.6-5.2 10.6-6.4 16.8-3.2-4.4 4.6-11 5.8-16.8 3.2Z" fill="currentColor" />
      <path d="M49 9.6c4.8-1.1 9.8-2.2 16.8-3.2M60 4.8c2.6-2.4 6-3 9.4-2.1-1.8 2.8-5 3.9-8.4 3" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" />
      <path d="M60.6 5.6c2.4-1.7 5.6-2.5 8.8-2.9" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" />
    </svg>
  );
}
