// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { A13_MOBILE_BACKGROUND, A13_MOBILE_BOTTOM_CONTINUATION, A13_MOBILE_CTA, A13_MOBILE_GROUP_TRANSLATION, A13_MOBILE_SEPARATOR_ART, A13_MOBILE_STATE_SLOTS } from "@/config/gallery-a13-mobile-manifest";
import { A13_DESKTOP_G6_SLOTS } from "@/config/gallery-a13-desktop-manifest";
import type { CaptionMeasurer } from "@/lib/memorial/gallery/caption-layout";
import { layoutCaption } from "@/lib/memorial/gallery/caption-layout";
import { layoutDynamicPolaroid } from "@/lib/memorial/gallery/dynamic-polaroid-layout";
import { runMobileGallery } from "@/lib/memorial/gallery/gallery-mobile-runtime";
import { a13MobileFixture } from "@/lib/memorial/gallery/a13-mobile-pilot-fixtures";

/**
 * A13 Mobile Light scene (V1.7) — render contracts only (layers, order,
 * stacking, title block, group translation, bottom continuation, CTA,
 * interaction). Pixel layout and reachability are proven in the browser
 * pilot (`/pilot/a13-mobile-gallery`), not by jsdom.
 */

vi.mock("next/font/google", () => ({
  Cormorant_Garamond: () => ({ variable: "v-cormorant", className: "" }),
  La_Belle_Aurore: () => ({ variable: "v-aurore", className: "" }),
  Playfair_Display: () => ({ variable: "v-playfair", className: "" }),
  Inter: () => ({ variable: "v-inter", className: "" }),
  EB_Garamond: () => ({ variable: "v-eb", className: "" }),
}));

const { A13MobileGalleryScene } = await import("./A13MobileGalleryScene");
const { DynamicPolaroid } = await import("./DynamicPolaroid");

afterEach(cleanup);

const fake: CaptionMeasurer = {
  measure: (t) => ({ width: t.length * 11.5, actualBoundingBoxLeft: 0, actualBoundingBoxRight: t.length * 11.5, actualBoundingBoxAscent: 20, actualBoundingBoxDescent: 8 }),
  fontAscent: 22,
  fontDescent: 8,
};
function sceneFor(n: number, captions: "courte" | "aucune" = "courte") {
  const media = a13MobileFixture(n, "mixte", captions);
  const run = runMobileGallery({ media, captionOf: (m) => m.caption, measurer: fake, stageWidth: 390 });
  expect(run.status).toBe("PASS");
  return { run, entries: run.entries.map((e) => ({ slot: e.slot, layout: e.layout, src: e.media.src, alt: e.media.alt, caption: e.caption })) };
}

