/**
 * A13 Desktop Dark V1.1 — RENDERED geometry snapshot of one scene (browser
 * only, pilot QA). Complements the engine snapshot (`theme-parity.ts`):
 * it reads what the DOM actually lays out and hit-tests, per theme, so the
 * Light/Dark comparison also covers the rendering layer (visual shadows,
 * paper grain, inks and focus rules must move nothing).
 *
 * Geometry and accessibility fields only. Material fields (background
 * source, `--a13-dark-*` custom properties, colours, shadows, the
 * `data-a13-theme` marker) are deliberately NOT collected here — they are
 * reported separately by `sceneMaterialReport`.
 */

const r3 = (v: number) => Math.round(v * 1000) / 1000;

function rel(el: Element, origin: DOMRect) {
  const b = el.getBoundingClientRect();
  return [r3(b.left - origin.left), r3(b.top - origin.top), r3(b.width), r3(b.height)];
}

function offsetBox(el: HTMLElement) {
  return [el.offsetLeft, el.offsetTop, el.offsetWidth, el.offsetHeight];
}

/** Inline style declarations, minus theme-material custom properties. */
function geometryStyle(el: HTMLElement) {
  const out: Record<string, string> = {};
  for (let i = 0; i < el.style.length; i++) {
    const p = el.style[i];
    if (p.startsWith("--a13-dark-")) continue;
    out[p] = el.style.getPropertyValue(p);
  }
  return out;
}

const LAYOUT_PROPS = [
  "position", "display", "box-sizing", "transform", "transform-origin", "z-index", "overflow",
  "border-top-width", "border-left-width", "border-radius", "padding-top", "padding-left",
  "outline-width", "outline-offset", "font-family", "font-size", "line-height", "font-weight",
  "font-style", "letter-spacing", "white-space", "clip-path", "mask-image", "pointer-events",
] as const;

function layoutComputed(el: Element) {
  const cs = getComputedStyle(el);
  return Object.fromEntries(LAYOUT_PROPS.map((p) => [p, cs.getPropertyValue(p)]));
}

function textRangeBox(el: Element, origin: DOMRect) {
  const range = document.createRange();
  range.selectNodeContents(el);
  return rel(range as unknown as Element, origin);
}

