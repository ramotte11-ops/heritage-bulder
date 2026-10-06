// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { HERO_SHORT_PHRASE_MAX_CHARS } from "@/lib/memorial/hero";

/**
 * Hero Intemporel Mobile Text Contract V1 REV1 (`PHRASE_40_QA.md`) —
 * T05's own input carries the Builder authority for `shortPhrase`
 * (40 characters max). The domain refusal itself is covered in
 * lib/builder/guided-flow/hero-step.test.ts.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

vi.mock("next/font/google", () => ({
  Playfair_Display: () => ({ variable: "--font-heritage-serif-mock", className: "" }),
  Inter: () => ({ variable: "--font-heritage-sans-mock", className: "" }),
  Cormorant_Garamond: () => ({ variable: "--font-heritage-hero-serif-mock", className: "" }),
  La_Belle_Aurore: () => ({ variable: "--font-heritage-hero-script-mock", className: "" }),
  EB_Garamond: () => ({ variable: "--font-heritage-ceremony-serif-mock", className: "" }),
}));

const { HeroPhraseStep } = await import("./HeroPhraseStep");

afterEach(cleanup);

const CONTENT = {
  hero: { displayName: "Jean Dupont", birth: null, death: null, shortPhrase: null, photo: null },
};

describe("HeroPhraseStep — 40-character Builder limit (Mobile Text Contract REV1)", () => {
  it("caps the textarea at exactly 40 characters", () => {
    render(
      <HeroPhraseStep
        language="fr"
        editorialContext="remembrance"
        content={CONTENT}
        persist={vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" })}
      />,
    );
    expect(HERO_SHORT_PHRASE_MAX_CHARS).toBe(40);
    expect(screen.getByRole("textbox").getAttribute("maxlength")).toBe("40");
  });
});
