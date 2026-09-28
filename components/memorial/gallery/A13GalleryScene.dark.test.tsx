// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { A13_DESKTOP_BACKGROUND_SRC, A13_DESKTOP_G6_SLOTS } from "@/config/gallery-a13-desktop-manifest";
import { A13_DARK_BACKGROUND } from "@/config/gallery-a13-dark-material";
import { assignMediaToSlots, layoutDynamicPolaroid } from "@/lib/memorial/gallery/dynamic-polaroid-layout";
import { A13_PILOT_MEDIA } from "@/lib/memorial/gallery/a13-pilot-fixtures";
import { layoutCaption, type CaptionMeasurer } from "@/lib/memorial/gallery/caption-layout";

const fake: CaptionMeasurer = {
  measure: (t) => ({ width: t.length * 10, actualBoundingBoxLeft: 0, actualBoundingBoxRight: t.length * 10, actualBoundingBoxAscent: 18, actualBoundingBoxDescent: 6 }),
  fontAscent: 22,
  fontDescent: 8,
};

/**
 * A13 Desktop Dark V1.1 — the theme is material only: the same entries
 * rendered Light and Dark give the same DOM once the three material
 * markers are removed (background source, `data-a13-theme`, the print's
 * `--a13-dark-*` custom properties). Light renders exactly as before.
 */

vi.mock("next/font/google", () => ({
  Cormorant_Garamond: () => ({ variable: "v-cormorant", className: "" }),
  La_Belle_Aurore: () => ({ variable: "v-aurore", className: "" }),
  Playfair_Display: () => ({ variable: "v-playfair", className: "" }),
  Inter: () => ({ variable: "v-inter", className: "" }),
  EB_Garamond: () => ({ variable: "v-eb", className: "" }),
}));

const { A13GalleryScene } = await import("./A13GalleryScene");

afterEach(cleanup);

const entries = assignMediaToSlots(A13_DESKTOP_G6_SLOTS, A13_PILOT_MEDIA).map(({ slot, media }, i) => {
  const layout = layoutDynamicPolaroid(slot, media!);
  return { slot, layout, src: media!.src, alt: `Photo ${i + 1}`, caption: i % 2 ? layoutCaption(slot, layout, "Maman, un soir à Gordes.", fake, []) : null };
});

/** Removes the three material markers from a rendered Dark scene. */
function stripMaterial(root: HTMLElement) {
  root.querySelector("[data-a13-theme]")?.removeAttribute("data-a13-theme");
  const bg = root.querySelector("img")!;
  if (bg.getAttribute("src") === A13_DARK_BACKGROUND.src) bg.setAttribute("src", A13_DESKTOP_BACKGROUND_SRC);
  for (const p of root.querySelectorAll<HTMLElement>("[data-print]")) for (const k of ["--a13-dark-paper", "--a13-dark-grain", "--a13-dark-sheen"]) p.style.removeProperty(k);
  return root.innerHTML;
}

function scene(theme: "light" | "dark" | undefined, interactive: boolean, cta: boolean) {
  return (
    <A13GalleryScene
      entries={entries}
      title="Souvenirs de famille"
      subtitle="Les instants que nous gardons près de nous"
      stateId={cta ? "G6_SIGNATURE_7PLUS" : "G6"}
      {...(theme ? { theme } : {})}
      cta={cta ? { label: "Voir plus de souvenirs", lang: "fr" } : null}
      language="fr"
      {...(interactive ? { onActivate: () => {} } : {})}
    />
  );
}

describe("A13GalleryScene — Dark V1.1 material only", () => {
  it("Light (default) is unchanged: no theme marker, Light background, no Dark custom property", () => {
    const { container } = render(scene(undefined, true, true));
    const html = container.innerHTML;
    expect(html).not.toContain("data-a13-theme");
    expect(html).not.toContain("--a13-dark-");
    expect(container.querySelector("img")!.getAttribute("src")).toBe(A13_DESKTOP_BACKGROUND_SRC);
    const explicit = render(scene("light", true, true)).container.innerHTML;
    expect(explicit).toBe(html);
  });

  for (const [interactive, cta] of [
    [false, false],
    [true, false],
    [false, true],
  ] as const) {
    it(`Dark = Light DOM minus material markers (interactive ${interactive}, CTA ${cta})`, () => {
      const light = render(scene("light", interactive, cta)).container.innerHTML;
      cleanup();
      const { container } = render(scene("dark", interactive, cta));
      const dark = container.innerHTML;
      expect(dark).not.toBe(light);
      expect(container.querySelector("[data-testid=a13-pilot-scene]")!.getAttribute("data-a13-theme")).toBe("dark");
      expect(container.querySelector("img")!.getAttribute("src")).toBe(A13_DARK_BACKGROUND.src);
      expect(stripMaterial(container)).toBe(light);
    });
  }

  it("Dark prints carry only colour/image custom properties; photos carry no style beyond their Light box", () => {
    const { container } = render(scene("dark", true, false));
    const prints = [...container.querySelectorAll<HTMLElement>("[data-print]")];
    expect(prints).toHaveLength(6);
    for (const p of prints) {
      const custom = [...Array(p.style.length)].map((_, i) => p.style[i]).filter((k) => k.startsWith("--"));
      expect(custom.sort()).toEqual(["--a13-dark-grain", "--a13-dark-paper", "--a13-dark-sheen"]);
      expect(p.style.getPropertyValue("--a13-dark-paper")).toMatch(/^#[0-9A-F]{6}$/);
      const img = p.querySelector("img")!;
      expect(Object.keys(img.style).filter((k) => /^\d+$/.test(k)).map((k) => img.style[Number(k)]).sort()).toEqual(["height", "left", "top", "width"]);
    }
  });

  it("G6 exact has no CTA; Signature 7+ has the same runtime button in Dark", () => {
    expect(render(scene("dark", false, false)).queryByTestId("cta-7plus")).toBeNull();
    cleanup();
    const btn = render(scene("dark", false, true)).getByTestId("cta-7plus");
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.textContent).toBe("Voir plus de souvenirs");
  });
});
