import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Mission 028 — HERITAGE design tokens foundation.
 *
 * These are the "real guarantee" checks the mission brief (section 17)
 * asks for: the foundation exists, the essential tokens are present,
 * the Builder background asset paths survived the migration untouched,
 * and nothing in this mission opened a client-facing way to change any
 * of it. Deliberately NOT a CSS snapshot test — that would couple this
 * suite to every future value tweak without proving anything section 2
 * (no client customization) or section 3 (preserve current rendering)
 * actually cares about.
 */

const root = path.resolve(import.meta.dirname, "..", "..");
const primitives = readFileSync(path.join(import.meta.dirname, "primitives.css"), "utf8");
const semantic = readFileSync(path.join(import.meta.dirname, "semantic.css"), "utf8");
const globals = readFileSync(path.join(root, "styles", "globals.css"), "utf8");

describe("HERITAGE design tokens foundation", () => {
  it("is wired into the app's global stylesheet", () => {
    expect(globals).toContain("./tokens/semantic.css");
  });

  it("layers semantic tokens on top of primitives (semantic.css imports primitives.css)", () => {
    expect(semantic).toContain("./primitives.css");
  });

  it("defines the validated Builder palette (mission brief section 5) as primitives", () => {
    const validatedPalette = {
      "texte principal": "#2b2b28",
      "texte secondaire": "#6f6b63",
      "surface carte": "#ffffff",
      "bordure douce": "#e0d9cc",
      "fond sélectionné": "#f2ede2",
      "bord sélectionné": "#b7a98a",
      "accent/action olive": "#3e4a34",
      désactivé: "#d7d2c7",
      "rail/progression": "#e6e0d6",
    };

    for (const value of Object.values(validatedPalette)) {
      expect(primitives.toLowerCase()).toContain(value);
    }
  });

  it("confirms the HERITAGE olive accent is exactly #3e4a34, never a different green", () => {
    expect(primitives).toMatch(/--heritage-color-olive-700:\s*#3e4a34;/);
    expect(semantic).toMatch(/--heritage-accent-primary:\s*var\(--heritage-color-olive-700\)/);
  });

  it("exposes the essential semantic tokens components are meant to consume", () => {
    const essentialSemanticTokens = [
      "--heritage-text-primary",
      "--heritage-text-secondary",
      "--heritage-surface-page",
      "--heritage-surface-card",
      "--heritage-border-soft",
      "--heritage-border-selected",
      "--heritage-surface-selected",
      "--heritage-accent-primary",
      "--heritage-state-disabled-surface",
      "--heritage-state-disabled-text",
      "--heritage-progress-track",
      "--heritage-font-family-serif",
      "--heritage-font-family-sans",
    ];

    for (const token of essentialSemanticTokens) {
      expect(semantic).toContain(`${token}:`);
    }
  });

  it("prepares radius, shadow and motion primitives without inventing new visible shadows", () => {
    expect(primitives).toContain("--heritage-radius-control:");
    expect(primitives).toContain("--heritage-radius-pill:");
    expect(primitives).toContain("--heritage-shadow-paper:");
    expect(primitives).toContain("--heritage-shadow-elevated:");
    expect(primitives).toContain("--heritage-motion-fast:");
    expect(primitives).toContain("--heritage-motion-normal:");
    expect(primitives).toContain("--heritage-easing-standard:");

    // The two shadow primitives are foundation only (mission brief
    // section 9: "ne pas renforcer les ombres existantes") — nothing in
    // the Builder tree may reference them yet.
    const builderCssFiles = [
      "BuilderScreen.module.css",
      "ChoiceCard.module.css",
      "ContextStep.module.css",
      "LanguageStep.module.css",
      "PrimaryButton.module.css",
      "ProgressBar.module.css",
    ].map((file) => readFileSync(path.join(root, "components", "builder", file), "utf8"));
    const previewCss = readFileSync(
      path.join(root, "components", "builder", "preview", "BuilderPreviewLayout.module.css"),
      "utf8",
    );

    for (const css of [...builderCssFiles, previewCss]) {
      expect(css).not.toContain("--heritage-shadow-");
    }
  });

  it("does not expose any client-facing control to change tokens (mission brief section 2)", () => {
    const forbiddenPatterns = [/color.?picker/i, /font.?selector/i, /theme.?editor/i];
    for (const pattern of forbiddenPatterns) {
      expect(primitives).not.toMatch(pattern);
      expect(semantic).not.toMatch(pattern);
    }
  });

  it("preserves the validated Builder background asset paths untouched (mission brief section 10)", () => {
    const builderScreenCss = readFileSync(
      path.join(root, "components", "builder", "BuilderScreen.module.css"),
      "utf8",
    );
    expect(builderScreenCss).toContain(
      "/assets/builder/backgrounds/heritage-builder-background-mobile.png",
    );
    expect(builderScreenCss).toContain(
      "/assets/builder/backgrounds/heritage-builder-background-desktop.png",
    );
  });

  it("adds no cultural skin runtime — no data-skin selector or skin palette anywhere in the token files", () => {
    for (const css of [primitives, semantic]) {
      expect(css).not.toMatch(/data-skin/i);
      expect(css).not.toMatch(/musulman|juif|hindou|intemporel/i);
    }
  });
});
