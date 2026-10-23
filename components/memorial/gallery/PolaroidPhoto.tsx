"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import styles from "./DynamicPolaroid.module.css";

/**
 * Optimisation photographique V1 — la photo d'un tirage, montrée
 * seulement ENTIÈRE : jamais une image à moitié dessinée pendant son
 * chargement, jamais l'icône d'image cassée en cas d'échec (URL signée
 * expirée, réseau). Tant qu'elle n'est pas entièrement chargée, le
 * papier du tirage reste seul (état discret) ; puis elle apparaît par un
 * court fondu (aucun sous `prefers-reduced-motion`). Une photo déjà
 * chargée au montage (cache) est montrée d'emblée, sans fondu.
 *
 * La boîte de l'image (`box(layout.photo)`) et ses attributs sont ceux du
 * tirage : aucune géométrie ne change, seule la visibilité attend.
 */
type PhotoState = "loading" | "ready" | "revealed" | "error";

interface PolaroidPhotoProps {
  src: string;
  alt: string;
  style: CSSProperties;
  loading?: "eager" | "lazy";
}

export function PolaroidPhoto({ src, alt, style, loading }: PolaroidPhotoProps) {
  const ref = useRef<HTMLImageElement>(null);
  const [state, setState] = useState<PhotoState>("loading");

  // Déjà là au montage (cache) : montrée d'emblée.
  useLayoutEffect(() => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth > 0) setState("ready");
  }, []);

  // Fully downloaded: revealed. No forced `decode()` — the browser keeps
  // decoding the photo at its displayed scale, exactly as before (an
  // explicit full-size decode changes resampled pixels, ≤ 5/255).
  function onLoad() {
    setState((current) => (current === "loading" ? "revealed" : current));
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={src}
      alt={alt}
      className={styles.photo}
      style={style}
      draggable={false}
      data-photo-state={state}
      onLoad={onLoad}
      onError={() => setState("error")}
      {...(loading ? { loading, decoding: "async" as const } : {})}
    />
  );
}
