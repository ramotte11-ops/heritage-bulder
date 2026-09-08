// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SKINS } from "@/config/skins";
import { SKIN_SCOPE_ATTRIBUTE } from "@/lib/memorial/skin-runtime";
import { SkinScope } from "./SkinScope";

/**
 * Mission 029 — proof that ONE renderer can receive multiple skin ids
 * without being duplicated (mission brief section 16/19): the exact
 * same children markup, rendered under each of the 4 V1 skins in turn,
 * comes back with identical content and only the scope attribute
 * changing.
 */

afterEach(cleanup);

const MARKER = "same-renderer-marker";

function SameRenderer() {
  // Stands in for the future real memorial renderer. Deliberately
  // generic — not a Hero, not any culturally-flavored content (mission
  // brief section 15: no fake Hero/mémorial invented for this mission).
  return <p>{MARKER}</p>;
}

describe("SkinScope — one component, every V1 skin", () => {
  for (const skin of SKINS) {
    it(`scopes the SAME renderer under "${skin}" without forking it`, () => {
      const { container } = render(
        <SkinScope skin={skin}>
          <SameRenderer />
        </SkinScope>,
      );

      expect(screen.getByText(MARKER)).toBeTruthy();
      expect(container.firstElementChild?.getAttribute(SKIN_SCOPE_ATTRIBUTE)).toBe(skin);
    });
  }

  it("changes only the scope attribute across skins — the rendered content is identical", () => {
    const renders = SKINS.map((skin) => {
      const { container, unmount } = render(
        <SkinScope skin={skin}>
          <SameRenderer />
        </SkinScope>,
      );
      const html = container.innerHTML.replace(skin, "SKIN_PLACEHOLDER");
      unmount();
      return html;
    });

    // Every skin produces the same markup once its own name is
    // substituted out — proof the wrapper never branches on which skin
    // it was given beyond the one attribute value.
    expect(new Set(renders).size).toBe(1);
  });

  it("never introduces a second wrapper or duplicated structure per skin", () => {
    const { container } = render(
      <SkinScope skin="hindou">
        <SameRenderer />
      </SkinScope>,
    );
    // Exactly one scope element (the SkinScope div) plus the renderer's
    // own single <p> — no per-skin nesting.
    expect(container.querySelectorAll("div").length).toBe(1);
    expect(container.querySelectorAll("p").length).toBe(1);
  });
});
