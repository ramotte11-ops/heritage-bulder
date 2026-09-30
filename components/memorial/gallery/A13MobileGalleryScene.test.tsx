// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { A13_MOBILE_BACKGROUND, A13_MOBILE_CTA, A13_MOBILE_STATE_SLOTS } from "@/config/gallery-a13-mobile-manifest";
import { A13_DESKTOP_G6_SLOTS } from "@/config/gallery-a13-desktop-manifest";
import type { CaptionMeasurer } from "@/lib/memorial/gallery/caption-layout";
import { layoutCaption } from "@/lib/memorial/gallery/caption-layout";
import { layoutDynamicPolaroid } from "@/lib/memorial/gallery/dynamic-polaroid-layout";
import { maskFromRects } from "@/lib/memorial/gallery/title-glyph-mask";
import { runMobileGallery } from "@/lib/memorial/gallery/gallery-mobile-runtime";
import { a13MobileFixture } from "@/lib/memorial/gallery/a13-mobile-pilot-fixtures";

/**
 * A13 Mobile Light scene — render contracts only (layers, order, stacking,
 * CTA, interaction). Pixel layout and reachability are proven in the browser
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
const MASK = maskFromRects([{ x0: 190, y0: 48, x1: 750, y1: 180 }]);

function sceneFor(n: number) {
  const media = a13MobileFixture(n, "mixte", "24");
  const run = runMobileGallery({ media, captionOf: (m) => m.caption, measurer: fake, titleMask: MASK, stageWidth: 390 });
  expect(run.status).toBe("PASS");
  return { run, entries: run.entries.map((e) => ({ slot: e.slot, layout: e.layout, src: e.media.src, alt: e.media.alt, caption: e.caption })) };
}

describe("A13MobileGalleryScene", () => {
  it("renders the ONE common background (layer 0) and the prints only — no foreground, no other image", () => {
    const { entries } = sceneFor(6);
    const { container } = render(<A13MobileGalleryScene entries={entries} title="Souvenirs de famille" subtitle="Les instants" />);
    const imgs = [...container.querySelectorAll("img")];
    expect(imgs[0].getAttribute("src")).toBe(A13_MOBILE_BACKGROUND.src);
    expect(imgs[0].style.zIndex).toBe("0");
    expect(imgs.filter((i) => i.getAttribute("src") === A13_MOBILE_BACKGROUND.src)).toHaveLength(1);
    expect(imgs).toHaveLength(1 + 6);
    expect(container.querySelector("h2")!.textContent).toBe("Souvenirs de famille");
  });

  it("prints in family order, each with the manifest rotation and paint order (G6: D5 in front of D6)", () => {
    const { entries } = sceneFor(6);
    const { container } = render(<A13MobileGalleryScene entries={entries} title="T" subtitle="S" />);
    const slots = [...container.querySelectorAll<HTMLElement>("[data-slot-id]")];
    expect(slots.map((s) => [s.dataset.slotId, s.dataset.mediaIndex])).toEqual(A13_MOBILE_STATE_SLOTS.G6.map((s) => [s.slotId, String(s.mediaIndex)]));
    slots.forEach((el, i) => {
      expect(el.style.zIndex).toBe(String(A13_MOBILE_STATE_SLOTS.G6[i].paintOrder));
      expect(el.style.transform).toBe(`rotate(${A13_MOBILE_STATE_SLOTS.G6[i].rotationDeg}deg)`);
    });
    const z = (id: string) => Number(slots.find((s) => s.dataset.slotId === id)!.style.zIndex);
    expect(z("G6-D5")).toBeGreaterThan(z("G6-D6"));
  });

  it("the CTA exists only when passed (Signature 7+), as a real button with the i18n label and its action", () => {
    const { entries } = sceneFor(7);
    const onSee = vi.fn();
    const { queryByTestId, rerender, getByTestId } = render(<A13MobileGalleryScene entries={entries} title="T" subtitle="S" />);
    expect(queryByTestId("cta-7plus")).toBeNull();
    rerender(<A13MobileGalleryScene entries={entries} title="T" subtitle="S" cta={{ label: "Voir plus de souvenirs", lang: "fr", onActivate: onSee }} />);
    const btn = getByTestId("cta-7plus");
    expect([btn.tagName, btn.getAttribute("type"), btn.getAttribute("lang"), btn.textContent]).toEqual(["BUTTON", "button", "fr", "Voir plus de souvenirs"]);
    expect(btn.style.left).toBe(`calc(${A13_MOBILE_CTA.box.x} * var(--k))`);
    expect(btn.style.top).toBe(`calc(${A13_MOBILE_CTA.box.y} * var(--k))`);
    fireEvent.click(btn);
    expect(onSee).toHaveBeenCalledTimes(1);
  });

  it("every print is a control (click, Enter, Space) named by its caption, or the position label", () => {
    const { entries } = sceneFor(3);
    const onActivate = vi.fn();
    const noCaption = entries.map((e, i) => (i === 2 ? { ...e, caption: null } : e));
    const { container } = render(<A13MobileGalleryScene entries={noCaption} title="T" subtitle="S" language="fr" onActivate={onActivate} />);
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
    const { getByTestId, unmount } = render(<A13MobileGalleryScene entries={entries} title="T" subtitle="S" captionFontSizePx={run.metrics.captionFontPx} />);
    const text = getByTestId("caption-G2-D1").querySelector("text")!;
    expect(text.style.fontSize).toBe(`${run.metrics.captionFontPx}px`);
    unmount();
    const slot = A13_DESKTOP_G6_SLOTS[0];
    const layout = layoutDynamicPolaroid(slot, { width: 1200, height: 1600 });
    const caption = layoutCaption(slot, layout, "Maman", fake, []);
    const desk = render(<DynamicPolaroid slot={slot} layout={layout} src="/x.jpg" alt="x" caption={caption} />);
    expect(desk.getByTestId("caption-D1").querySelector("text")!.hasAttribute("style")).toBe(false);
  });
});
