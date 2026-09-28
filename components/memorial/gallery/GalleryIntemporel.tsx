"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Language } from "@/config/languages";
import type { SkinVariant } from "@/config/skins";
import { translate } from "@/lib/i18n/translate";
import type { A13FamilyMedia } from "@/lib/memorial/gallery/gallery-desktop-runtime";
import { A13DesktopGallery } from "@/components/memorial/gallery/A13DesktopGallery";
import { A13DesktopFullAlbum } from "@/components/memorial/album/A13DesktopFullAlbum";
import styles from "./GalleryIntemporel.module.css";

/**
 * Dettes D2–D4 — the Memorial's Gallery section (renderer key
 * `GalleryIntemporel`): the product host of the VALIDATED A13 Desktop
 * runtime, mounted by `MemorialAssembly` like every other section.
 *
 * It composes the existing A13 components and adds only what a product
 * host must own — nothing of the engine, the geometry, the materials or
 * the Viewer is touched:
 *
 *  - Gallery: `A13DesktopGallery` (0–1 → no Gallery, 2…5 → G2…G5, 6 → G6
 *    exact, 7+ → Signature + CTA — the runtime's own rules; every print
 *    opens the shared Viewer);
 *  - Full Album (7+ only, through the CTA): `A13DesktopFullAlbum`, every
 *    usable photograph in the family's order, each opening the Viewer;
 *  - the Gallery ↔ Album switch, as LOCAL STATE (QG D3): the Builder
 *    Preview has no URL of its own, so no route, no `router.push`, no
 *    history entry. The CTA is therefore the scene's existing `<button>`.
 *
 * ## Focus and scroll (QG D3) — the Preview host's own convention
 *
 * The Gallery is HIDDEN, never unmounted, while the Album is open (the
 * way `BuilderPreviewHost` keeps the Builder mounted): its composition,
 * its measured fonts and its CTA are exactly as they were on return.
 *  - opening: the window scroll position is kept, the Album is brought to
 *    the top of the viewport — below any sticky host chrome, such as the
 *    Preview's own bar — and focus moves to its "Retour" control
 *    (`common.back`, an existing validated HERITAGE label);
 *  - returning: the Gallery is shown again, the kept scroll position is
 *    restored and focus goes back to the Signature CTA (`gallery.seeMoreMemories`).
 * No global Escape handler is added: Escape keeps its existing Preview
 * meaning (close the Preview) and the Viewer's own (close the Viewer —
 * the Viewer stops the event in the capture phase, so the two never
 * collide). No focus trap outside the Viewer.
 */

export interface GalleryIntemporelProps {
  /** Usable photographs only, in the family's order, resolved server-side (signed URL, natural size, caption, alt). */
  media: A13FamilyMedia[];
  /** The memorial's persisted ambiance — never a device preference. Dark = materials only. */
  theme: SkinVariant;
  /** HERITAGE Gallery title and subtitle, owned by the Gallery adapter (never family content). */
  title: string;
  subtitle: string;
  language: Language;
}

type View = "gallery" | "album";

/**
 * The host page may keep chrome pinned over the top of the viewport (the
 * Builder Preview's sticky "Revenir à la création" bar). If such a sticky
 * or fixed element covers `target`, scroll back by exactly its overlap —
 * measured, never a hard-coded height — so the Album's first control is
 * visible and reachable.
 */
function uncoverFromStickyChrome(target: HTMLElement): void {
  const rect = target.getBoundingClientRect();
  const hit = document.elementFromPoint?.(rect.left + rect.width / 2, rect.top + rect.height / 2);
  if (!hit || target.contains(hit)) return;
  for (let el: Element | null = hit; el && el !== document.body; el = el.parentElement) {
    const position = getComputedStyle(el).position;
    if (position === "sticky" || position === "fixed") {
      const overlap = el.getBoundingClientRect().bottom - rect.top;
      if (overlap > 0) window.scrollBy({ left: 0, top: -overlap, behavior: "instant" });
      return;
    }
  }
}

export function GalleryIntemporel({ media, theme, title, subtitle, language }: GalleryIntemporelProps) {
  const [view, setView] = useState<View>("gallery");
  const rootRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const galleryScrollY = useRef(0);
  const previousView = useRef<View>("gallery");

  const openAlbum = useCallback(() => {
    galleryScrollY.current = window.scrollY;
    setView("album");
  }, []);
  const closeAlbum = useCallback(() => setView("gallery"), []);

  // Focus and scroll follow the transitions only.
  useEffect(() => {
    const previous = previousView.current;
    previousView.current = view;
    const root = rootRef.current;
    if (!root || previous === view) return;
    if (view === "album") {
      window.scrollTo({ left: 0, top: root.getBoundingClientRect().top + window.scrollY, behavior: "instant" });
      const back = backRef.current;
      if (back) {
        uncoverFromStickyChrome(back);
        back.focus({ preventScroll: true });
      }
    } else {
      window.scrollTo({ left: 0, top: galleryScrollY.current, behavior: "instant" });
      root.querySelector<HTMLElement>("[data-testid=cta-7plus]")?.focus({ preventScroll: true });
    }
  }, [view]);

  return (
    <div ref={rootRef} data-memorial-gallery="" data-gallery-view={view}>
      <div hidden={view === "album"}>
        <A13DesktopGallery media={media} theme={theme} title={title} subtitle={subtitle} language={language} onSeeMore={openAlbum} />
      </div>
      {view === "album" ? (
        <div data-memorial-gallery-album="">
          <div className={styles.albumBar}>
            <button ref={backRef} type="button" className={styles.back} onClick={closeAlbum}>
              {translate(language, "common.back")}
            </button>
          </div>
          <A13DesktopFullAlbum media={media} theme={theme} language={language} />
        </div>
      ) : null}
    </div>
  );
}
