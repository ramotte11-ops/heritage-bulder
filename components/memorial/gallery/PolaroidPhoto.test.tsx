// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { PolaroidPhoto } from "./PolaroidPhoto";

/** Optimisation photographique V1 — a print's photograph is shown only whole. */

afterEach(cleanup);

const style = { left: "1px", top: "2px", width: "30px", height: "40px" };

describe("PolaroidPhoto", () => {
  it("hidden while loading, revealed once fully loaded — the box never changes", async () => {
    const { container } = render(<PolaroidPhoto src="/p.webp" alt="Souvenir" style={style} />);
    const img = container.querySelector("img")!;
    expect(img.dataset.photoState).toBe("loading");
    fireEvent.load(img);
    await waitFor(() => expect(img.dataset.photoState).toBe("revealed"));
    expect([img.style.left, img.style.top, img.style.width, img.style.height]).toEqual(["1px", "2px", "30px", "40px"]);
    expect(img.alt).toBe("Souvenir");
  });

  it("a failed load (expired URL, network) stays hidden: never a broken-image icon", () => {
    const { container } = render(<PolaroidPhoto src="/expired.webp" alt="" style={style} />);
    const img = container.querySelector("img")!;
    fireEvent.error(img);
    expect(img.dataset.photoState).toBe("error");
  });

  it("an image already decoded at mount (cache) is shown at once, without a fade", () => {
    const complete = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "complete");
    const natural = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "naturalWidth");
    Object.defineProperty(HTMLImageElement.prototype, "complete", { configurable: true, get: () => true });
    Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", { configurable: true, get: () => 1600 });
    try {
      const { container } = render(<PolaroidPhoto src="/cached.webp" alt="" style={style} />);
      expect(container.querySelector("img")!.dataset.photoState).toBe("ready");
    } finally {
      if (complete) Object.defineProperty(HTMLImageElement.prototype, "complete", complete);
      if (natural) Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", natural);
    }
  });

  it("the stylesheet hides only by visibility (no geometry) and skips the fade under reduced motion", () => {
    const css = readFileSync(path.join(process.cwd(), "components/memorial/gallery/DynamicPolaroid.module.css"), "utf8");
    const hidden = /\.photo\[data-photo-state="loading"\],\s*\.photo\[data-photo-state="error"\]\s*\{([^}]*)\}/.exec(css)![1];
    expect(hidden.trim()).toBe("visibility: hidden;");
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*\.photo\[data-photo-state="revealed"\]\s*\{\s*animation: none;/);
  });
});
