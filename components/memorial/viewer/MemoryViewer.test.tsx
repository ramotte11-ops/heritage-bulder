// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { ViewerCaptionWrapFn } from "@/lib/memorial/viewer/viewer-caption-measure";

vi.mock("next/font/google", () => ({
  Cormorant_Garamond: () => ({ variable: "v-cormorant", className: "" }),
  La_Belle_Aurore: () => ({ variable: "v-aurore", className: "" }),
  Playfair_Display: () => ({ variable: "v-playfair", className: "" }),
  Inter: () => ({ variable: "v-inter", className: "" }),
  EB_Garamond: () => ({ variable: "v-eb", className: "" }),
}));

/** jsdom has no layout: the shared primitive is stood in for (11.5 px per character at 27 px, balanced break). */
const wrapCalls: [string, number, number, number][] = [];
const fakeWrap: ViewerCaptionWrapFn = (text, fs, lh, width) => {
  wrapCalls.push([text, fs, lh, width]);
  const w = (t: string) => ([...t].length * 11.5 * fs) / 27;
  const mk = (t: string, start: number, i: number) => ({ text: t, start, end: start + t.length, x: (width - w(t)) / 2, y: i * lh, width: w(t), height: lh });
  if (w(text) <= width) return { lines: [mk(text, 0, 0)] };
  const words = text.split(" ");
  const longest = (i: number) => Math.max(w(words.slice(0, i).join(" ")), w(words.slice(i).join(" ")));
  let best = 1;
  for (let i = 2; i < words.length; i++) if (longest(i) < longest(best)) best = i;
  const a = words.slice(0, best).join(" ");
  return { lines: [mk(a, 0, 0), mk(words.slice(best).join(" "), a.length + 1, 1)] };
};
const gate = { ready: true, family: "La Belle Aurore", style: "normal", weight: "400", spec: "", faces: [] };
vi.mock("@/lib/memorial/viewer/viewer-caption-measure", async (orig) => ({
  ...(await orig<typeof import("@/lib/memorial/viewer/viewer-caption-measure")>()),
  awaitViewerCaptionFont: async () => gate,
  viewerCaptionFontStatus: () => gate,
  createViewerCaptionMeasure: () => ({ wrap: fakeWrap, element: document.createElement("div") }),
}));

const { MemoryViewer, viewerOriginIdentity } = await import("./MemoryViewer");
type Report = import("./MemoryViewer").ViewerReport;

const media = { mediaId: "m1", src: "/p.jpg", alt: "Photo de test 1", naturalWidth: 1080, naturalHeight: 1920, caption: "MAMAN ET MAMIE, À MIMIZAN, 1966." };

