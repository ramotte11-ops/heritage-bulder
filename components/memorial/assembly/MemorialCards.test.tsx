// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { MemorialCards, POINTER_MIN_HEIGHT, TOUCH_MIN_HEIGHT } from "./MemorialCards";

/**
 * Cartes mémorielles V2.1 — the engine's own contract: when it runs, what it
 * measures, how much of each card the next one covers, and the keyboard
 * guard. jsdom has no layout, so heights and positions are stubbed per card;
 * the visual result itself is checked on the real runtime (Playwright).
 */

type Media = { reduce: boolean; coarse: boolean };
let media: Media;
let heights: Record<string, number>;
let tops: Record<string, number>;
let frames: FrameRequestCallback[];
let buttonRect: { top: number; bottom: number };

class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function installMatchMedia() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query.includes("reduced-motion") ? media.reduce : query.includes("coarse") ? media.coarse : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

function setViewportHeight(h: number) {
  Object.defineProperty(window, "innerHeight", { configurable: true, writable: true, value: h });
}

function flushFrames() {
  const pending = frames;
  frames = [];
  for (const cb of pending) cb(0);
}

function deck(container: HTMLElement) {
  return container.querySelector("[data-memorial-cards]") as HTMLElement;
}

function card(container: HTMLElement, id: string) {
  return container.querySelector(`[data-memorial-section="${id}"]`) as HTMLElement;
}

function renderCards(ids = ["hero", "deathNotice", "story"]) {
  return render(
    <MemorialCards>
      {ids.map((id) => (
        <div key={id} data-memorial-section={id}>
          <button type="button">{id}</button>
        </div>
      ))}
    </MemorialCards>,
  );
}

beforeEach(() => {
  media = { reduce: false, coarse: false };
  heights = { hero: 700, deathNotice: 1000, story: 600 };
  tops = {};
  frames = [];
  buttonRect = { top: 0, bottom: 40 };
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    frames.push(cb);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  installMatchMedia();
  setViewportHeight(800);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
    return heights[this.getAttribute("data-memorial-section") ?? ""] ?? 0;
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.tagName === "BUTTON") return { ...buttonRect, left: 0, right: 100, width: 100, height: buttonRect.bottom - buttonRect.top, x: 0, y: buttonRect.top, toJSON: () => ({}) } as DOMRect;
    const id = this.getAttribute("data-memorial-section") ?? "";
    const top = tops[id] ?? 10_000;
    return { top, bottom: top + (heights[id] ?? 0), left: 0, right: 390, width: 390, height: heights[id] ?? 0, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, "matchMedia");
});

describe("MemorialCards — server render and inert environments", () => {
  it("renders the deck off and leaves the neutral blocks untouched until the engine runs", () => {
    Reflect.deleteProperty(window, "matchMedia");
    const { container } = renderCards();
    expect(deck(container).getAttribute("data-deck")).toBe("off");
    for (const block of Array.from(deck(container).children)) {
      expect(block.getAttribute("class")).toBeNull();
      expect(block.getAttribute("style")).toBeNull();
    }
  });

  it("children stay in their order, as direct children of the deck", () => {
    const { container } = renderCards(["hero", "story", "gallery"]);
    expect(Array.from(deck(container).children).map((el) => el.getAttribute("data-memorial-section"))).toEqual([
      "hero",
      "story",
      "gallery",
    ]);
  });
});

describe("MemorialCards — activation (V2.1 thresholds)", () => {
  it.each([
    ["mouse, ordinary desktop window", false, 900, "on"],
    ["mouse, low desktop window (the V2 desktop anomaly)", false, 540, "on"],
    ["mouse, exactly the pointer threshold", false, POINTER_MIN_HEIGHT, "on"],
    ["mouse, below the pointer threshold", false, POINTER_MIN_HEIGHT - 1, "off"],
    ["touch, phone in portrait", true, 844, "on"],
    ["touch, exactly the touch threshold", true, TOUCH_MIN_HEIGHT, "on"],
    ["touch, phone in landscape", true, 390, "off"],
  ] as const)("%s → %s", (_label, coarse, height, expected) => {
    media.coarse = coarse;
    setViewportHeight(height);
    const { container } = renderCards();
    expect(deck(container).getAttribute("data-deck")).toBe(expected);
  });

  it("prefers-reduced-motion: the effect is off (static cards)", () => {
    media.reduce = true;
    const { container } = renderCards();
    expect(deck(container).getAttribute("data-deck")).toBe("off");
  });
});