describe("A13MobileGalleryScene", () => {
  it("renders the ONE common background (layer 0) and the prints only — no foreground, no other image", () => {
    const { entries } = sceneFor(6);
    const { container } = render(<A13MobileGalleryScene entries={entries} title="Souvenirs de famille" subtitle="Les instants" stageWidth={390} />);
    const imgs = [...container.querySelectorAll("img")];
    expect(imgs[0].getAttribute("src")).toBe(A13_MOBILE_BACKGROUND.src);
    expect(imgs[0].style.zIndex).toBe("0");
    expect(imgs.filter((i) => i.getAttribute("src") === A13_MOBILE_BACKGROUND.src)).toHaveLength(1);
    expect(imgs).toHaveLength(1 + 6);
    expect(container.querySelector("h2")!.textContent).toBe("Souvenirs de famille");
  });

  it("title block: a centred header box = the protected block, separator (runtime SVG, aria-hidden: two rules + the shared sprig), title, subtitle — per-viewport sizes", () => {
    for (const [W, sepW, sepH, font, blockW, blockH] of [
      [375, 92, 24, 20, 285, 104],
      [390, 96, 24, 20, 285, 106],
      [430, 108, 30, 21, 300, 115.05],
    ]) {
      const { container, unmount } = render(<A13MobileGalleryScene entries={[]} title="Souvenirs de famille" subtitle="Les instants" stageWidth={W} />);
      const header = container.querySelector<HTMLElement>("header")!;
      expect([header.style.top, header.style.width, header.style.height, header.style.zIndex]).toEqual(["0px", `${blockW}px`, `${blockH}px`, "900"]);
      const sep = header.querySelector("svg[data-a13-separator]")!;
      expect([sep.getAttribute("width"), sep.getAttribute("height"), sep.getAttribute("aria-hidden")]).toEqual([String(sepW), String(sepH), "true"]);
      const rules = [...sep.querySelectorAll(":scope > rect")];
      expect(rules.map((r) => [r.getAttribute("width"), r.getAttribute("height"), r.getAttribute("fill")])).toEqual([
        [String((26 * sepW) / 100), "1", A13_MOBILE_SEPARATOR_ART.ruleColor],
        [String((26 * sepW) / 100), "1", A13_MOBILE_SEPARATOR_ART.ruleColor],
      ]);
      expect(sep.querySelector("image")!.getAttribute("href")).toBe(A13_MOBILE_SEPARATOR_ART.sprigSrc);
      expect(header.firstElementChild).toBe(sep);
      const h2 = header.querySelector<HTMLElement>("h2")!;
      expect(h2.style.fontSize).toBe(`${font}px`);
      expect(h2.previousElementSibling).toBe(sep);
      expect(h2.nextElementSibling!.tagName).toBe("P");
      unmount();
    }
  });

  it("the stage is 941 × stageHeightSource; the ONE group container carries the state translation; below the raster, the V1.7 bottom continuation only", () => {
    const { run, entries } = sceneFor(5, "aucune");
    const { container, getByTestId } = render(
      <A13MobileGalleryScene entries={entries} title="T" subtitle="S" stageWidth={390} stageHeight={run.stageHeight} translateY={run.translateY} />,
    );
    const T = A13_MOBILE_GROUP_TRANSLATION.G5;
    expect(container.querySelector<HTMLElement>("[data-a13-mobile-canvas]")!.style.aspectRatio).toBe(`941 / ${T.stageHeightSource}`);
    const group = getByTestId("print-group");
    expect(group.style.transform).toBe(`translateY(calc(${T.translateYSource} * var(--k)))`);
    // Every print is inside the group, none is translated on its own.
    expect(group.querySelectorAll("[data-slot-id]")).toHaveLength(5);
    expect(container.querySelectorAll("[data-slot-id]")).toHaveLength(5);
    const ext = getByTestId("stage-extension");
    expect([ext.style.top, ext.style.height]).toEqual([`calc(${A13_MOBILE_BACKGROUND.height} * var(--k))`, `calc(${T.backgroundExtensionSource} * var(--k))`]);
    expect(ext.children).toHaveLength(0);
    expect(ext.dataset.continuation).toBe(A13_MOBILE_BOTTOM_CONTINUATION.baseColor);
    expect(ext.getAttribute("aria-hidden")).toBe("true");
    // G2: no translation, no extension.
    const g2 = sceneFor(2, "aucune");
    const second = render(<A13MobileGalleryScene entries={g2.entries} title="T" subtitle="S" stageWidth={390} stageHeight={g2.run.stageHeight} translateY={g2.run.translateY} />);
    expect(second.container.querySelectorAll("[data-testid=stage-extension]")).toHaveLength(0);
    expect(second.container.querySelector<HTMLElement>("[data-testid=print-group]")!.style.transform).toBe("translateY(calc(0 * var(--k)))");
  });

  it("prints in family order, each with the manifest rotation and paint order (G6: D5 in front of D6)", () => {
    const { entries } = sceneFor(6);
    const { container } = render(<A13MobileGalleryScene entries={entries} title="T" subtitle="S" stageWidth={390} />);
    const slots = [...container.querySelectorAll<HTMLElement>("[data-slot-id]")];
    expect(slots.map((s) => [s.dataset.slotId, s.dataset.mediaIndex])).toEqual(A13_MOBILE_STATE_SLOTS.G6.map((s) => [s.slotId, String(s.mediaIndex)]));
    slots.forEach((el, i) => {
      expect(el.style.zIndex).toBe(String(A13_MOBILE_STATE_SLOTS.G6[i].paintOrder));
      expect(el.style.transform).toBe(`rotate(${A13_MOBILE_STATE_SLOTS.G6[i].rotationDeg}deg)`);
    });
    const z = (id: string) => Number(slots.find((s) => s.dataset.slotId === id)!.style.zIndex);
    expect(z("G6-D5")).toBeGreaterThan(z("G6-D6"));
  });

  it("the CTA exists only when passed (Signature 7+), as a real button with the i18n label and its action, at the box resolved after the group", () => {
    const { run, entries } = sceneFor(7);
    const onSee = vi.fn();
    const { queryByTestId, rerender, getByTestId, container } = render(<A13MobileGalleryScene entries={entries} title="T" subtitle="S" stageWidth={390} />);
    expect(queryByTestId("cta-7plus")).toBeNull();
    const box = run.cta!.box;
    rerender(
      <A13MobileGalleryScene entries={entries} title="T" subtitle="S" stageWidth={390} stageHeight={run.stageHeight} translateY={run.translateY} cta={{ label: "Voir plus de souvenirs", lang: "fr", onActivate: onSee, box }} />,
    );
    const btn = getByTestId("cta-7plus");
    expect([btn.tagName, btn.getAttribute("type"), btn.getAttribute("lang"), btn.textContent]).toEqual(["BUTTON", "button", "fr", "Voir plus de souvenirs"]);
    expect(box.x).toBe(A13_MOBILE_CTA.horizontal.boxX);
    expect([btn.style.left, btn.style.top, btn.style.width, btn.style.height]).toEqual([`calc(${box.x} * var(--k))`, `calc(${box.y} * var(--k))`, `calc(${box.width} * var(--k))`, `calc(${box.height} * var(--k))`]);
    // The stage ends at the resolved height; the continuation fills it below the raster.
    expect(container.querySelector<HTMLElement>("[data-a13-mobile-canvas]")!.style.aspectRatio).toBe(`941 / ${run.stageHeight}`);
    expect(getByTestId("stage-extension").style.height).toBe(`calc(${Math.round((run.stageHeight - A13_MOBILE_BACKGROUND.height) * 1e6) / 1e6} * var(--k))`);
    // Stage frame (not in the translated group).
    expect(btn.closest("[data-testid=print-group]")).toBeNull();
    fireEvent.click(btn);
    expect(onSee).toHaveBeenCalledTimes(1);
  });

  it("every print is a control (click, Enter, Space) named by its caption, or the position label", () => {
    const { entries } = sceneFor(3);
    const onActivate = vi.fn();
    const noCaption = entries.map((e, i) => (i === 2 ? { ...e, caption: null } : e));
    const { container } = render(<A13MobileGalleryScene entries={noCaption} title="T" subtitle="S" stageWidth={390} language="fr" onActivate={onActivate} />);
    const prints = [...container.querySelectorAll<HTMLElement>("[data-print]")];
    expect(prints.map((p) => [p.getAttribute("role"), p.tabIndex])).toEqual([
      ["button", 0],
      ["button", 0],
      ["button", 0],
    ]);
    expect(prints[0].getAttribute("aria-label")).toBe(entries[0].caption!.lines.map((l) => l.text).join(" "));
    expect(prints[2].getAttribute("aria-label")).toMatch(/3/);
    fireEvent.click(prints[0]);
    fireEvent.keyDown(prints[1], { key: "Enter" });
    fireEvent.keyDown(prints[2], { key: " " });
    expect(onActivate.mock.calls.map((c) => c[0])).toEqual(["G3-D1", "G3-D2", "G3-D3"]);
  });

  it("captions are drawn at the Mobile size inside the print; Desktop prints keep no size attribute", () => {
    const { run, entries } = sceneFor(2);
    const { getByTestId, unmount } = render(<A13MobileGalleryScene entries={entries} title="T" subtitle="S" stageWidth={390} captionFontSizePx={run.metrics.captionFontPx} />);
    const text = getByTestId("caption-G2-D1").querySelector("text")!;
    expect(text.style.fontSize).toBe(`${run.metrics.captionFontPx}px`);
    unmount();
    const slot = A13_DESKTOP_G6_SLOTS[0];
    const layout = layoutDynamicPolaroid(slot, { width: 1200, height: 1600 });
    const caption = layoutCaption(slot, layout, "Maman", fake, []);
    const desk = render(<DynamicPolaroid slot={slot} layout={layout} src="/x.jpg" alt="x" caption={caption} />);
    expect(desk.getByTestId("caption-D1").querySelector("text")!.hasAttribute("style")).toBe(false);
    // Desktop prints: the band is the paper's width — never a widened band.
    expect(desk.container.querySelector("[data-band-wing]")).toBeNull();
    expect(desk.container.querySelector("figure")!.className).not.toMatch(/printWidened/);
  });

  it("a widened band (narrow print) is drawn as one T-shaped paper: wing under the window, stroke along the T outline", () => {
    const { entries } = sceneFor(2, "aucune");
    const e = entries[0];
    const extra = 40;
    const layout = { ...e.layout, band: { ...e.layout.band, x: -extra / 2, width: e.layout.outer.width + extra } };
    const { container } = render(<DynamicPolaroid slot={e.slot} layout={layout} src="/x.jpg" alt="x" caption={null} />);
    const fig = container.querySelector("figure")!;
    expect(fig.className).toMatch(/printWidened/);
    const wing = fig.querySelector<HTMLElement>("[data-band-wing]")!;
    expect(fig.firstElementChild).toBe(wing);
    expect([wing.style.left, wing.style.width]).toEqual([`calc(${-extra / 2} * var(--k))`, `calc(${e.layout.outer.width + extra} * var(--k))`]);
    expect(fig.querySelectorAll("polygon")).toHaveLength(1);
  });
});
