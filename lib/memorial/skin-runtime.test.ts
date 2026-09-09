import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SKINS, SKIN_VARIANTS } from "@/config/skins";
import {
  SKIN_SCOPE_ATTRIBUTE,
  SKIN_VARIANT_SCOPE_ATTRIBUTE,
  resolveSkinRuntime,
  resolveSkinVariantRuntime,
  skinScopeAttributes,
} from "./skin-runtime";

/**
 * Mission 029 — contract tests for the memorial skin runtime.
 * Mission 029B — extended with the independent SkinVariant dimension.
 *
 * These test the CONTRACT (resolution outcomes, the fail-safe strategy,
 * independence from `offer_id`/Etsy/language/tradition/prefers-color-scheme),
 * never a snapshot of any visual output — no skin or variant has a real
 * design yet (mission brief section 12/14/19).
 */

const source = readFileSync(path.join(import.meta.dirname, "skin-runtime.ts"), "utf8");

/**
 * The boundary checks below assert on actual CODE (imports, branches,
 * identifiers) — not on the module's own prose docstrings, which
 * legitimately discuss Etsy/offer_id/language/tradition/section/
 * prefers-color-scheme BY NAME precisely to document that none of them
 * are depended on. Stripping `/** ... *\/` blocks first is what keeps
 * those checks honest instead of failing on the documentation that
 * explains them.
 */
function stripBlockComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, "");
}

const code = stripBlockComments(source);

describe("resolveSkinRuntime — the 4 V1 skins", () => {
  for (const skin of SKINS) {
    it(`resolves "${skin}" to a valid skin runtime`, () => {
      expect(resolveSkinRuntime(skin)).toEqual({ status: "resolved", skin });
    });
  }

  it("resolves every skin from config/skins.ts's own list — no second hardcoded list", () => {
    // If this module restated the four ids itself, adding/removing one
    // from config/skins.ts would silently desync from what actually
    // resolves. Asserting against SKINS itself (not a literal array
    // copied into this test) is what catches that.
    expect(SKINS).toEqual(["intemporel", "musulman", "juif", "hindou"]);
    for (const skin of SKINS) {
      expect(resolveSkinRuntime(skin).status).toBe("resolved");
    }
  });
});

describe("resolveSkinRuntime — invalid or missing skin_id (fail-safe, mission brief section 12)", () => {
  const retiredOrUnknownIds = ["occidental", "arabe", "maghreb", "africain", "indien", "not-a-skin"];

  for (const badId of retiredOrUnknownIds) {
    it(`never converts an unrecognized id ("${badId}") to "intemporel"`, () => {
      const result = resolveSkinRuntime(badId);
      expect(result).toEqual({ status: "invalid", received: badId });
      expect(result).not.toEqual({ status: "resolved", skin: "intemporel" });
    });
  }

  it.each([undefined, null, "", 42, {}, []])(
    "treats a missing/malformed skin_id (%j) as explicitly invalid, never as intemporel",
    (missing) => {
      const result = resolveSkinRuntime(missing);
      expect(result.status).toBe("invalid");
      expect(result).not.toEqual({ status: "resolved", skin: "intemporel" });
      if (result.status === "invalid") {
        expect(result.received).toBe(missing);
      }
    },
  );

  it("is case-sensitive — never coerces close-but-wrong casing to a real skin", () => {
    expect(resolveSkinRuntime("Musulman").status).toBe("invalid");
    expect(resolveSkinRuntime("INTEMPOREL").status).toBe("invalid");
  });
});

// ---------------------------------------------------------------------
// Mission 029B — resolveSkinVariantRuntime
// ---------------------------------------------------------------------

describe("resolveSkinVariantRuntime — the 2 V1 variants", () => {
  for (const variant of SKIN_VARIANTS) {
    it(`resolves "${variant}" to a valid variant runtime`, () => {
      expect(resolveSkinVariantRuntime(variant)).toEqual({ status: "resolved", variant });
    });
  }

  it("resolves every variant from config/skins.ts's own list — no second hardcoded list", () => {
    expect(SKIN_VARIANTS).toEqual(["light", "dark"]);
    for (const variant of SKIN_VARIANTS) {
      expect(resolveSkinVariantRuntime(variant).status).toBe("resolved");
    }
  });
});

describe("resolveSkinVariantRuntime — invalid or missing skin_variant (fail-safe, mission brief section 10)", () => {
  const unknownVariants = ["sepia", "bright", "system", "auto", "not-a-variant"];

  for (const bad of unknownVariants) {
    it(`never converts an unrecognized variant ("${bad}") to "light"`, () => {
      const result = resolveSkinVariantRuntime(bad);
      expect(result).toEqual({ status: "invalid", received: bad });
      expect(result).not.toEqual({ status: "resolved", variant: "light" });
    });
  }

  it.each([undefined, null, "", 42, {}, []])(
    "treats a missing/malformed skin_variant (%j) as explicitly invalid, never as light",
    (missing) => {
      const result = resolveSkinVariantRuntime(missing);
      expect(result.status).toBe("invalid");
      expect(result).not.toEqual({ status: "resolved", variant: "light" });
      if (result.status === "invalid") {
        expect(result.received).toBe(missing);
      }
    },
  );

  it("is case-sensitive — never coerces close-but-wrong casing to a real variant", () => {
    expect(resolveSkinVariantRuntime("Light").status).toBe("invalid");
    expect(resolveSkinVariantRuntime("DARK").status).toBe("invalid");
  });
});

