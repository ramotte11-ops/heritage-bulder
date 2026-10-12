import { describe, expect, it } from "vitest";
import { bindSpaceBeforePunctuation } from "./life-story-v2-typography";

const NBSP = " ";

describe("bindSpaceBeforePunctuation", () => {
  it("colle « ! », « ? », « ; » et « : » au mot précédent (FR)", () => {
    expect(bindSpaceBeforePunctuation("avec bienveillance !")).toBe(`avec bienveillance${NBSP}!`);
    expect(bindSpaceBeforePunctuation("Vraiment ? Oui ; enfin : toujours")).toBe(
      `Vraiment${NBSP}? Oui${NBSP}; enfin${NBSP}: toujours`,
    );
  });

  it("ne touche à aucune autre espace", () => {
    const text = "Née à Lyon en 1948, Élise aimait les gens.";
    expect(bindSpaceBeforePunctuation(text)).toBe(text);
    expect(bindSpaceBeforePunctuation("les marchés : le dimanche").split(" ")).toEqual(["les", `marchés${NBSP}:`, "le", "dimanche"]);
  });

  it("n'ajoute ni ne retire d'espace : EN et ES sans espace restent identiques", () => {
    expect(bindSpaceBeforePunctuation("She loved life! Did she? Yes; always: kind.")).toBe(
      "She loved life! Did she? Yes; always: kind.",
    );
    expect(bindSpaceBeforePunctuation("¡Qué alegría! ¿Verdad? Sí: siempre.")).toBe("¡Qué alegría! ¿Verdad? Sí: siempre.");
  });

  it("une espace saisie avant la ponctuation devient insécable, quelle que soit la langue", () => {
    expect(bindSpaceBeforePunctuation("What a life !")).toBe(`What a life${NBSP}!`);
    expect(bindSpaceBeforePunctuation("¡Qué vida !")).toBe(`¡Qué vida${NBSP}!`);
  });

  it("laisse les heures et les adresses intactes", () => {
    expect(bindSpaceBeforePunctuation("À 10:30, voir https://exemple.fr")).toBe("À 10:30, voir https://exemple.fr");
  });

  it("réunit plusieurs espaces ou tabulations en une seule insécable", () => {
    expect(bindSpaceBeforePunctuation("Merci  !")).toBe(`Merci${NBSP}!`);
    expect(bindSpaceBeforePunctuation("Merci\t?")).toBe(`Merci${NBSP}?`);
  });

  it("renvoie une copie : la chaîne d'origine n'est pas modifiée", () => {
    const original = "Bonjour !";
    bindSpaceBeforePunctuation(original);
    expect(original).toBe("Bonjour !");
  });
});
