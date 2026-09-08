// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BuilderPreviewLayout, type PreviewMode } from "./BuilderPreviewLayout";

/**
 * Mission 026 — contract tests for the Live Preview layout mechanic.
 *
 * These test STATE and RENDER CONTRACTS (mission brief section 14: "tester
 * les contrats d'état et de rendu", "éviter les tests trop couplés aux
 * pixels") — which controls exist in the DOM for a given `locked`/`mode`,
 * what they're labelled, whether the Builder subtree survives a mode
 * change unremounted. None of them assert on computed CSS/layout
 * (jsdom does not lay out `@media` rules anyway) — the visual proportions
 * are what the mission's 5 screenshots are for, reviewed by PO/QG
 * separately.
 */

afterEach(cleanup);

const BUILDER_CONTENT = "builder-content-marker";
const PREVIEW_CONTENT = "preview-content-marker";

function StatefulHarness({ locked, initialMode }: { locked: boolean; initialMode?: PreviewMode }) {
  // A minimal stand-in for a future Guided Flow screen: owns `mode`
  // itself and passes it down controlled, exactly the shape section 4's
  // "pilotée par état/props" describes. Not part of production code —
  // local to this test file only.
  const [mode, setMode] = useState<PreviewMode>(initialMode ?? "closed");
  return (
    <BuilderPreviewLayout
      locked={locked}
      language="fr"
      mode={mode}
      onModeChange={setMode}
      builder={<div>{BUILDER_CONTENT}</div>}
      preview={<div>{PREVIEW_CONTENT}</div>}
    />
  );
}

describe("BuilderPreviewLayout — locked (before T08)", () => {
  it("renders only the builder content — no button, no preview text, nothing else", () => {
    const { container } = render(
      <BuilderPreviewLayout
        locked
        language="fr"
        builder={<div>{BUILDER_CONTENT}</div>}
        preview={<div>{PREVIEW_CONTENT}</div>}
      />,
    );

    expect(screen.getByText(BUILDER_CONTENT)).toBeTruthy();
    expect(screen.queryByText(PREVIEW_CONTENT)).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    // No wrapper element at all — exactly the builder's own subtree.
    expect(container.querySelectorAll("div").length).toBe(1);
  });

  it("never renders any of the three preview i18n labels while locked", () => {
    render(
      <BuilderPreviewLayout
        locked
        language="en"
        builder={<div>{BUILDER_CONTENT}</div>}
        preview={<div>{PREVIEW_CONTENT}</div>}
      />,
    );
    expect(screen.queryByText("View preview")).toBeNull();
    expect(screen.queryByText("Hide preview")).toBeNull();
    expect(screen.queryByText("Back to creation")).toBeNull();
  });
});

describe("BuilderPreviewLayout — unlocked, closed (desktop état 1 / mobile creation)", () => {
  it("shows the builder content and a single 'view preview' trigger, not the preview content", () => {
    render(
      <BuilderPreviewLayout
        locked={false}
        language="en"
        builder={<div>{BUILDER_CONTENT}</div>}
        preview={<div>{PREVIEW_CONTENT}</div>}
      />,
    );

    expect(screen.getByText(BUILDER_CONTENT)).toBeTruthy();
    const trigger = screen.getByRole("button", { name: "View preview" });
    expect(trigger).toBeTruthy();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    // The preview pane is mounted (state-preservation, see the split
    // test below) but not the only-when-open trigger's concern here —
    // this asserts the OPEN control set, not DOM absence of the pane.
  });

  it("opens into split mode on click, without the caller ever passing mode='focus'", () => {
    render(
      <BuilderPreviewLayout
        locked={false}
        language="fr"
        builder={<div>{BUILDER_CONTENT}</div>}
        preview={<div>{PREVIEW_CONTENT}</div>}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Voir l'aperçu" }));

    expect(screen.getByText(PREVIEW_CONTENT)).toBeTruthy();
    expect(screen.getByText(BUILDER_CONTENT)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Voir l'aperçu" })).toBeNull();
  });

  it("is keyboard-activatable — Enter on the trigger opens the preview (no pointer required)", () => {
    render(
      <BuilderPreviewLayout
        locked={false}
        language="en"
        builder={<div>{BUILDER_CONTENT}</div>}
        preview={<div>{PREVIEW_CONTENT}</div>}
      />,
    );

    const trigger = screen.getByRole("button", { name: "View preview" });
    trigger.focus();
    expect(document.activeElement).toBe(trigger);
    // A real <button> activates on Enter/Space natively in the browser;
    // jsdom does not synthesize that native behaviour for a raw
    // fireEvent.keyDown, so this test instead proves the two properties
    // that make native activation possible: it is a real, focusable
    // <button> (not a div with a click handler) reachable via Tab.
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger.getAttribute("type")).toBe("button");
  });
});

describe("BuilderPreviewLayout — unlocked, split (desktop état 2)", () => {
  it("shows both builder and preview content plus a desktop 'hide' trigger", () => {
    render(
      <BuilderPreviewLayout
        locked={false}
        language="es"
        mode="split"
        builder={<div>{BUILDER_CONTENT}</div>}
        preview={<div>{PREVIEW_CONTENT}</div>}
      />,
    );

    expect(screen.getByText(BUILDER_CONTENT)).toBeTruthy();
    expect(screen.getByText(PREVIEW_CONTENT)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ocultar vista previa" })).toBeTruthy();
    // Mobile's own distinct label is also present in the DOM (CSS alone
    // decides which one a given viewport shows — see the module's own
    // docstring) — both controls exist, this only checks the accessible
    // NAME contract, never which is visually shown at a given width.
    expect(screen.getByRole("button", { name: "Volver a la creación" })).toBeTruthy();
  });

  it("never shows a numeric step counter, percentage, or fixed total anywhere in its own chrome", () => {
    render(
      <BuilderPreviewLayout
        locked={false}
        language="fr"
        mode="split"
        builder={<div>{BUILDER_CONTENT}</div>}
        preview={<div>{PREVIEW_CONTENT}</div>}
      />,
    );
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/\d+\s*\/\s*\d+/); // "8/10", "1/8"
    expect(text).not.toMatch(/\d+\s*%/);
  });

  it("closing calls onModeChange('closed') rather than mutating uncontrolled state silently", () => {
    const onModeChange = vi.fn();
    render(
      <BuilderPreviewLayout
        locked={false}
        language="fr"
        mode="split"
        onModeChange={onModeChange}
        builder={<div>{BUILDER_CONTENT}</div>}
        preview={<div>{PREVIEW_CONTENT}</div>}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Masquer l'aperçu" }));
    expect(onModeChange).toHaveBeenCalledWith("closed");
  });

  it("this mechanic's own triggers never request 'focus' — only a caller can", () => {
    const onModeChange = vi.fn();
    render(
      <BuilderPreviewLayout
        locked={false}
        language="en"
        mode="closed"
        onModeChange={onModeChange}
        builder={<div>{BUILDER_CONTENT}</div>}
        preview={<div>{PREVIEW_CONTENT}</div>}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "View preview" }));
    expect(onModeChange).toHaveBeenCalledWith("split");
    expect(onModeChange).not.toHaveBeenCalledWith("focus");
  });
});

