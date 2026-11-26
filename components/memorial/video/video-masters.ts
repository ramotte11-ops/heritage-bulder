import type { SkinVariant } from "@/config/skins";

/**
 * VID-05A / VID-05B — les quatre Masters de la rubrique « Des instants pour
 * se souvenir ».
 *
 * Architecture « scène unique » validée par la PO : chaque Master est affiché
 * en entier, à ses proportions, sans découpage ni bande répétable. Textes,
 * lecteur et sélecteurs sont posés par-dessus, dans la zone libre.
 *
 * Sources (VID-05B) : les quatre PNG officiels remis par la PO
 * (`HERITAGE_VIDEO_Desktop_Light_MASTER.zip`), copiés octet pour octet dans
 * `assets/video-hommage-v1/source/` (zone protégée, jamais servie).
 *
 * Fichiers servis : dérivés par `scripts/pilot/video-hommage-v1-derive.py`
 * dans `public/assets/video-hommage/v1/` — AVIF 4:4:4 qualité 90 (principal)
 * et WebP sans perte (repli), à la largeur native du Master et à une largeur
 * réduite, sans agrandissement, recadrage ni retouche.
 *
 * Empreintes (convention du lot 06-D de Chef 06) : chaque nom de fichier
 * commence par le SHA-256 complet de ses octets ; une image modifiée reçoit
 * donc une nouvelle adresse. `video-masters.test.ts` revérifie, dans la suite
 * de tests normale, les octets, les dimensions et le lien nom ↔ empreinte.
 *
 * Les fichiers ne sont pas sous `/assets/fingerprinted/` : ce répertoire et
 * son en-tête de cache `immutable` d'un an appartiennent au manifeste de
 * Chef 06 (`config/decor-fingerprints.ts`, douze décors audités). Les
 * adresses vidéo gardent la politique de cache par défaut de Netlify
 * (revalidation) tant que l'extension de cet en-tête n'est pas concertée.
 */
export const VIDEO_MASTERS_INSTALLED = true;

/**
 * Décision PO du 25/11/2026 (VID-05B consolidé) — Master Light universel.
 *
 * La rubrique se présente en Light dans les deux ambiances du mémorial :
 * Master Light du format affiché (Desktop ou Mobile), textes et commandes
 * aux couleurs Light. En ambiance Dark, la rubrique Contributions qui la
 * précède est sombre ; la vidéo apporte une respiration lumineuse.
 *
 * Seule la rubrique est concernée : le thème du mémorial n'est pas modifié
 * (la portée `SkinScope` de la rubrique ne couvre que la rubrique), et ce
 * n'est pas une option du Builder. Les Masters Dark restent installés et
 * déclarés ci-dessous, intacts, ainsi que les teintes Dark de la feuille de
 * style : revenir à une présentation par ambiance ne demanderait que de
 * changer cette constante.
 */
export const VIDEO_HOMMAGE_PRESENTATION_VARIANT: SkinVariant = "light";

export type VideoMasterLayout = "desktop" | "mobile";

export interface VideoMasterRendition {
  width: number;
  height: number;
  /** Adresse servie : `/assets/video-hommage/v1/<sha256>-<nom>`. */
  src: string;
  bytes: number;
  sha256: string;
}

export interface VideoMasterSpec {
  width: number;
  height: number;
  /** Teinte du papier au centre du Master (médiane mesurée sur le PNG officiel) : aplat affiché avant l'image. */
  paper: string;
  /** PNG officiel, octet pour octet, dans `assets/video-hommage-v1/source/`. */
  source: { file: string; sha256: string; bytes: number };
  /** Par largeur croissante ; la dernière est la largeur native. */
  avif: readonly VideoMasterRendition[];
  webp: readonly VideoMasterRendition[];
}

const DIR = "/assets/video-hommage/v1";

function rendition(width: number, height: number, sha256: string, name: string, bytes: number): VideoMasterRendition {
  return { width, height, src: `${DIR}/${sha256}-${name}`, bytes, sha256 };
}

