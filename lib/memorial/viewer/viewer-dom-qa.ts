import type { ViewerGeometry } from "@/lib/memorial/viewer/viewer-layout";
import { readViewerCaptionLines, viewerCaptionFindings, type ViewerStopFinding } from "@/lib/memorial/viewer/viewer-caption-measure";

export type { ViewerStopFinding };

/**
 * A13 Viewer Desktop V2 — RENDERED checks and geometry snapshot (browser).
 *
 * `viewerDomSnapshot` reads what the DOM lays out once the Viewer is open
 * and settled: boxes (print, paper, photo, caption lines and their text
 * ranges, close target), font metrics, focus geometry and the motion
 * actually requested. Geometry and accessibility only — colours, textures,
 * shadows and asset URLs are material and deliberately left out, so the
 * Light and Dark snapshots of the same media and viewport must be
 * byte-identical (THEME_GEOMETRY_PARITY_STOP otherwise).
 *
 * `viewerDomStops` turns the Handoff stop conditions into rendered checks:
 * crop, distortion, viewport fit, caption (`viewerCaptionStops`: overflow,
 * line count, measurement divergence, font gate —
 * `A13_VIEWER_CAPTION_MEASUREMENT_HANDOFF_V1`), close accessibility, photo
 * processing, reduced motion.
 */

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const box = (b: DOMRect) => [r3(b.left), r3(b.top), r3(b.width), r3(b.height)];

function textBox(el: Element) {
  const range = document.createRange();
  range.selectNodeContents(el);
  return box(range.getBoundingClientRect());
}

const FONT_PROPS = ["font-family", "font-size", "line-height", "font-weight", "font-style", "letter-spacing", "white-space", "text-align", "overflow", "text-overflow"] as const;
const pick = (el: Element, props: readonly string[]) => {
  const cs = getComputedStyle(el);
  return Object.fromEntries(props.map((p) => [p, cs.getPropertyValue(p)]));
};

export interface ViewerParts {
  root: HTMLElement;
  dialog: HTMLElement;
  print: HTMLElement;
  paper: SVGSVGElement;
  photo: HTMLImageElement;
  caption: HTMLElement | null;
  close: HTMLButtonElement;
}

export function viewerParts(root: HTMLElement): ViewerParts {
  const q = <T extends Element>(s: string) => root.querySelector<T>(s);
  return {
    root,
    dialog: q<HTMLElement>("[role=dialog]")!,
    print: q<HTMLElement>("[data-viewer-print]")!,
    paper: q<SVGSVGElement>("[data-viewer-paper]")!,
    photo: q<HTMLImageElement>("[data-viewer-photo]")!,
    caption: q<HTMLElement>("[data-viewer-caption]"),
    close: q<HTMLButtonElement>("[data-viewer-close]")!,
  };
}

export interface MotionRecord {
  open: { durationMs: number; easing: string; keyframes: { opacity: string; transform: string }[] } | null;
  reduced: boolean;
}

export function viewerDomSnapshot(root: HTMLElement, motion: MotionRecord) {
  const p = viewerParts(root);
  const closeCs = getComputedStyle(p.close);
  return {
    viewport: [document.documentElement.clientWidth, window.innerHeight],
    dialog: { role: p.dialog.getAttribute("role"), modal: p.dialog.getAttribute("aria-modal"), label: p.dialog.getAttribute("aria-label") },
    print: box(p.print.getBoundingClientRect()),
    printTransform: getComputedStyle(p.print).transform,
    paper: { box: box(p.paper.getBoundingClientRect()), slices: p.paper.querySelectorAll("[data-viewer-slice]").length },
    photo: {
      box: box(p.photo.getBoundingClientRect()),
      alt: p.photo.alt,
      objectFit: getComputedStyle(p.photo).objectFit,
      natural: [p.photo.naturalWidth, p.photo.naturalHeight],
    },
    caption: p.caption
      ? {
          box: box(p.caption.getBoundingClientRect()),
          ink: textBox(p.caption),
          font: pick(p.caption, FONT_PROPS),
          lines: (readViewerCaptionLines(p.caption) ?? []).map((l) => ({ text: l.text, box: [l.x, l.y, l.width, l.height].map(r3) })),
        }
      : null,
    close: {
      box: box(p.close.getBoundingClientRect()),
      tag: p.close.tagName,
      label: p.close.getAttribute("aria-label"),
      glyph: p.close.textContent,
      font: [closeCs.fontSize, closeCs.fontWeight, closeCs.lineHeight],
      focused: document.activeElement === p.close,
      outline: [closeCs.outlineStyle, closeCs.outlineWidth, closeCs.outlineOffset],
    },
    motion,
  };
}