describe("MemorialCards — measurement: no card is ever truncated", () => {
  it("a card taller than the screen pins by its bottom; a shorter one by its top", () => {
    const { container } = renderCards();
    // deathNotice 1000 px on an 800 px screen: pinned at −200 px, the visible zone starts 200 px into it.
    expect(card(container, "deathNotice").style.getPropertyValue("--pin")).toBe("-200px");
    expect(card(container, "deathNotice").style.getPropertyValue("--clip")).toBe("200px");
    expect(card(container, "deathNotice").style.getPropertyValue("--oy")).toBe("600px");
    // story 600 px: pinned at the top, nothing above the visible zone.
    expect(card(container, "story").style.getPropertyValue("--pin")).toBe("0px");
    expect(card(container, "story").style.getPropertyValue("--clip")).toBe("0px");
    expect(card(container, "story").style.getPropertyValue("--oy")).toBe("400px");
  });

  it("in the Builder Preview, the sticky « Revenir à la création » bar is accounted for", () => {
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
      if (this.hasAttribute("data-bar")) return 42;
      return heights[this.getAttribute("data-memorial-section") ?? ""] ?? 0;
    });
    const { container } = render(
      <main data-memorial-preview="">
        <div data-bar="" style={{ position: "sticky" }} />
        <MemorialCards>
          <div data-memorial-section="deathNotice" />
          <div data-memorial-section="story" />
        </MemorialCards>
      </main>,
    );
    // 42 + min(0, 800 − 42 − 1000) = −200 ; visible zone starts 242 px into the card.
    expect(card(container, "deathNotice").style.getPropertyValue("--pin")).toBe("-200px");
    expect(card(container, "deathNotice").style.getPropertyValue("--clip")).toBe("242px");
    expect(card(container, "story").style.getPropertyValue("--pin")).toBe("42px");
  });
});

describe("MemorialCards — progressive covering", () => {
  it("--p is the share of the screen the next card already covers; covered state follows", () => {
    const { container } = renderCards();
    tops = { hero: 0, deathNotice: 400, story: 800 };
    window.dispatchEvent(new Event("scroll"));
    flushFrames();
    expect(card(container, "hero").style.getPropertyValue("--p")).toBe("0.5000");
    expect(card(container, "hero").dataset.covered).toBe("partial");
    expect(card(container, "deathNotice").style.getPropertyValue("--p")).toBe("0.0000");
    expect(card(container, "deathNotice").dataset.covered).toBeUndefined();
    expect(card(container, "story").style.getPropertyValue("--p")).toBe("0.0000");

    tops = { hero: 0, deathNotice: 0, story: 0 };
    window.dispatchEvent(new Event("scroll"));
    flushFrames();
    expect(card(container, "deathNotice").dataset.covered).toBe("full");
    // Covered by a card that is itself covered: nothing left to paint.
    expect(card(container, "hero").dataset.covered).toBe("buried");
  });

  it("one frame per burst of scroll events, never a forced scroll", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    renderCards();
    flushFrames();
    for (let i = 0; i < 5; i++) window.dispatchEvent(new Event("scroll"));
    expect(frames).toHaveLength(1);
    flushFrames();
    expect(scrollTo).not.toHaveBeenCalled();
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("effect off: nothing is ever covered", () => {
    media.reduce = true;
    const { container } = renderCards();
    tops = { hero: 0, deathNotice: 0, story: 0 };
    window.dispatchEvent(new Event("scroll"));
    flushFrames();
    for (const id of ["hero", "deathNotice", "story"]) {
      expect(card(container, id).style.getPropertyValue("--p")).toBe("0.0000");
      expect(card(container, id).dataset.covered).toBeUndefined();
    }
  });
});

describe("MemorialCards — keyboard", () => {
  it("a focused control hidden under the next card is brought back into view", () => {
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    const { container } = renderCards();
    const button = card(container, "hero").querySelector("button") as HTMLButtonElement;
    buttonRect = { top: 600, bottom: 640 };
    tops = { hero: 0, deathNotice: 500, story: 900 };
    button.focus();
    // 640 − 500 = 140 px under the Avis card, plus the 24 px margin.
    expect(scrollBy).toHaveBeenCalledWith({ left: 0, top: -164, behavior: "instant" });
  });

  it("a focused control already in view is left alone", () => {
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    const { container } = renderCards();
    const button = card(container, "hero").querySelector("button") as HTMLButtonElement;
    buttonRect = { top: 100, bottom: 140 };
    tops = { hero: 0, deathNotice: 700, story: 1700 };
    button.focus();
    expect(scrollBy).not.toHaveBeenCalled();
  });
});

describe("MemorialCards — lifecycle", () => {
  it("unmounting removes every listener it added", () => {
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderCards();
    unmount();
    const removed = remove.mock.calls.map(([type]) => type);
    expect(removed).toEqual(expect.arrayContaining(["resize", "scroll"]));
  });
});