export const VIDEO_MASTERS: Record<VideoMasterLayout, Record<SkinVariant, VideoMasterSpec>> = {
  desktop: {
    light: {
      width: 1670,
      height: 942,
      paper: "#fde8cb",
      source: {
        file: "HERITAGE_VIDEO_Desktop_Light_MASTER.png",
        sha256: "47d07afc7ad65a2576d9a93b52e1b24c7fdb35d677e364fccb7a5e51b2938c13",
        bytes: 1_564_693,
      },
      avif: [
        rendition(1280, 722, "fdb9f22d4e8ba13041024381954136698696003c93ca65d9141db501db6b72c1", "video-desktop-light-1280w.avif", 169_124),
        rendition(1670, 942, "6fc4b3d2ea5c625eefbb11f687bede1ebad0836f88cbc802dc6a7f3818f47153", "video-desktop-light-1670w.avif", 238_921),
      ],
      webp: [
        rendition(1280, 722, "b9b461ce83f5149903dc65b468ff58d46868584196bdb68a82dc05666fc3555c", "video-desktop-light-1280w.webp", 806_612),
        rendition(1670, 942, "7e676017f8b89c4df3d769c6fe78c889c0fcb28356fd1e6245aa06c3af28cb2d", "video-desktop-light-1670w.webp", 1_195_680),
      ],
    },
    dark: {
      width: 1670,
      height: 942,
      paper: "#3b200e",
      source: {
        file: "HERITAGE_VIDEO_Desktop_Dark_MASTER.png",
        sha256: "46c31724fde3bca7f0fc420c27076291a4869a9828c906829dcad92b1de25b7e",
        bytes: 1_336_900,
      },
      avif: [
        rendition(1280, 722, "bd4afd5adef43fff9f78d6c4acb95396538c35e6739b879f70782c121776e235", "video-desktop-dark-1280w.avif", 163_068),
        rendition(1670, 942, "5903a95b87784f7a76e07628e06f30836f792e5413d68abe52c37248ea0055b5", "video-desktop-dark-1670w.avif", 228_510),
      ],
      webp: [
        rendition(1280, 722, "a73e0142574b9b55a96c7b9e5e4398345e8135985a2d35625ffc2588f11845f2", "video-desktop-dark-1280w.webp", 676_716),
        rendition(1670, 942, "d831b60ac8497f081b14f3cd6ff48bb76062e48687ac7537e72bea3240cfaddd", "video-desktop-dark-1670w.webp", 984_714),
      ],
    },
  },
  mobile: {
    light: {
      width: 1024,
      height: 1536,
      paper: "#fdead1",
      source: {
        file: "HERITAGE_VIDEO_Mobile_Light_MASTER.png",
        sha256: "9c6fadb9d63ecd60d1ebe3f5b6bfb054ac3d408db3b13041a151ec3753c9eae1",
        bytes: 1_698_507,
      },
      avif: [
        rendition(768, 1152, "272c5b5ae92fb490a3aeaf5d99be8a5a3d4cd7a09b0a67376ce6a6e7057708e6", "video-mobile-light-768w.avif", 204_090),
        rendition(1024, 1536, "22789c9ab53cd546b623b65734535f5f1d02e29ccc4ca75f7b578db950d3b2b5", "video-mobile-light-1024w.avif", 261_521),
      ],
      webp: [
        rendition(768, 1152, "44322fad435ead0fd10c6a8e6c169326d56d44d8eebfd1b137d33e7b199f385b", "video-mobile-light-768w.webp", 855_774),
        rendition(1024, 1536, "0a7880db6919fb78dd823b58856ca5aa6990b2d1c6ff4d6bb5cffd22665b0e41", "video-mobile-light-1024w.webp", 1_260_788),
      ],
    },
    dark: {
      width: 1024,
      height: 1536,
      paper: "#3a2312",
      source: {
        file: "HERITAGE_VIDEO_Mobile_Dark_MASTER.png",
        sha256: "d07e5be549e78d0ed0e5ae184c0b42455ea81f3e34e4d4e3d9ce38682153f1bf",
        bytes: 1_340_309,
      },
      avif: [
        rendition(768, 1152, "beabc6d3f48abd2595864431ebe8ff04710ad512d2831eab02b2b9bb199b7c1e", "video-mobile-dark-768w.avif", 191_477),
        rendition(1024, 1536, "397f1aa0a128e3d2981d4651bc36f9ac7b6e18485588293b2ba009b38309ce5c", "video-mobile-dark-1024w.avif", 246_799),
      ],
      webp: [
        rendition(768, 1152, "e6aa4e31f67164cb13ab909cc9171f3bba941177a99bdad85dfc9922d10ace70", "video-mobile-dark-768w.webp", 633_728),
        rendition(1024, 1536, "71ffc13bc7f11f0629cc609321d9203f86aad7a513bd32fc8c495b129687af49", "video-mobile-dark-1024w.webp", 930_984),
      ],
    },
  },
};

/** `srcset` à descripteurs de largeur : le navigateur choisit selon la place réelle et la densité de l'écran. */
export function videoMasterSrcSet(renditions: readonly VideoMasterRendition[]): string {
  return renditions.map((r) => `${r.src} ${r.width}w`).join(", ");
}

/**
 * La scène occupe toute la largeur de la rubrique. `auto` (image différée)
 * laisse le navigateur mesurer la largeur réellement affichée ; ceux qui ne
 * le connaissent pas retiennent `100vw`, majorant sûr.
 */
export const VIDEO_MASTER_SIZES = "auto, 100vw";