describe("skinScopeAttributes — all 4 skins × 2 variants = 8 valid combinations", () => {
  for (const skin of SKINS) {
    for (const variant of SKIN_VARIANTS) {
      it(`produces both attributes for ${skin} + ${variant}`, () => {
        expect(skinScopeAttributes(skin, variant)).toEqual({
          [SKIN_SCOPE_ATTRIBUTE]: skin,
          [SKIN_VARIANT_SCOPE_ATTRIBUTE]: variant,
        });
      });
    }
  }

  it("uses the two documented, HERITAGE-namespaced attribute names", () => {
    expect(SKIN_SCOPE_ATTRIBUTE).toBe("data-heritage-skin");
    expect(SKIN_VARIANT_SCOPE_ATTRIBUTE).toBe("data-heritage-skin-variant");
  });

  it("only accepts an already-resolved Skin AND SkinVariant — an invalid resolution of either cannot be turned into a scope value", () => {
    const resolvedSkin = resolveSkinRuntime("juif");
    const resolvedVariant = resolveSkinVariantRuntime("dark");
    expect(resolvedSkin.status).toBe("resolved");
    expect(resolvedVariant.status).toBe("resolved");
    if (resolvedSkin.status === "resolved" && resolvedVariant.status === "resolved") {
      expect(skinScopeAttributes(resolvedSkin.skin, resolvedVariant.variant)).toEqual({
        [SKIN_SCOPE_ATTRIBUTE]: "juif",
        [SKIN_VARIANT_SCOPE_ATTRIBUTE]: "dark",
      });
    }
    // No equivalent call is possible for an "invalid" resolution of
    // either dimension: there is no overload accepting a
    // SkinRuntimeResolution/SkinVariantRuntimeResolution/unknown. That is
    // a compile-time guarantee, not just a runtime one — see the module
    // docstring.
  });
});

describe("skin runtime — architectural boundaries (mission brief sections 3, 7, 8, 18, 22)", () => {
  it("imports nothing but config/skins.ts — no offer_id, no Etsy, no language, no section", () => {
    const importLines = code
      .split("\n")
      .filter((line) => line.trim().startsWith("import"));

    expect(importLines.length).toBeGreaterThan(0);
    for (const line of importLines) {
      expect(line).toMatch(/@\/config\/skins/);
    }
  });

  it("never references offer_id, Etsy, or any sales-channel concept in actual code", () => {
    expect(code).not.toMatch(/offer_?id/i);
    expect(code).not.toMatch(/etsy/i);
    expect(code).not.toMatch(/entitlement/i);
    expect(code).not.toMatch(/listing/i);
    expect(code).not.toMatch(/oauth/i);
  });

  it("never references language or editorial context in actual code — a skin changes neither", () => {
    expect(code).not.toMatch(/language/i);
    expect(code).not.toMatch(/editorialContext/i);
  });

  it("never references a tradition, religion, or section in actual code — a skin activates nothing", () => {
    expect(code).not.toMatch(/tradition/i);
    expect(code).not.toMatch(/religio/i);
    expect(code).not.toMatch(/section/i);
    expect(code).not.toMatch(/priere|pray/i);
  });

  it("does not treat intemporel as the implicit fallback (no bare default/fallback branch naming it in actual code)", () => {
    // "intemporel" appears only inside prose docstrings discussing the 4
    // sibling skins together (stripped out of `code` above) — never as a
    // standalone default value a missing/invalid id falls through to.
    // The real guarantee is structural (see the "never converts ... to
    // intemporel" tests above); this is a lightweight source-level
    // second check that no `?? "intemporel"` / `|| "intemporel"` style
    // fallback, nor any bare reference, was added to the executable code.
    expect(code).not.toMatch(/intemporel/i);
  });

  // Mission 029B — sections 3/10.
  it('does not treat "light" as the implicit fallback (no bare default/fallback branch naming it in actual code)', () => {
    expect(code).not.toMatch(/\?\?\s*["']light["']/);
    expect(code).not.toMatch(/\|\|\s*["']light["']/);
  });

  it("never reads prefers-color-scheme, matchMedia, or any device/browser theme setting", () => {
    expect(code).not.toMatch(/prefers-color-scheme/i);
    expect(code).not.toMatch(/matchMedia/i);
    expect(code).not.toMatch(/\bwindow\./);
    expect(code).not.toMatch(/\bdocument\./);
  });
});
