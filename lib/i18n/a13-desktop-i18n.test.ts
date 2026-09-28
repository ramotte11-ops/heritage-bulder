import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LANGUAGES } from "@/config/languages";
import { A13_VIEWER_CONTRACT } from "@/config/viewer-a13-desktop-v2";
import { TRANSLATION_KEYS, type TranslationKey } from "./keys";
import { translate, translateWith, type Dictionary } from "./translate";

/**
 * Dette D5 — the A13 Desktop product text (Gallery, Full Album, Viewer)
 * under the ONE i18n authority of the repo, FR / EN / ES.
 */

const A13_KEYS = ["gallery.seeMoreMemories", "memory.position", "album.label", "viewer.close", "viewer.dialogLabel"] as const satisfies readonly TranslationKey[];

describe("D5 — A13 product text, FR / EN / ES", () => {
  it("every A13 key is canonical and has its own FR, EN and ES entry (no silent fallback)", () => {
    for (const key of A13_KEYS) {
      expect(TRANSLATION_KEYS).toContain(key);
      const values = LANGUAGES.map((l) => translate(l, key));
      expect(new Set(values).size, key).toBe(LANGUAGES.length);
    }
  });

  it("FR is the HERITAGE wording, unchanged", () => {
    expect(translate("fr", "gallery.seeMoreMemories")).toBe("Voir plus de souvenirs");
    expect(translate("fr", "viewer.close")).toBe("Fermer le souvenir");
    expect(translate("fr", "album.label")).toBe("Album de souvenirs");
    expect(translateWith("fr", "viewer.dialogLabel", { subject: "MAMAN, 1966." })).toBe("Souvenir — MAMAN, 1966.");
    expect(translateWith("fr", "memory.position", { index: 3, total: 7 })).toBe("Souvenir 3 sur 7");
  });

  it("EN / ES: the wording validated by the QG", () => {
    expect(translate("en", "gallery.seeMoreMemories")).toBe("See more memories");
    expect(translate("es", "gallery.seeMoreMemories")).toBe("Ver más recuerdos");
    expect(translateWith("en", "memory.position", { index: 3, total: 7 })).toBe("Memory 3 of 7");
    expect(translateWith("es", "memory.position", { index: 3, total: 7 })).toBe("Recuerdo 3 de 7");
    expect(translate("en", "album.label")).toBe("Memory album");
    expect(translate("es", "album.label")).toBe("Álbum de recuerdos");
    expect(translate("en", "viewer.close")).toBe("Close memory");
    expect(translate("es", "viewer.close")).toBe("Cerrar el recuerdo");
    expect(translateWith("en", "viewer.dialogLabel", { subject: "MAMAN, 1966." })).toBe("Memory — MAMAN, 1966.");
    expect(translateWith("es", "viewer.dialogLabel", { subject: "MAMAN, 1966." })).toBe("Recuerdo — MAMAN, 1966.");
  });

  it("the Viewer contract names its accessible texts by key, never by a literal", () => {
    expect(A13_VIEWER_CONTRACT.close.labelKey).toBe("viewer.close");
    expect(A13_VIEWER_CONTRACT.accessibility.dialogLabelKey).toBe("viewer.dialogLabel");
    expect(JSON.stringify(A13_VIEWER_CONTRACT)).not.toMatch(/Souvenir|Fermer|Memory|Recuerdo/);
  });
});

describe("D5 — translateWith (placeholders)", () => {
  it("inserts a param AS IS: family content is never translated, escaped or re-read as a placeholder", () => {
    const subject = "MAMIE À MIMIZAN {total}, 1966.";
    for (const l of LANGUAGES) expect(translateWith(l, "viewer.dialogLabel", { subject }).endsWith(` — ${subject}`)).toBe(true);
  });

  it("a missing parameter throws in development/test", () => {
    expect(() => translateWith("fr", "memory.position", { index: 1 })).toThrow(/total/);
  });

  it("a text without placeholder is returned exactly as translate() does", () => {
    for (const l of LANGUAGES) expect(translateWith(l, "album.label", {})).toBe(translate(l, "album.label"));
  });

  it("uses the same fallback as translate() (constructed dictionaries)", () => {
    const d: Record<(typeof LANGUAGES)[number], Dictionary> = { en: { "memory.position": "Memory {index} of {total}" }, fr: {}, es: {} };
    expect(translateWith("es", "memory.position", { index: 1, total: 2 }, d)).toBe("Memory 1 of 2");
  });
});

/**
 * Guard: no A13 product text may come back as a literal outside the i18n
 * dictionaries. Scans the runtime sources (tests excluded — they assert
 * the expected wording) for every A13 product wording in FR / EN / ES and
 * for the position / dialog-name patterns.
 */
describe("D5 — guard: no A13 product text hardcoded outside lib/i18n", () => {
  const ROOT = path.resolve(import.meta.dirname, "../..");
  const DIRS = ["app", "components", "lib", "config"];
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx|js|jsx|mjs)$/.test(name) && !/\.test\.[jt]sx?$/.test(name)) files.push(p);
    }
  };
  for (const d of DIRS) walk(path.join(ROOT, d));
  const sources = files.filter((f) => !f.startsWith(path.join(ROOT, "lib/i18n/dictionaries") + path.sep));

  const WORDINGS = A13_KEYS.flatMap((key) =>
    LANGUAGES.map((l) => translate(l, key))
      .map((v) => v.split(/\{\w+\}/)[0].replace(/\s*—\s*$/, "").trim())
      // "Souvenir" / "Memory" / "Recuerdo" alone are ordinary words (pilot alt texts); the patterns below cover them.
      .filter((v) => v.includes(" ")),
  );
  const PATTERNS = [/Souvenir \$\{[^}]*\} sur/, /Memory \$\{[^}]*\} of/, /Recuerdo \$\{[^}]*\} de/, /(Souvenir|Memory|Recuerdo) — \$\{/, /dialogLabel:\s*["'`]/, /label:\s*["'`](Fermer|Close|Cerrar)/];

  it("scans a real source tree", () => {
    expect(sources.length).toBeGreaterThan(50);
    expect(sources.some((f) => f.endsWith("components/memorial/viewer/MemoryViewer.tsx"))).toBe(true);
    expect(WORDINGS).toEqual(expect.arrayContaining(["Voir plus de souvenirs", "See more memories", "Ver más recuerdos", "Fermer le souvenir", "Album de souvenirs", "Close memory", "Álbum de recuerdos"]));
  });

  it("no wording or pattern found", () => {
    const hits: string[] = [];
    for (const f of sources) {
      const text = readFileSync(f, "utf8");
      for (const w of WORDINGS) if (text.includes(w)) hits.push(`${path.relative(ROOT, f)}: "${w}"`);
      for (const p of PATTERNS) if (p.test(text)) hits.push(`${path.relative(ROOT, f)}: ${p}`);
    }
    expect(hits).toEqual([]);
  });

  it("the A13 product components resolve their text through lib/i18n", () => {
    for (const rel of ["components/memorial/gallery/A13PilotScene.tsx", "components/memorial/gallery/A13DesktopGallery.tsx", "components/memorial/album/AlbumMemoryTable.tsx", "components/memorial/viewer/MemoryViewer.tsx"]) {
      const text = readFileSync(path.join(ROOT, rel), "utf8");
      expect(text, rel).toMatch(/from "@\/lib\/i18n\/translate"/);
      expect(text, rel).not.toMatch(/aria-label="[^"]+"/);
    }
  });
});