/** Rendered stop checks of an open, settled Viewer. */
export function viewerDomStops(root: HTMLElement, g: ViewerGeometry, reduced: boolean): ViewerStopFinding[] {
  const p = viewerParts(root);
  const out: ViewerStopFinding[] = [];
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const tol = 0.75;

  // Photo: whole, natural ratio, contain, no processing.
  const pr = p.photo.getBoundingClientRect();
  const pcs = getComputedStyle(p.photo);
  const natural = p.photo.naturalWidth && p.photo.naturalHeight ? p.photo.naturalWidth / p.photo.naturalHeight : g.ratio;
  const boxRatio = pr.width / pr.height;
  const ratioOff = Math.abs(boxRatio / natural - 1) > 0.005;
  if (pcs.objectFit === "cover" || pcs.objectFit === "none") out.push({ stop: "VIEWER_CROP_STOP", detail: `object-fit ${pcs.objectFit}` });
  else if (ratioOff && pcs.objectFit === "fill") out.push({ stop: "VIEWER_DISTORTION_STOP", detail: `box ${boxRatio.toFixed(4)} vs natural ${natural.toFixed(4)} (fill)` });
  else if (ratioOff) out.push({ stop: "VIEWER_DISTORTION_STOP", detail: `box ${boxRatio.toFixed(4)} vs natural ${natural.toFixed(4)}` });
  if (Math.abs(natural / g.ratio - 1) > 0.005) out.push({ stop: "VIEWER_DISTORTION_STOP", detail: `decoded ${natural.toFixed(4)} vs layout ${g.ratio.toFixed(4)}` });
  let clipped = false;
  for (let el: HTMLElement | null = p.photo.parentElement; el && el !== root; el = el.parentElement) {
    const cs = getComputedStyle(el);
    if (cs.overflow !== "visible" || cs.clipPath !== "none") {
      const b = el.getBoundingClientRect();
      if (pr.left < b.left - tol || pr.top < b.top - tol || pr.right > b.right + tol || pr.bottom > b.bottom + tol) clipped = true;
    }
  }
  if (clipped) out.push({ stop: "VIEWER_CROP_STOP", detail: "photo clipped by an ancestor" });
  const processed: string[] = [];
  if (pcs.filter !== "none") processed.push(`filter ${pcs.filter}`);
  if (pcs.opacity !== "1") processed.push(`opacity ${pcs.opacity}`);
  if (pcs.mixBlendMode !== "normal") processed.push(`blend ${pcs.mixBlendMode}`);
  const bf = pcs.getPropertyValue("backdrop-filter");
  if (bf && bf !== "none") processed.push(`backdrop ${bf}`);
  for (let el: HTMLElement | null = p.photo.parentElement; el && el !== document.body; el = el.parentElement) {
    const cs = getComputedStyle(el);
    if (cs.filter !== "none") processed.push(`ancestor filter ${cs.filter}`);
    if (cs.opacity !== "1") processed.push(`ancestor opacity ${cs.opacity}`);
    if (cs.mixBlendMode !== "normal") processed.push(`ancestor blend ${cs.mixBlendMode}`);
  }
  if (processed.length) out.push({ stop: "VIEWER_DARK_PHOTO_PROCESSING_STOP", detail: processed.join(", ") });

  // Viewport fit: paper, photo, caption and close inside the viewport.
  const paper = p.print.getBoundingClientRect();
  const inside = (b: DOMRect, x0: number, y0: number, x1: number, y1: number) => b.left >= x0 - tol && b.top >= y0 - tol && b.right <= x1 + tol && b.bottom <= y1 + tol;
  if (!inside(paper, g.safeX, g.safeY, vw - g.safeX, vh - g.safeY)) out.push({ stop: "VIEWER_VIEWPORT_FIT_STOP", detail: `paper ${box(paper).join(",")} outside safe area` });
  if (!inside(pr, 0, 0, vw, vh)) out.push({ stop: "VIEWER_VIEWPORT_FIT_STOP", detail: "photo outside viewport" });
  if (document.documentElement.scrollWidth > vw + 1) out.push({ stop: "VIEWER_VIEWPORT_FIT_STOP", detail: "horizontal scroll" });

  // Caption: A13_VIEWER_CAPTION_MEASUREMENT_HANDOFF_V1 rendered checks.
  out.push(...viewerCaptionStops(root, g));

  // Close: native button, named, ≥ 48×48, in the viewport, hit-testable.
  const cr = p.close.getBoundingClientRect();
  const hit = document.elementFromPoint(cr.left + cr.width / 2, cr.top + cr.height / 2);
  if (p.close.tagName !== "BUTTON" || !p.close.getAttribute("aria-label") || cr.width < 48 - 0.01 || cr.height < 48 - 0.01 || !inside(cr, 0, 0, vw, vh) || !(hit && p.close.contains(hit)))
    out.push({ stop: "VIEWER_CLOSE_INACCESSIBLE_STOP", detail: `${p.close.tagName} ${cr.width.toFixed(1)}×${cr.height.toFixed(1)} hit ${hit === p.close || (hit && p.close.contains(hit)) ? "ok" : hit?.tagName}` });

  // Motion: settled state has no transform; reduced motion never animates space.
  const tf = getComputedStyle(p.print).transform;
  const anims = p.print.getAnimations();
  if (reduced) {
    const spatial = anims.some((a) => (a.effect as KeyframeEffect | null)?.getKeyframes().some((k) => k.transform && k.transform !== "none"));
    if (tf !== "none" || spatial || getComputedStyle(p.print).transitionDuration.split(",").some((d) => parseFloat(d) > 0))
      out.push({ stop: "VIEWER_REDUCED_MOTION_STOP", detail: `transform ${tf}, ${anims.length} animation(s)` });
  } else if (tf !== "none" && tf !== "matrix(1, 0, 0, 1, 0, 0)") out.push({ stop: "VIEWER_VIEWPORT_FIT_STOP", detail: `settled transform ${tf}` });

  return out;
}