let scrollTo: ReturnType<typeof vi.fn>;
beforeEach(() => {
  Object.defineProperty(document.documentElement, "clientWidth", { value: 1670, configurable: true });
  Object.defineProperty(document.documentElement, "clientHeight", { value: 941, configurable: true });
  Object.defineProperty(window, "scrollY", { value: 2400, configurable: true });
  scrollTo = vi.fn();
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

function host() {
  const app = document.createElement("div");
  app.innerHTML = `<section data-testid="album-memory-table"><figure role="button" tabindex="0" data-print="p1">tirage</figure></section>`;
  document.body.appendChild(app);
  const trigger = app.querySelector<HTMLElement>("[data-print]")!;
  trigger.focus();
  return { app, trigger, container: app.querySelector<HTMLElement>("section")! };
}

async function open(theme: "light" | "dark", h = host(), opts: { identity?: boolean; onReport?: (r: Report) => void } = {}) {
  const onClosed = vi.fn();
  const originIdentity = opts.identity ? viewerOriginIdentity(h.trigger, "album") : null;
  render(<MemoryViewer media={media} theme={theme} origin="album" language="fr" trigger={h.trigger} container={h.container} originIdentity={originIdentity} onClosed={onClosed} onReport={opts.onReport} />, {
    container: document.createElement("div"),
  });
  const root = document.querySelector<HTMLElement>("[data-a13-viewer]")!;
  await waitFor(() => expect(root.dataset.viewerState).toBe("open"));
  return { root, onClosed, ...h };
}

/** Geometry-only serialisation: every attribute and inline style, minus material
 * (asset URLs, colours and the shadow filter — shadows are material tokens). */
function geometryDom(root: HTMLElement) {
  const clone = root.querySelector("[role=dialog]")!.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("filter").forEach((f) => f.remove());
  clone.querySelectorAll("*").forEach((el) => {
    el.removeAttribute("href");
    el.removeAttribute("flood-color");
    for (const a of ["id", "fill", "mask", "filter"]) el.removeAttribute(a);
  });
  return clone.outerHTML;
}

describe("A13 Viewer Desktop V2 — MemoryViewer", () => {
  it("opens a named modal dialog, makes the background inert, locks the document and focuses the close button", async () => {
    const { root, app } = await open("light");
    const dialog = root.querySelector("[role=dialog]")!;
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe("Souvenir — MAMAN ET MAMIE, À MIMIZAN, 1966.");
    expect(app.hasAttribute("inert")).toBe(true);
    expect(document.documentElement.style.overflow).toBe("hidden");
    const close = root.querySelector<HTMLButtonElement>("[data-viewer-close]")!;
    expect(close.tagName).toBe("BUTTON");
    expect(close.getAttribute("aria-label")).toBe("Fermer le souvenir");
    expect(document.activeElement).toBe(close);
    // natural ratio, whole photo, two caption lines, no processing inline
    const photo = root.querySelector<HTMLImageElement>("[data-viewer-photo]")!;
    expect(parseFloat(photo.style.width) / parseFloat(photo.style.height)).toBeCloseTo(1080 / 1920, 6);
    expect(photo.alt).toBe("Photo de test 1");
    expect(photo.style.filter).toBe("");
    // one caption text node, the browser's two lines, at the measured (displayed) size and width
    const cap = root.querySelector<HTMLElement>("[data-viewer-caption]")!;
    expect(cap.childNodes).toHaveLength(1);
    expect(cap.textContent).toBe(media.caption);
    expect(cap.dataset.viewerCaptionLines).toBe("2");
    const [, fs, lh, width] = wrapCalls.at(-1)!;
    expect(cap.style.fontSize).toBe(`${fs}px`);
    expect(cap.style.lineHeight).toBe(`${lh}px`);
    expect(parseFloat(cap.style.width)).toBeCloseTo(width, 6);
  });

  it("Caption Measurement V1: the same primitive measures at the displayed size — 27 px at 1670, 20 px on a 375 phone", async () => {
    wrapCalls.length = 0;
    await open("light");
    expect(new Set(wrapCalls.map((c) => c[1]))).toEqual(new Set([27]));
    cleanup();
    document.body.innerHTML = "";
    Object.defineProperty(document.documentElement, "clientWidth", { value: 375, configurable: true });
    Object.defineProperty(document.documentElement, "clientHeight", { value: 812, configurable: true });
    wrapCalls.length = 0;
    const { root } = await open("light");
    expect(new Set(wrapCalls.map((c) => c[1]))).toEqual(new Set([20]));
    expect(root.querySelector<HTMLElement>("[data-viewer-caption]")!.style.fontSize).toBe("20px");
  });

  it("Tab stays on the close button; Escape closes, restores scroll, background and the trigger focus", async () => {
    const { root, onClosed, app, trigger } = await open("dark");
    const close = root.querySelector<HTMLButtonElement>("[data-viewer-close]")!;
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(onClosed).toHaveBeenCalledTimes(1));
    expect(app.hasAttribute("inert")).toBe(false);
    expect(document.documentElement.style.overflow).toBe("");
    expect(scrollTo).toHaveBeenCalledWith({ left: 0, top: 2400, behavior: "instant" });
    expect(document.activeElement).toBe(trigger);
  });

  it("falls back to the Album container when the trigger no longer exists", async () => {
    const h = host();
    const { root, onClosed, container, trigger } = await open("light", h);
    trigger.remove();
    fireEvent.click(root.querySelector("[data-viewer-close]")!);
    await waitFor(() => expect(onClosed).toHaveBeenCalled());
    expect(container.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(container);
  });

  describe("origin after a rotation (the Mobile host remounts or unmounts its prints)", () => {
    const ALBUM = `<section data-testid="album-memory-table"><div data-slot-id="g1-P2" data-media-index="4"><figure role="button" tabindex="0" data-print="g1-P2">tirage</figure></div></section>`;
    function albumHost() {
      const app = document.createElement("div");
      app.innerHTML = ALBUM;
      document.body.appendChild(app);
      const trigger = app.querySelector<HTMLElement>("[data-print]")!;
      trigger.focus();
      return { app, trigger, container: app.querySelector<HTMLElement>("section")! };
    }
    const reports: Report[] = [];
    // The open report reads layout (Range rects, hit-testing, animations): jsdom has none, stand in with empty values.
    const stubs: [object, string][] = [
      [Range.prototype, "getBoundingClientRect"],
      [Range.prototype, "getClientRects"],
      [Element.prototype, "getAnimations"],
      [document, "elementFromPoint"],
    ];
    beforeEach(() => {
      reports.length = 0;
      Object.assign(Range.prototype, { getBoundingClientRect: () => new DOMRect(), getClientRects: () => [] });
      Object.assign(Element.prototype, { getAnimations: () => [] });
      Object.assign(document, { elementFromPoint: () => null });
    });
    afterEach(() => {
      for (const [o, k] of stubs) delete (o as Record<string, unknown>)[k];
    });
    /** As `useMemoryViewer` does: the Viewer unmounts once closed. */
    function Hosted({ h, onReport }: { h: ReturnType<typeof albumHost>; onReport?: (r: Report) => void }) {
      const [on, setOn] = useState(true);
      return on ? (
        <MemoryViewer media={media} theme="light" origin="album" language="fr" trigger={h.trigger} container={h.container} originIdentity={viewerOriginIdentity(h.trigger, "album")} onClosed={() => setOn(false)} onReport={onReport} />
      ) : null;
    }
    async function openHosted(h: ReturnType<typeof albumHost>, onReport?: (r: Report) => void) {
      render(<Hosted h={h} onReport={onReport} />, { container: document.createElement("div") });
      const root = document.querySelector<HTMLElement>("[data-a13-viewer]")!;
      await waitFor(() => expect(root.dataset.viewerState).toBe("open"));
      const close = async () => {
        fireEvent.click(root.querySelector("[data-viewer-close]")!);
        await waitFor(() => expect(document.querySelector("[data-a13-viewer]")).toBeNull());
      };
      return { root, close };
    }

    it("finds the same print again when the host remounted it while the Viewer was open", async () => {
      const h = albumHost();
      const v = await openHosted(h, (r) => reports.push(r));
      h.app.innerHTML = ALBUM; // the host left and came back: new nodes, same identity
      const fresh = h.app.querySelector<HTMLElement>("[data-print]")!;
      expect(fresh).not.toBe(h.trigger);
      await v.close();
      expect(document.activeElement).toBe(fresh);
      await waitFor(() => expect(reports.find((r) => r.kind === "close")).toMatchObject({ focusTarget: "trigger", focusRestored: true, stops: [] }));
    });

    it("origin unmounted at close: no focus on a destroyed node, then focus and scroll come back with the print", async () => {
      const h = albumHost();
      const v = await openHosted(h, (r) => reports.push(r));
      h.app.innerHTML = ""; // landscape: the Mobile section renders nothing
      await v.close();
      expect(document.activeElement).toBe(document.body);
      expect(document.documentElement.style.overflow).toBe("");
      expect(h.app.hasAttribute("inert")).toBe(false);
      await waitFor(() => expect(reports.find((r) => r.kind === "close")).toMatchObject({ focusTarget: "deferred", stops: [] }));
      scrollTo.mockClear();
      h.app.innerHTML = ALBUM; // back to portrait: the print is mounted again
      const back = h.app.querySelector<HTMLElement>("[data-print]")!;
      await waitFor(() => expect(document.activeElement).toBe(back));
      expect(scrollTo).toHaveBeenCalledWith({ left: 0, top: 2400, behavior: "instant" });
      await waitFor(() => expect(reports.find((r) => r.kind === "restore")).toMatchObject({ via: "deferred", focusTarget: "trigger", focusRestored: true }));
    });

    it("a deferred restoration never steals focus from what the visitor focused meanwhile", async () => {
      const h = albumHost();
      const v = await openHosted(h);
      h.app.innerHTML = "";
      await v.close();
      const other = document.createElement("button");
      document.body.appendChild(other);
      other.focus();
      h.app.innerHTML = ALBUM;
      await new Promise((r) => setTimeout(r, 30));
      expect(document.activeElement).toBe(other);
    });

    it("opening another memory cancels a pending restoration", async () => {
      const h = albumHost();
      const v = await openHosted(h);
      h.app.innerHTML = "";
      await v.close();
      const second = await open("light", host());
      h.app.innerHTML = ALBUM;
      await new Promise((r) => setTimeout(r, 30));
      expect(document.activeElement).toBe(second.root.querySelector("[data-viewer-close]"));
    });
  });

  it("Light and Dark render the SAME geometry DOM (material only differs)", async () => {
    const light = geometryDom((await open("light")).root);
    cleanup();
    document.body.innerHTML = "";
    const dark = geometryDom((await open("dark")).root);
    expect(dark).toBe(light);
    expect(light).toContain("data-viewer-slice");
  });

  it("Landscape caption: a phone in landscape widens the paper around the photo, which keeps its viewport position", async () => {
    Object.defineProperty(document.documentElement, "clientWidth", { value: 812, configurable: true });
    Object.defineProperty(document.documentElement, "clientHeight", { value: 375, configurable: true });
    const inner = { w: window.innerWidth, h: window.innerHeight, matchMedia: window.matchMedia };
    let landscape = false;
    window.matchMedia = ((q: string) => ({ matches: q === "(orientation: landscape)" && landscape, media: q })) as unknown as typeof window.matchMedia;
    const photoAt = (root: HTMLElement) => {
      const print = root.querySelector<HTMLElement>("[data-viewer-print]")!;
      const photo = root.querySelector<HTMLElement>("[data-viewer-photo]")!;
      return { print, x: parseFloat(print.style.left) + parseFloat(photo.style.left), y: parseFloat(print.style.top) + parseFloat(photo.style.top), w: photo.style.width, h: photo.style.height };
    };
    try {
      Object.defineProperty(window, "innerWidth", { value: 812, configurable: true });
      Object.defineProperty(window, "innerHeight", { value: 375, configurable: true });
      const natural = photoAt((await open("light")).root);
      expect(natural.print.dataset.viewerLandscapeCaption).toBeUndefined();
      cleanup();
      document.body.innerHTML = "";
      landscape = true;
      const { root } = await open("light");
      const widened = photoAt(root);
      expect(widened.print.dataset.viewerLandscapeCaption).toBe("widened");
      expect(parseFloat(widened.print.style.width)).toBeGreaterThan(parseFloat(natural.print.style.width));
      expect(widened.x).toBeCloseTo(natural.x, 9);
      expect([widened.y, widened.w, widened.h]).toEqual([natural.y, natural.w, natural.h]);
      // centre and symmetry, from the rendered boxes: half the widening on each side, on the 1/64 px layout grid
      const nl = parseFloat(natural.print.style.left);
      const wl = parseFloat(widened.print.style.left);
      const dw = parseFloat(widened.print.style.width) - parseFloat(natural.print.style.width);
      expect(Math.abs(nl - wl - dw / 2)).toBeLessThanOrEqual(1 / 128);
      expect((nl - wl) * 64).toBe(Math.round((nl - wl) * 64));
      expect(root.querySelector<HTMLElement>("[data-viewer-caption]")!.dataset.viewerCaptionLines).toBe("2");
      // back to portrait: the canonical geometry, recomputed
      Object.defineProperty(document.documentElement, "clientWidth", { value: 375, configurable: true });
      Object.defineProperty(document.documentElement, "clientHeight", { value: 812, configurable: true });
      Object.defineProperty(window, "innerWidth", { value: 375, configurable: true });
      Object.defineProperty(window, "innerHeight", { value: 812, configurable: true });
      landscape = false;
      fireEvent(window, new Event("resize"));
      await waitFor(() => expect(root.querySelector<HTMLElement>("[data-viewer-print]")!.dataset.viewerLandscapeCaption).toBeUndefined());
    } finally {
      Object.defineProperty(window, "innerWidth", { value: inner.w, configurable: true });
      Object.defineProperty(window, "innerHeight", { value: inner.h, configurable: true });
      if (inner.matchMedia) window.matchMedia = inner.matchMedia;
      else delete (window as { matchMedia?: unknown }).matchMedia;
    }
  });
});
