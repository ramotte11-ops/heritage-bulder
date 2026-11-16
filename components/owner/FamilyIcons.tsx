import type { ReactNode } from "react";
import type { OfferingKind } from "@/config/symbolic-offerings-v1-tokens";

/**
 * Espace famille — pictogrammes au trait et ornements, dessinés pour
 * reproduire la maquette du Studio (« Mon espace famille »). SVG en ligne,
 * décoratifs (`aria-hidden`) : le sens est toujours porté par le texte voisin.
 * Couleur : `currentColor`, sauf les ornements qui portent leur propre teinte.
 */
function Icon({ className, children, viewBox = "0 0 24 24" }: { className?: string; children: ReactNode; viewBox?: string }) {
  return (
    <svg
      className={className}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

type IconProps = { className?: string };

export function ArrowIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M4.5 12h15M13.5 6l6 6-6 6" />
    </Icon>
  );
}

export function BackIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M19.5 12h-15M10.5 6l-6 6 6 6" />
    </Icon>
  );
}

export function PlusIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function PencilIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M4.5 19.5l1-4L16 5a1.8 1.8 0 0 1 2.6 0l.4.4a1.8 1.8 0 0 1 0 2.6L8.5 18.5l-4 1zM14.5 6.5l3 3" />
    </Icon>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </Icon>
  );
}

export function UserIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <circle cx="12" cy="8" r="3.75" />
      <path d="M4.5 20c.6-3.7 3.6-5.75 7.5-5.75s6.900 2.050 7.500 5.750z" />
    </Icon>
  );
}

export function ChevronIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M6.5 9.5l5.5 5.500 5.500-5.500" />
    </Icon>
  );
}

export function MessageIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M12 4.250c4.700 0 8.250 3.100 8.250 7.250S16.700 18.750 12 18.750c-.950 0-1.850-.120-2.700-.360L5 20.250l.900-3.500c-1.350-1.300-2.150-3.100-2.150-5.250 0-4.150 3.550-7.250 8.250-7.250z" />
      <path d="M8.500 11.500h.010M12 11.500h.010M15.500 11.500h.010" strokeWidth="2" />
    </Icon>
  );
}

export function GiftIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M4.500 11.500h15V20h-15zM3.500 8h17v3.500h-17zM12 8v12" />
      <path d="M12 8c-1.200-3.200-5.500-3.600-5.500-1.200C6.500 8 9 8 12 8zM12 8c1.200-3.200 5.500-3.600 5.500-1.200C17.500 8 15 8 12 8z" />
    </Icon>
  );
}

export function BookIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M12 6.500c-1.800-1.300-4.600-1.800-8-1.500v13c3.400-.300 6.200.200 8 1.500 1.800-1.300 4.600-1.800 8-1.500V5c-3.400-.300-6.200.200-8 1.500zM12 6.500v13" />
    </Icon>
  );
}

export function HeartIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M12 20s-7.500-4.600-7.500-10.100A4.150 4.150 0 0 1 12 7.400a4.150 4.150 0 0 1 7.500 2.500C19.500 15.400 12 20 12 20z" />
    </Icon>
  );
}

export function CandleIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M9.250 10.750h5.500V20.750h-5.500zM12 10.750V9" />
      <path d="M12 2.750c1.700 1.900 2.300 3.100 2.300 4.200a2.300 2.300 0 0 1-4.600 0c0-1.100.600-2.300 2.300-4.200z" />
    </Icon>
  );
}

export function FlowerIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <circle cx="12" cy="12" r="1.900" />
      <path d="M12 10.100c-1.900-1.700-1.900-5.100 0-6.100 1.900 1 1.900 4.400 0 6.100zM13.800 11.400c.900-2.400 4.100-3.500 5.700-2 -.400 2.100-3.500 3.200-5.700 2zM13.200 13.500c2.500.100 4.400 2.900 3.500 4.900-2.100.300-4.100-2.400-3.500-4.900zM10.800 13.500c.600 2.500-1.400 5.200-3.500 4.900-.900-2 1-4.800 3.500-4.900zM10.200 11.400c-2.200 1.200-5.300.100-5.700-2 1.600-1.500 4.800-.400 5.700 2z" />
    </Icon>
  );
}