/**
 * The caption's rendered checks (`A13_VIEWER_CAPTION_MEASUREMENT_HANDOFF_V1`):
 * the visible lines (`Range.getClientRects()`) against the paper's caption
 * safe rect — the photo column minus the caption inset, from the photo's
 * bottom to the paper's bottom, read from the photo and the print, never
 * from the caption itself — and against the offscreen measurement carried
 * by the geometry; plus the font gate and visible truncation styles.
 */
export function viewerCaptionStops(root: HTMLElement, g: ViewerGeometry): ViewerStopFinding[] {
  const out: ViewerStopFinding[] = [];
  const p = viewerParts(root);
  if (g.flags.captionFontReady === false) out.push({ stop: "VIEWER_CAPTION_FONT_NOT_READY_STOP", detail: "caption face not confirmed loaded before measurement" });
  if (!g.caption || !p.caption) return out;
  const cs = getComputedStyle(p.caption);
  if (cs.overflow !== "visible" || cs.textOverflow === "ellipsis" || cs.clipPath !== "none")
    out.push({ stop: "VIEWER_CAPTION_OVERFLOW_STOP", detail: `overflow ${cs.overflow} / text-overflow ${cs.textOverflow} / clip ${cs.clipPath}` });
  const rendered = readViewerCaptionLines(p.caption) ?? [];
  const cap = p.caption.getBoundingClientRect();
  const photo = p.photo.getBoundingClientRect();
  const print = p.print.getBoundingClientRect();
  const inset = (g.photoLocal.w - g.caption.usableWidth) / 2;
  const safe = { left: photo.left + inset, right: photo.right - inset, top: photo.bottom, bottom: print.bottom };
  const findings = viewerCaptionFindings({
    caption: g.caption.text,
    text: p.caption.textContent ?? "",
    rendered,
    measured: g.caption.lines,
    box: { left: cap.left, top: cap.top },
    safe,
    font: { measured: g.caption.fontSize, rendered: parseFloat(cs.fontSize) },
    fontReady: null,
  });
  out.push(...findings);
  return out;
}
