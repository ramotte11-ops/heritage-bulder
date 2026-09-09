// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SKINS, SKIN_VARIANTS } from "@/config/skins";
import { SKIN_SCOPE_ATTRIBUTE, SKIN_VARIANT_SCOPE_ATTRIBUTE } from "@/lib/memorial/skin-runtime";
import { SkinScope } from "./SkinScope";

/**
 * Mission 029 — proof that ONE renderer can receive multiple skin ids
 * without being duplicated (mission brief section 16/19): the exact
 * same children markup, rendered under each of the 4 V1 skins in turn,
 * comes back with identical content and only the scope attribute
 * changing.
 *
 * Mission 029B extends this to the independent SkinVariant dimension:
 * the same renderer must work identically under all 4 skins × 2
 * variants = 8 combinations, with both scope attributes set and nothing
 * else varying.
 */

afterEach(cleanup);

const MARKER = "same-renderer-marker";

function SameRenderer() {
  // Stands in for the future real memorial renderer. Deliberately
  // generic — not a Hero, not any culturally-flavored content (mission
  // brief section 15: no fake Hero/mémorial invented for this mission).
  return <p>{MARKER}</p>;
}

describe("SkinScope — one component, all 4 skins × 2 variants = 8 combinations", () => {
  for (const skin of SKINS) {
    for (const variant of SKIN_VARIANTS) {
      it(`scopes the SAME renderer under "${skin}" + "${variant}" without forking it`, () => {
        const { container } = render(
          <SkinScope skin={skin} skinVariant={variant}>
            <SameRenderer />
          </SkinScope>,
        );

        expect(screen.getByText(MARKER)).toBeTruthy();
        expect(container.firstElementChild?.getAttribute(SKIN_SCOPE_ATTRIBUTE)).toBe(skin);
        expect(container.firstElementChild?.getAttribute(SKIN_VARIANT_SCOPE_ATTRIBUTE)).toBe(
          variant,
        );
      });
    }
  }

  it("changes only the scope attributes across skins/variants — the rendered content is identical", () => {
    const renders = SKINS.flatMap((skin) =>
      SKIN_VARIANTS.map((variant) => {
        const { container, unmount } = render(
          <SkinScope skin={skin} skinVariant={variant}>
            <SameRenderer />
          </SkinScope>,
        );
        const html = container.innerHTML
          .replace(skin, "SKIN_PLACEHOLDER")
          .replace(variant, "VARIANT_PLACEHOLDER");
        unmount();
        return html;
      }),
    );

    // Every skin/variant pair produces the same markup once its own
    // names are substituted out — proof the wrapper never branches on
    // which skin or variant it was given beyond the two attribute
    // values.
    expect(new Set(renders).size).toBe(1);
  });

  it("never introduces a second wrapper or duplicated structure per skin/variant", () => {
    const { container } = render(
      <SkinScope skin="hindou" skinVariant="dark">
        <SameRenderer />
      </SkinScope>,
    );
    // Exactly one scope element (the SkinScope div) plus the renderer's
    // own single <p> — no per-skin/variant nesting.
    expect(container.querySelectorAll("div").length).toBe(1);
    expect(container.querySelectorAll("p").length).toBe(1);
  });
});