/** Le pictogramme d'un geste : cœur, bougie, fleur (lys). */
export function OfferingIcon({ kind, className }: IconProps & { kind: OfferingKind }) {
  if (kind === "coeur") return <HeartIcon className={className} />;
  if (kind === "bougie") return <CandleIcon className={className} />;
  return <FlowerIcon className={className} />;
}

/** Le petit rameau olive posé au centre du filet, sous le titre. */
export function SprigOrnament({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 48 28" aria-hidden="true" focusable="false">
      <path d="M4 22c9-1 18-5 26-12" fill="none" stroke="#3e4a34" strokeWidth="1.300" strokeLinecap="round" />
      <path d="M17 17.500c-1-5 2-9.500 7-11 .800 4.800-2 9.300-7 11z" fill="#4a5a3c" />
      <path d="M25.500 12c1.200-4.600 5.600-7.400 10.500-6.500-.900 4.500-5.300 7.300-10.500 6.500z" fill="#3e4a34" />
      <path d="M20 18.500c4.200-2.700 9.500-1.900 12.500 1.700-3.900 2.400-9.200 1.700-12.500-1.700z" fill="#5a6b49" />
      <path d="M10 20.800c2.800-2.900 7-3.400 10-.900-2.700 2.600-6.900 3-10 .900z" fill="#4a5a3c" />
    </svg>
  );
}

/** Rameau discret pour l'emplacement d'une photographie pas encore ajoutée. */
export function EmptyPhotoOrnament({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 64 80" aria-hidden="true" focusable="false">
      <path d="M32 70V26" fill="none" stroke="#8a9479" strokeWidth="1.400" strokeLinecap="round" />
      <path d="M32 30c-2-8 0-15 0-20 4 5 5 13 0 20z" fill="#a9b29a" />
      <path d="M32 42c-9-1-15-7-16-15 8 1 14 7 16 15zM32 42c9-1 15-7 16-15-8 1-14 7-16 15z" fill="#b9c0aa" />
      <path d="M32 56c-8 0-14-5-16-12 8 0 14 5 16 12zM32 56c8 0 14-5 16-12-8 0-14 5-16 12z" fill="#a9b29a" />
    </svg>
  );
}

/**
 * Le coin de papier déchiré bordeaux, en bas à droite de l'espace : une
 * feuille bordeaux dont le bord irrégulier laisse voir un liseré de papier
 * crème, comme sur la maquette.
 */
