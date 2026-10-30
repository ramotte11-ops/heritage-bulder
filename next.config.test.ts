import { describe, expect, it } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { DEV_ONLY_PAGE_EXTENSION, pageExtensionsFor } from "./next.config";

/**
 * Pages de développement (`page.dev.tsx`) : routées par `next dev` seulement,
 * jamais par un build de production. La preuve définitive est le build
 * lui-même (la route n'apparaît pas dans sa liste) ; ce test verrouille la
 * règle de configuration qui la produit.
 */
describe("pageExtensionsFor", () => {
  it("en production, l'extension de développement n'est pas une page", () => {
    expect(pageExtensionsFor("production")).toEqual(["tsx", "ts", "jsx", "js"]);
    expect(pageExtensionsFor("production")).not.toContain(DEV_ONLY_PAGE_EXTENSION);
  });

  it("hors production, la page de développement est routée, avant les extensions standard", () => {
    for (const env of ["development", "test", undefined]) {
      expect(pageExtensionsFor(env)).toEqual([DEV_ONLY_PAGE_EXTENSION, "tsx", "ts", "jsx", "js"]);
    }
  });

  it.each(["app/pilote/offrandes", "app/pilote/builder-invite"])(
    "%s n'existe que comme page de développement",
    (route) => {
      const dir = path.resolve(import.meta.dirname, route);
      expect(existsSync(path.join(dir, "page.dev.tsx"))).toBe(true);
      expect(readdirSync(dir).filter((f) => /^page\.(tsx|ts|jsx|js)$/.test(f))).toEqual([]);
    },
  );
});