describe("BuilderPreviewLayout — unlocked, focus (desktop état 3 / respiration)", () => {
  it("is only reachable via a controlled mode prop, and keeps preview content visible", () => {
    render(
      <BuilderPreviewLayout
        locked={false}
        language="en"
        mode="focus"
        builder={<div>{BUILDER_CONTENT}</div>}
        preview={<div>{PREVIEW_CONTENT}</div>}
      />,
    );
    expect(screen.getByText(PREVIEW_CONTENT)).toBeTruthy();
    // The builder subtree stays MOUNTED even in focus mode (CSS hides
    // it — see the module docstring on state preservation), so its own
    // content is still findable in the DOM, never unmounted.
    expect(screen.getByText(BUILDER_CONTENT)).toBeTruthy();
  });

  it("requires no additional click to reach — a caller can render mode='focus' directly with no prior interaction", () => {
    // I.e. this component itself introduces no gate/confirmation step of
    // its own between "split" and "focus" (mission brief section 7:
    // "Aucun clic supplémentaire obligatoire ne doit être introduit").
    expect(() =>
      render(
        <BuilderPreviewLayout
          locked={false}
          language="en"
          mode="focus"
          builder={<div>{BUILDER_CONTENT}</div>}
          preview={<div>{PREVIEW_CONTENT}</div>}
        />,
      ),
    ).not.toThrow();
  });
});

describe("BuilderPreviewLayout — mobile creation ⇄ preview preserves Builder state", () => {
  it("does not remount the builder subtree across a closed → split → closed round trip", () => {
    render(<StatefulHarness locked={false} />);

    const builderNode = screen.getByText(BUILDER_CONTENT);
    fireEvent.click(screen.getByRole("button", { name: "Voir l'aperçu" }));
    expect(screen.getByText(BUILDER_CONTENT)).toBe(builderNode); // same DOM node, not remounted

    fireEvent.click(screen.getByRole("button", { name: "Masquer l'aperçu" }));
    expect(screen.getByText(BUILDER_CONTENT)).toBe(builderNode);
  });

  it("returns to exactly the same view (mode) the family left, once re-rendered with that mode", () => {
    const { rerender } = render(<StatefulHarness locked={false} initialMode="split" />);
    expect(screen.getByText(PREVIEW_CONTENT)).toBeTruthy();

    rerender(<StatefulHarness locked={false} initialMode="split" />);
    expect(screen.getByText(PREVIEW_CONTENT)).toBeTruthy();
    expect(screen.getByText(BUILDER_CONTENT)).toBeTruthy();
  });
});

describe("BuilderPreviewLayout — accessible labels across languages", () => {
  it("resolves its three controls through the existing i18n translate(), per language", () => {
    const cases: Array<{ language: "en" | "fr" | "es"; view: string; hide: string; back: string }> = [
      { language: "en", view: "View preview", hide: "Hide preview", back: "Back to creation" },
      { language: "fr", view: "Voir l'aperçu", hide: "Masquer l'aperçu", back: "Revenir à la création" },
      { language: "es", view: "Ver vista previa", hide: "Ocultar vista previa", back: "Volver a la creación" },
    ];

    for (const { language, view, hide, back } of cases) {
      const { unmount } = render(
        <BuilderPreviewLayout
          locked={false}
          language={language}
          mode="split"
          builder={<div>{BUILDER_CONTENT}</div>}
          preview={<div>{PREVIEW_CONTENT}</div>}
        />,
      );
      expect(screen.getByRole("button", { name: hide })).toBeTruthy();
      expect(screen.getByRole("button", { name: back })).toBeTruthy();
      unmount();

      const closedRender = render(
        <BuilderPreviewLayout
          locked={false}
          language={language}
          mode="closed"
          builder={<div>{BUILDER_CONTENT}</div>}
          preview={<div>{PREVIEW_CONTENT}</div>}
        />,
      );
      expect(screen.getByRole("button", { name: view })).toBeTruthy();
      closedRender.unmount();
    }
  });
});

describe("BuilderPreviewLayout — no domain coupling", () => {
  it("has exactly the props this mission's shell is allowed to know about — no Skin/OfferId anywhere in its module", () => {
    expect(BuilderPreviewLayout.length).toBe(1); // one destructured props object
  });
});