export function TornCornerOrnament({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 260 140" preserveAspectRatio="xMaxYMax meet" aria-hidden="true" focusable="false">
      <path d="M0.0 137.4L2.9 136.5 5.8 137.5 8.7 137.5 11.6 135.8 14.4 134.5 17.3 132.8 20.2 133.4 23.1 131.1 26.0 131.5 28.9 131.9 31.8 128.6 34.7 128.7 37.6 129.1 40.4 125.9 43.3 125.2 46.2 125.5 49.1 128.0 52.0 123.3 54.9 121.6 57.8 122.4 60.7 118.4 63.6 119.9 66.4 117.0 69.3 117.9 72.2 114.2 75.1 113.7 78.0 114.1 80.9 111.0 83.8 111.1 86.7 110.1 89.6 110.5 92.4 107.4 95.3 104.6 98.2 103.4 101.1 102.7 104.0 102.9 106.9 100.9 109.8 101.8 112.7 98.9 115.6 97.2 118.4 95.4 121.3 95.7 124.2 94.1 127.1 91.4 130.0 93.6 132.9 89.7 135.8 89.5 138.7 87.7 141.6 84.9 144.4 85.8 147.3 81.7 150.2 83.8 153.1 81.0 156.0 77.7 158.9 77.4 161.8 74.6 164.7 75.3 167.6 74.2 170.4 74.7 173.3 71.7 176.2 68.5 179.1 68.3 182.0 66.6 184.9 65.1 187.8 63.3 190.7 65.6 193.6 62.0 196.4 59.0 199.3 58.2 202.2 54.8 205.1 55.4 208.0 53.7 210.9 55.9 213.8 51.3 216.7 48.1 219.6 47.0 222.4 46.4 225.3 42.8 228.2 42.7 231.1 42.8 234.0 38.6 236.9 36.9 239.8 37.6 242.7 34.1 245.6 32.9 248.4 31.8 251.3 34.3 254.2 27.8 257.1 27.4 260.0 26.2V140H0.0Z" fill="#efe3cf" />
      <path d="M22.0 138.8L24.8 138.8 27.7 139.6 30.5 139.9 33.3 136.9 36.2 136.5 39.0 134.4 41.8 134.8 44.7 134.4 47.5 134.2 50.3 133.4 53.2 130.8 56.0 129.2 58.8 130.9 61.7 129.6 64.5 126.3 67.3 128.8 70.2 130.3 73.0 125.7 75.8 124.6 78.7 122.0 81.5 120.5 84.3 121.3 87.2 118.6 90.0 120.5 92.8 117.2 95.7 115.4 98.5 115.9 101.3 114.7 104.2 115.1 107.0 112.8 109.8 114.7 112.7 110.6 115.5 110.0 118.3 108.2 121.2 106.4 124.0 107.8 126.8 106.7 129.7 107.5 132.5 103.3 135.3 100.8 138.2 99.3 141.0 98.3 143.8 96.3 146.7 97.6 149.5 97.6 152.3 95.5 155.2 92.6 158.0 93.5 160.8 91.8 163.7 87.5 166.5 87.0 169.3 90.8 172.2 85.5 175.0 86.0 177.8 82.7 180.7 80.2 183.5 81.0 186.3 80.2 189.2 79.6 192.0 75.1 194.8 74.7 197.7 75.7 200.5 73.6 203.3 70.0 206.2 69.1 209.0 69.8 211.8 65.8 214.7 67.1 217.5 63.5 220.3 63.6 223.2 61.8 226.0 59.5 228.8 62.6 231.7 56.6 234.5 57.1 237.3 53.8 240.2 53.5 243.0 51.4 245.8 50.2 248.7 53.8 251.5 49.3 254.3 46.1 257.2 46.8 260.0 43.0V140H22.0Z" fill="#7d2f3d" />
      <path d="M96.0 140.2L98.7 139.9 101.5 139.3 104.2 139.0 106.9 137.4 109.7 136.3 112.4 136.0 115.1 134.2 117.9 133.7 120.6 133.7 123.3 134.9 126.1 132.3 128.8 130.3 131.5 129.7 134.3 130.7 137.0 129.1 139.7 128.5 142.5 130.8 145.2 126.4 147.9 124.7 150.7 125.9 153.4 124.4 156.1 123.7 158.9 122.7 161.6 125.3 164.3 120.2 167.1 120.4 169.8 118.4 172.5 118.0 175.3 117.3 178.0 115.4 180.7 116.2 183.5 113.9 186.2 113.6 188.9 112.2 191.7 110.8 194.4 110.4 197.1 108.1 199.9 109.5 202.6 106.4 205.3 106.8 208.1 104.0 210.8 102.7 213.5 101.6 216.3 100.4 219.0 102.5 221.7 99.7 224.5 99.4 227.2 96.9 229.9 95.9 232.7 94.6 235.4 93.6 238.1 96.3 240.9 92.0 243.6 90.1 246.3 88.6 249.1 89.3 251.8 88.0 254.5 87.2 257.3 86.9 260.0 84.1V140H96.0Z" fill="#8c3b49" opacity="0.6" />
    </svg>
  );
}
