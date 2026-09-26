// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { A13_PILOT_BACKGROUND_SRC, A13_PILOT_SLOTS } from "@/config/gallery-a13-pilot-manifest";
import { assignMediaToSlots, layoutDynamicPolaroid } from "@/lib/memorial/gallery/dynamic-polaroid-layout";
import { A13_PILOT_MEDIA } from "@/lib/memorial/gallery/a13-pilot-fixtures";
import { layoutCaption, type CaptionMeasurer } from "@/lib/memorial/gallery/caption-layout";

const fake: CaptionMeasurer = {
  measure: (t) => ({
    width: t.length * 10,
    actualBoundingBoxLeft: 0,
    actualBoundingBoxRight: t.length * 10,
    actualBoundingBoxAscent: 18,
    actualBoundingBoxDescent: 6,
  }),
  fontAscent: 22,
  fontDescent: 8,
};

/**
 * A13 pilot scene — render contracts only (order, layers, captions).
 * Pixel layout is proven by the QG screenshot pass, not by jsdom.
 */

vi.mock("next/font/google", () => ({
  Cormorant_Garamond: () => ({ variable: "v-cormorant", className: "" }),
  La_Belle_Aurore: () => ({ variable: "v-aurore", className: "" }),
  Playfair_Display: () => ({ variable: "v-playfair", className: "" }),
  Inter: () => ({ variable: "v-inter", className: "" }),
  EB_Garamond: () => ({ variable: "v-eb", className: "" }),
}));

const { A13PilotScene } = await import("./A13PilotScene");

afterEach(cleanup);

function entries(captions: (string | null)[]) {
  return assignMediaToSlots(A13_PILOT_SLOTS, A13_PILOT_MEDIA).map(({ slot, media }, i) => {
    const layout = layoutDynamicPolaroid(slot, media!);
    const text = captions[i];
    return {
      slot,
      layout,
      src: media!.src,
      alt: `Photo ${i + 1}`,
      caption: text ? layoutCaption(slot, layout, text, fake, []) : null,
    };
  });
}

describe("A13PilotScene", () => {
  it("renders six prints in strict media[i] → D(i+1) order, with manifest z-index and rotation", () => {
    const { container } = render(<A13PilotScene entries={entries([null, null, null, null, null, null])} title="T" subtitle="S" />);
    const slots = [...container.querySelectorAll<HTMLElement>("[data-slot-id]")];
    expect(slots.map((s) => [s.dataset.slotId, s.dataset.mediaIndex])).toEqual(
      A13_PILOT_SLOTS.map((s) => [s.slotId, String(s.mediaIndex)]),
    );
    slots.forEach((el, i) => {
      expect(el.style.zIndex).toBe(String(A13_PILOT_SLOTS[i].zIndex));
      expect(el.style.transform).toBe(`rotate(${A13_PILOT_SLOTS[i].rotationDeg}deg)`);
      expect(el.querySelector("img")!.getAttribute("src")).toBe(A13_PILOT_MEDIA[i].src);
    });
  });

  it("renders the background only — no foreground layer (O1/O2 deferred)", () => {
    const { container } = render(<A13PilotScene entries={entries([null, null, null, null, null, null])} title="T" subtitle="S" />);
    const imgs = [...container.querySelectorAll("img")].map((i) => i.getAttribute("src"));
    expect(imgs.filter((s) => s === A13_PILOT_BACKGROUND_SRC)).toHaveLength(1);
    expect(imgs).toHaveLength(1 + 6);
  });

  it("keeps the bottom band when a caption is absent, and draws captions as text inside the print", () => {
    const { container, getByTestId, queryByTestId } = render(
      <A13PilotScene entries={entries(["Maman", null, null, null, null, null])} title="Titre" subtitle="Sous-titre" />,
    );
    const svg = getByTestId("caption-D1");
    expect(svg.closest("[data-print]")?.getAttribute("data-print")).toBe("D1");
    expect(svg.querySelector("text")!.textContent).toBe("Maman");
    expect(svg.getAttribute("data-status")).toBe("placed");
    expect(queryByTestId("caption-D2")).toBeNull();
    expect(container.querySelectorAll("figcaption")).toHaveLength(6);
    expect(container.querySelector("h2")!.textContent).toBe("Titre");
  });

  it("renders the 7+ CTA as a real runtime button only when the state passes one", () => {
    const { queryByTestId, rerender, getByTestId } = render(
      <A13PilotScene entries={entries([null, null, null, null, null, null])} title="T" subtitle="S" />,
    );
    expect(queryByTestId("cta-7plus")).toBeNull();
    rerender(
      <A13PilotScene
        entries={entries([null, null, null, null, null, null])}
        title="T"
        subtitle="S"
        stateId="G6_SIGNATURE_7PLUS"
        cta={{ label: "Voir plus de souvenirs", lang: "fr" }}
      />,
    );
    const btn = getByTestId("cta-7plus");
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.getAttribute("type")).toBe("button");
    expect(btn.getAttribute("lang")).toBe("fr");
    expect(btn.textContent).toBe("Voir plus de souvenirs");
  });
});
