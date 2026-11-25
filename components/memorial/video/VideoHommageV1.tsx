"use client";

import { useId, useMemo, useState, type CSSProperties } from "react";
import type { Language } from "@/config/languages";
import type { SkinVariant } from "@/config/skins";
import { SkinScope } from "@/components/memorial/SkinScope";
import { ebGaramond, ebGaramondItalic } from "@/components/builder/fonts";
import { videoDisplayTitle, type VideoHommageItem } from "@/lib/memorial/video/video-hommage";
import { VIDEO_HOMMAGE_TEXTS } from "./texts";
import {
  VIDEO_HOMMAGE_PRESENTATION_VARIANT,
  VIDEO_MASTER_SIZES,
  VIDEO_MASTERS,
  VIDEO_MASTERS_INSTALLED,
  videoMasterSrcSet,
  type VideoMasterLayout,
} from "./video-masters";
import { VideoHommagePlayer } from "./VideoHommagePlayer";
import { VideoHommageSelectors } from "./VideoHommageSelectors";
import styles from "./VideoHommageV1.module.css";

/** Les polices des Masters, posées par la rubrique elle-même (convention des rubriques V2). */
const SCENE_FONTS = [ebGaramond, ebGaramondItalic].map((font) => font.variable).join(" ");

export interface VideoHommageV1Props {
  /** Vidéos dans l'ordre choisi par la famille (3 au plus ; les suivantes sont ignorées). */
  items: readonly VideoHommageItem[];
  /**
   * Ambiance du mémorial. Depuis la décision PO « Master Light universel »
   * (VID-05B), elle ne change plus la présentation de la rubrique, toujours
   * en Light ; elle reste exposée en `data-memorial-variant`.
   */
  skinVariant: SkinVariant;
  language: Language;
  /** `page` : titre de niveau 1 (pilote) ; `section` : niveau 2 (mémorial). */
  headingLevel?: "page" | "section";
}

/**
 * VID-05A — la rubrique « Des instants pour se souvenir ».
 *
 * Présentation seulement : la rubrique reçoit des vidéos déjà décrites
 * (`VideoHommageItem`) et ne sait pas d'où elles viennent. La même rubrique
 * sert la démonstration locale du Builder (adresses `blob:`), la Preview et,
 * plus tard, la page publique (flux Mux fournis par le serveur). Elle
 * n'écrit rien, ne transfère rien et n'appelle aucun service.
 *
 * Composition (décision PO, scène unique par Master) :
 *  - Desktop (conteneur ≥ 1024 px) : lecteur à gauche, sélecteurs à droite ;
 *  - Mobile : lecteur en partie haute, sélecteurs en dessous ;
 *  - une seule vidéo : lecteur seul, sans sélecteur ;
 *  - deux ou trois vidéos : lecteur et sélecteurs.
 *
 * La bascule Mobile / Desktop suit la largeur RÉELLE du conteneur (requête de
 * conteneur à 1024 px, comme les Offrandes) : l'image du Master non affiché
 * est en `display: none` et, chargée en différé, n'est pas téléchargée.
 *
 * Présentation (VID-05B, décision PO) : Master Light, textes et commandes
 * Light dans les deux ambiances du mémorial (`VIDEO_HOMMAGE_PRESENTATION_VARIANT`).
 */
export function VideoHommageV1({ items, skinVariant, language, headingLevel = "section" }: VideoHommageV1Props) {
  const texts = VIDEO_HOMMAGE_TEXTS[language];
  const shown = useMemo(() => items.slice(0, 3), [items]);
  const [selectedId, setSelectedId] = useState<string | null>(shown[0]?.id ?? null);
  const [playRequest, setPlayRequest] = useState(0);

  // La vidéo affichée disparaît (retrait, remplacement) : retour à la première.
  const selectedIndex = Math.max(
    0,
    shown.findIndex((item) => item.id === selectedId),
  );
  const current = shown[selectedIndex] ?? null;
  const headingId = useId();

  const select = (index: number) => {
    const target = shown[index];
    if (target === undefined) return;
    setSelectedId(target.id);
    // Action explicite du visiteur : la vidéo choisie démarre (décision PO).
    setPlayRequest((value) => value + 1);
  };

  const Heading = headingLevel === "page" ? "h1" : "h2";
  const currentTitle = current === null ? null : videoDisplayTitle(current, selectedIndex, texts.defaultTitle);
  // Master Light universel : la présentation ne suit pas l'ambiance du mémorial.
  const presentation = VIDEO_HOMMAGE_PRESENTATION_VARIANT;
  const paper = {
    "--video-paper-mobile": VIDEO_MASTERS.mobile[presentation].paper,
    "--video-paper-desktop": VIDEO_MASTERS.desktop[presentation].paper,
  } as CSSProperties;

  return (
    <SkinScope skin="intemporel" skinVariant={presentation}>
      <section
        className={`${styles.root} ${SCENE_FONTS}`}
        aria-labelledby={headingId}
        data-video-hommage=""
        data-variant={presentation}
        data-memorial-variant={skinVariant}
        data-count={shown.length}
        data-masters={VIDEO_MASTERS_INSTALLED ? "installed" : "absent"}
      >
        <div className={styles.scene} style={paper}>
          {VIDEO_MASTERS_INSTALLED && (
            <>
              <MasterPicture layout="mobile" skinVariant={presentation} />
              <MasterPicture layout="desktop" skinVariant={presentation} />
            </>
          )}
          <div className={styles.content}>
            <header className={styles.heading}>
              <Heading id={headingId} className={styles.title}>
                {texts.title}
              </Heading>
              <p className={styles.subtitle}>{texts.subtitle}</p>
            </header>
            <div className={styles.stage} data-layout={shown.length > 1 ? "with-selectors" : "player-only"}>
              <div className={styles.playerSlot}>
                <VideoHommagePlayer item={current} title={currentTitle} texts={texts} playRequest={playRequest} />
              </div>
              {shown.length > 1 && (
                <div className={styles.selectorsSlot}>
                  <VideoHommageSelectors items={shown} selectedIndex={selectedIndex} texts={texts} onSelect={select} />
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </SkinScope>
  );
}

/**
 * Un Master : AVIF (principal) puis WebP sans perte (repli), chacun à deux
 * largeurs. Seule la variante (Light ou Dark) du mémorial est rendue ; le
 * format non affiché (Mobile ou Desktop) est en `display: none` et, chargé en
 * différé, n'est jamais demandé au réseau.
 */
function MasterPicture({ layout, skinVariant }: { layout: VideoMasterLayout; skinVariant: SkinVariant }) {
  const master = VIDEO_MASTERS[layout][skinVariant];
  const fallback = master.webp[master.webp.length - 1]!;
  return (
    <picture className={layout === "mobile" ? styles.masterMobile : styles.masterDesktop}>
      <source type="image/avif" srcSet={videoMasterSrcSet(master.avif)} sizes={VIDEO_MASTER_SIZES} />
      <img
        src={fallback.src}
        srcSet={videoMasterSrcSet(master.webp)}
        sizes={VIDEO_MASTER_SIZES}
        alt=""
        width={master.width}
        height={master.height}
        className={styles.masterImage}
        loading="lazy"
        decoding="async"
        draggable={false}
        data-video-master={`${layout}-${skinVariant}`}
      />
    </picture>
  );
}