/** Rendered geometry + accessibility of one `[data-testid=a13-pilot-scene]`. */
export function domGeometrySnapshot(scene: HTMLElement, hitStepPx = 30) {
  const canvas = scene.firstElementChild as HTMLElement;
  const o = canvas.getBoundingClientRect();
  const bg = canvas.querySelector<HTMLImageElement>(":scope > img");
  const slots = [...canvas.querySelectorAll<HTMLElement>("[data-slot-id]")];
  const snap = {
    canvas: [r3(o.width), r3(o.height)],
    background: bg ? { box: rel(bg, o), layout: layoutComputed(bg), zIndex: bg.style.zIndex, alt: bg.alt, ariaHidden: bg.getAttribute("aria-hidden") } : null,
    slots: slots.map((s) => {
      const print = s.querySelector<HTMLElement>("[data-print]")!;
      const win = print.querySelector<HTMLElement>(":scope > div")!;
      const img = win.querySelector<HTMLImageElement>("img")!;
      const band = print.querySelector<HTMLElement>("figcaption")!;
      const stroke = print.querySelector<HTMLElement>(":scope > div[aria-hidden]");
      const svg = print.querySelector<SVGSVGElement>("svg");
      return {
        slotId: s.dataset.slotId,
        mediaIndex: s.dataset.mediaIndex,
        mode: s.dataset.mode,
        interactive: s.hasAttribute("data-interactive"),
        slotStyle: geometryStyle(s),
        slotLayout: layoutComputed(s),
        printBox: rel(print, o),
        printOffset: offsetBox(print),
        printStyle: geometryStyle(print),
        printLayout: layoutComputed(print),
        window: { offset: offsetBox(win), style: geometryStyle(win), box: rel(win, o) },
        photo: { offset: offsetBox(img), style: geometryStyle(img), box: rel(img, o), src: img.getAttribute("src")?.slice(0, 96), naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight },
        band: { offset: offsetBox(band), style: geometryStyle(band), text: band.textContent },
        stroke: stroke ? offsetBox(stroke) : null,
        caption: svg
          ? {
              viewBox: svg.getAttribute("viewBox"),
              style: geometryStyle(svg as unknown as HTMLElement),
              status: svg.getAttribute("data-status"),
              lines: [...svg.querySelectorAll("text")].map((t) => {
                const b = t.getBBox();
                return { text: t.textContent, x: t.getAttribute("x"), y: t.getAttribute("y"), bbox: [r3(b.x), r3(b.y), r3(b.width), r3(b.height)], box: rel(t, o), layout: layoutComputed(t) };
              }),
            }
          : null,
        a11y: {
          role: print.getAttribute("role"),
          tabIndex: print.getAttribute("tabindex"),
          label: print.getAttribute("aria-label"),
          alt: img.alt,
        },
      };
    }),
    title: (() => {
      const h = canvas.querySelector("header");
      const h2 = h?.querySelector("h2");
      const p = h?.querySelector("p");
      return h && h2 && p
        ? {
            block: rel(h, o),
            blockLayout: layoutComputed(h),
            heading: { box: rel(h2, o), ink: textRangeBox(h2, o), layout: layoutComputed(h2), text: h2.textContent },
            microcopy: { box: rel(p, o), ink: textRangeBox(p, o), layout: layoutComputed(p), text: p.textContent },
          }
        : null;
    })(),
    cta: (() => {
      const b = canvas.querySelector<HTMLButtonElement>("[data-testid=cta-7plus]");
      const l = b?.querySelector("[data-testid=cta-7plus-label]");
      return b && l
        ? { box: rel(b, o), style: geometryStyle(b), layout: layoutComputed(b), label: { box: rel(l, o), text: l.textContent }, a11y: { tag: b.tagName, type: b.type, lang: b.lang, name: b.textContent, disabled: b.disabled } }
        : null;
    })(),
    /** Topmost print (or CTA / background) under a grid of canvas points —
     * the scene must be scrolled into the viewport. */
    hitGrid: (() => {
      const rows: string[] = [];
      for (let y = hitStepPx / 2; y < o.height; y += hitStepPx) {
        let row = "";
        for (let x = hitStepPx / 2; x < o.width; x += hitStepPx) {
          const el = document.elementFromPoint(o.left + x, o.top + y);
          const owner = el?.closest("[data-print],[data-testid=cta-7plus]");
          row += owner ? (owner.getAttribute("data-print") ?? "CTA").slice(-1) : el && canvas.contains(el) ? "." : "?";
        }
        rows.push(row);
      }
      return rows;
    })(),
  };
  return snap;
}

export type DomGeometrySnapshot = ReturnType<typeof domGeometrySnapshot>;

const PHOTO_PROCESSING_PROPS = ["filter", "opacity", "mix-blend-mode", "backdrop-filter", "mask-image", "-webkit-mask-image"] as const;

/**
 * Material report of one scene (NOT compared for parity): background
 * source, and the photo-processing properties of every photo and of every
 * ancestor up to the scene (a filter or opacity anywhere on that chain
 * would process the photo pixels — `DARK_PHOTO_PROCESSING_STOP`).
 */
export function sceneMaterialReport(scene: HTMLElement) {
  const canvas = scene.firstElementChild as HTMLElement;
  const bg = canvas.querySelector<HTMLImageElement>(":scope > img");
  const photos = [...canvas.querySelectorAll<HTMLImageElement>("[data-print] img")].map((img) => {
    const chain: Record<string, string>[] = [];
    let el: Element | null = img;
    while (el && el !== scene.parentElement) {
      const cs = getComputedStyle(el);
      chain.push(Object.fromEntries(PHOTO_PROCESSING_PROPS.map((p) => [p, cs.getPropertyValue(p)])));
      el = el.parentElement;
    }
    const processed = chain.some((c) => (c.filter && c.filter !== "none") || c.opacity !== "1" || c["mix-blend-mode"] !== "normal" || (c["backdrop-filter"] && c["backdrop-filter"] !== "none") || (c["mask-image"] && c["mask-image"] !== "none"));
    return { slotId: img.closest("[data-print]")?.getAttribute("data-print"), processed, chainLength: chain.length, photo: chain[0] };
  });
  return {
    theme: scene.getAttribute("data-a13-theme") ?? "light",
    background: bg ? { src: bg.getAttribute("src"), naturalWidth: bg.naturalWidth, naturalHeight: bg.naturalHeight } : null,
    photos,
    ctaPresent: !!canvas.querySelector("[data-testid=cta-7plus]"),
    foregroundPresent: !!canvas.querySelector("[data-foreground],[data-layer=foreground]"),
  };
}
