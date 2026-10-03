"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Language } from "@/config/languages";
import type { SkinVariant } from "@/config/skins";
import { selectA13ResponsiveFamily, type A13ResponsiveSelection } from "@/config/a13-responsive-bridge";
import { translate } from "@/lib/i18n/translate";
import type { A13FamilyMedia } from "@/lib/memorial/gallery/gallery-desktop-runtime";
import { A13DesktopGallery } from "@/components/memorial/gallery/A13DesktopGallery";
import { A13MobileGallery } from "@/components/memorial/gallery/A13MobileGallery";
import { A13DesktopFullAlbum } from "@/components/memorial/album/A13DesktopFullAlbum";
import { A13MobileFullAlbum } from "@/components/memorial/album/A13MobileFullAlbum";
import { useMemoryViewer, type ViewerOrigin } from "@/components/memorial/viewer/MemoryViewer";
import styles from "./GalleryIntemporel.module.css";

/**
 * Dettes D2–D4 — the Memorial's Gallery section (renderer key
 * `GalleryIntemporel`): the product host of the VALIDATED A13 runtimes
 * (Desktop, Mobile, and the Responsive Bridge V1 families), mounted by
 * `MemorialAssembly` like every other section.
 *
 * It composes the existing A13 components and adds only what a product
 * host must own — nothing of the engines, the geometry, the materials or
 * the Viewer is touched:
 *
 *  - Gallery (0–1 → no Gallery, 2…5 → G2…G5, 6 → G6 exact, 7+ → Signature
 *    + CTA — each runtime's own rules; every print opens the shared
 *    Viewer, in the memorial's theme);
 *  - Full Album (7+ only, through the CTA): every usable photograph in the
 *    family's order, each opening the Viewer;
 *  - the Gallery ↔ Album switch, as LOCAL STATE (QG D3): the Builder
 *    Preview has no URL of its own, so no route, no `router.push`, no
 *    history entry. The CTA is therefore the scene's existing `<button>`.
 *
 * ## Responsive family (A13 Responsive Bridge V1)
 *
 * The section's own width W (the A13 container, measured before paint and
 * on every resize) selects ONE family (`selectA13ResponsiveFamily`):
 *  - 320–374 Small Mobile (V1.4.1), 375–430 Mobile CLOSED and 431–1023 Tablet vertical →
 *    `A13MobileGallery` / `A13MobileFullAlbum` (`responsive`: the Tablet
 *    is the 430 authority remapped to W); the Mobile Gallery reports its
 *    activations, so this host opens the Viewer for it, exactly as the
 *    Desktop Gallery does for itself;
 *  - 1024–1199 Horizontal intermediate and ≥ 1200 Desktop CLOSED →
 *    `A13DesktopGallery` / `A13DesktopFullAlbum` (their uniform 1670
 *    canvas IS the 1200 authority × W / 1200 in 1024–1199);
 *  - below 320: out of the V1 contract — `STOP_RESPONSIVE_BELOW_320_OUT_OF_SCOPE`
 *    is exposed (`data-a13-responsive-stop`) and logged once, and NO
 *    Gallery is rendered (the D7 fail-closed policy; no A13 behaviour is
 *    invented there).
 * Crossing 1023 / 1024 swaps the family atomically (never an
 * interpolation); the view (Gallery or Album), the theme and an open
 * Viewer are kept (the Mobile Gallery's and both Albums' Viewer is this
 * host's, never the swapped section's). When the family changed while the
 * Album's Viewer was open, the print it was opened from no longer exists:
 * once the Viewer has finished its own (unchanged) close, the host brings
 * the SAME memory of the new Album on screen and gives it focus — found by
 * `data-media-index`, never by a family-specific slot id — or, failing
 * that, the new Album itself. Nothing else ever triggers it.
 *
 * ## Focus and scroll (QG D3) — the Preview host's own convention
 *
 * The Gallery is PARKED, never unmounted, while the Album is open (the
 * way `BuilderPreviewHost` keeps the Builder mounted): no height,
 * invisible — so out of the focus order and the accessibility tree — but
 * still laid out at the section's width, so its composition, its measured
 * fonts and its CTA are exactly as they were on return (a Mobile-derived
 * Gallery measures its own width; `hidden` would collapse it to 0).
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

/** Families painted by the Desktop sections (Desktop CLOSED and the 1200-derived Horizontal). */
const desktopDerived = (s: A13ResponsiveSelection | null) => s?.family === "desktop" || s?.family === "horizontal";

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

/**
 * After a family switch under the Album's Viewer: the same memory in the new
 * Album (its print, by `data-media-index`) on screen and focused; if that print
 * cannot be found, the new Album itself on screen and focused.
 */
function revealAlbumMemory(album: HTMLElement, mediaIndex: number): void {
  const container = album.querySelector<HTMLElement>("[data-testid=album-memory-table]") ?? album;
  const print = container.querySelector<HTMLElement>(`[data-media-index="${mediaIndex}"] [data-print]`);
  const target = print ?? container;
  const r = target.getBoundingClientRect();
  const off = print ? r.top < 0 || r.bottom > window.innerHeight : r.bottom <= 0 || r.top >= window.innerHeight;
  if (off) window.scrollTo({ left: window.scrollX, top: window.scrollY + (print ? r.top + r.height / 2 - window.innerHeight / 2 : r.top), behavior: "instant" });
  uncoverFromStickyChrome(target);
  if (!print && !container.hasAttribute("tabindex")) container.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
}

