import { describe, expect, it } from "vitest";
import {
  LIFE_STORY_MAX_CHARACTERS,
  acceptLifeStoryEdit,
  countLifeStoryCharacters,
  lifeStoryLimitStatus,
} from "./life-story-limit";

const text = (n: number) => "a".repeat(n);

describe("countLifeStoryCharacters", () => {
  it("compte comme le Récit affiche : blancs réunis, bords retirés, points de code", () => {
    expect(LIFE_STORY_MAX_CHARACTERS).toBe(240);
    expect(countLifeStoryCharacters("  Élise   aimait\n\nles livres  ")).toBe("Élise aimait les livres".length);
    expect(countLifeStoryCharacters("🌿🌿")).toBe(2);
    expect(countLifeStoryCharacters("Élise")).toBe(5); // NFC : É composé
  });
});

describe("acceptLifeStoryEdit", () => {
  it("accepte toute saisie qui reste dans la limite", () => {
    expect(acceptLifeStoryEdit(text(239), text(240))).toBe(true);
    expect(acceptLifeStoryEdit("", text(240))).toBe(true);
  });

  it("refuse, en entier, ce qui ferait dépasser la limite (frappe ou collage) — jamais de troncature", () => {
    expect(acceptLifeStoryEdit(text(240), text(241))).toBe(false);
    expect(acceptLifeStoryEdit(text(10), text(500))).toBe(false);
  });

  it("des blancs en trop ne comptent pas", () => {
    expect(acceptLifeStoryEdit(text(240), `${text(240)}   `)).toBe(true);
  });

  it("un texte existant au-delà de la limite peut être raccourci ou corrigé, jamais allongé", () => {
    const existing = text(300);
    expect(acceptLifeStoryEdit(existing, text(299))).toBe(true);
    expect(acceptLifeStoryEdit(existing, `b${text(299)}`)).toBe(true);
    expect(acceptLifeStoryEdit(existing, text(301))).toBe(false);
  });
});

describe("lifeStoryLimitStatus", () => {
  it("dans la limite, atteinte, dépassée", () => {
    expect(lifeStoryLimitStatus(text(10))).toBe("within");
    expect(lifeStoryLimitStatus(text(240))).toBe("reached");
    expect(lifeStoryLimitStatus(text(241))).toBe("over");
  });
});