export function GalleryIntemporel({ media, theme, title, subtitle, language }: GalleryIntemporelProps) {
  const [view, setView] = useState<View>("gallery");
  const [width, setWidth] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const galleryScrollY = useRef(0);
  const previousView = useRef<View>("gallery");
  // The Viewer of the Mobile-derived Gallery and of both Albums (the Desktop Gallery owns its own).
  const viewer = useMemoryViewer();

  // The A13 container's width, before the first paint and on every resize.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const read = () => setWidth(el.getBoundingClientRect().width);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const selection = width === null ? null : selectA13ResponsiveFamily(width);
  const stop = selection?.family === null ? selection.stop : null;
  const family = selection?.family ?? null;

  // Below 320 px: the contract's own STOP, exposed and logged once per entry — never silent, never a substitute.
  const stopLogged = useRef(false);
  useEffect(() => {
    if (!stop) {
      stopLogged.current = false;
      return;
    }
    if (stopLogged.current) return;
    stopLogged.current = true;
    console.error("Gallery: width outside the A13 responsive contract (no Gallery rendered):", stop, width);
  }, [stop, width]);

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
      const top = root.getBoundingClientRect().top + window.scrollY;
      const back = backRef.current;
      const reveal = () => {
        window.scrollTo({ left: 0, top, behavior: "instant" });
        if (back) uncoverFromStickyChrome(back);
      };
      reveal();
      back?.focus({ preventScroll: true });
      // A Mobile-derived Album lays itself out once it has measured its own width: until then the page
      // can end right below "Retour" and the browser clamps the scroll. Bring the Album up again as it
      // grows — unless the visitor has scrolled in the meantime.
      const album = root.querySelector<HTMLElement>("[data-memorial-gallery-album]");
      const clamped = () => window.scrollY >= document.documentElement.scrollHeight - window.innerHeight - 1;
      if (!album || !clamped()) return;
      let landed = window.scrollY;
      const ro = new ResizeObserver(() => {
        if (Math.abs(window.scrollY - landed) > 1) return ro.disconnect();
        reveal();
        landed = window.scrollY;
        if (!clamped()) ro.disconnect();
      });
      ro.observe(album);
      return () => ro.disconnect();
    } else {
      window.scrollTo({ left: 0, top: galleryScrollY.current, behavior: "instant" });
      root.querySelector<HTMLElement>("[data-testid=cta-7plus]")?.focus({ preventScroll: true });
    }
  }, [view]);

  // Same request as the sections' own: the media, its natural size and caption, the memorial's theme, the origin.
  const openViewer = viewer.open;
  const openMedia = useCallback(
    (mediaIndex: number, origin: ViewerOrigin) => {
      const m = media[mediaIndex];
      if (m) openViewer({ mediaId: m.mediaId, src: m.src, alt: m.alt, naturalWidth: m.width, naturalHeight: m.height, caption: m.caption }, theme, origin, language);
    },
    [media, openViewer, theme, language],
  );
  // The Album's Viewer: the memory it was opened on, whether the family changed since.
  const albumViewer = useRef<{ mediaIndex: number; switched: boolean } | null>(null);
  const openMemory = useCallback(
    (mediaIndex: number) => {
      albumViewer.current = null;
      openMedia(mediaIndex, "gallery");
    },
    [openMedia],
  );
  const openAlbumMemory = useCallback(
    (mediaIndex: number) => {
      albumViewer.current = media[mediaIndex] ? { mediaIndex, switched: false } : null;
      openMedia(mediaIndex, "album");
    },
    [openMedia, media],
  );
  // Runs only when the family changes: with that Viewer open, its Album has just been replaced.
  useEffect(() => {
    if (albumViewer.current) albumViewer.current.switched = true;
  }, [family]);
  // Once that Viewer has closed (its own scroll / focus restore has run, untouched): only after a family switch.
  const viewerOpen = viewer.isOpen;
  useEffect(() => {
    const a = albumViewer.current;
    if (viewerOpen || !a) return;
    albumViewer.current = null;
    const album = rootRef.current?.querySelector<HTMLElement>("[data-memorial-gallery-album]");
    if (a.switched && album) revealAlbumMemory(album, a.mediaIndex);
  }, [viewerOpen]);

  const desktop = desktopDerived(selection);
  return (
    <div
      ref={rootRef}
      data-memorial-gallery=""
      data-gallery-view={view}
      data-a13-family={width === null ? "pending" : (family ?? "none")}
      {...(selection && selection.family !== null ? { "data-a13-source-width": selection.sourceWidth, "data-a13-scale": selection.scale } : {})}
      {...(stop ? { "data-a13-responsive-stop": stop } : {})}
    >
      {family !== null ? (
        <>
          <div className={view === "album" ? styles.parked : undefined} data-memorial-gallery-scene={view === "album" ? "parked" : "shown"}>
            {desktop ? (
              <A13DesktopGallery key="desktop" media={media} theme={theme} title={title} subtitle={subtitle} language={language} onSeeMore={openAlbum} />
            ) : (
              <A13MobileGallery key="mobile" responsive media={media} theme={theme} title={title} subtitle={subtitle} language={language} onSeeMore={openAlbum} onActivateMemory={openMemory} />
            )}
          </div>
          {view === "album" ? (
            <div data-memorial-gallery-album="">
              <div className={styles.albumBar}>
                <button ref={backRef} type="button" className={styles.back} onClick={closeAlbum}>
                  {translate(language, "common.back")}
                </button>
              </div>
              {desktop ? (
                <A13DesktopFullAlbum key="desktop" media={media} theme={theme} language={language} onOpenMemory={openAlbumMemory} />
              ) : (
                <A13MobileFullAlbum key="mobile" responsive media={media} theme={theme} language={language} onOpenMemory={openAlbumMemory} />
              )}
            </div>
          ) : null}
        </>
      ) : null}
      {viewer.node}
    </div>
  );
}
