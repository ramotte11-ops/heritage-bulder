import { describe, expect, it } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { isCsrfOriginAllowed } from "next/dist/server/app-render/csrf-protection";
import nextConfig, {
  allowedDevOriginsFor,
  DEV_ONLY_PAGE_EXTENSION,
  NETLIFY_PREVIEW_DEV_ORIGIN,
  pageExtensionsFor,
  privateLanDevOrigin,
} from "./next.config";

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

/**
 * Preview Server Netlify (incident QG 004-G) : l'hôte exact du serveur de
 * développement Netlify est autorisé, et lui seul. Le contrôle passe par le
 * matcher de Next.js lui-même, celui qu'utilise `next dev`.
 */
describe("allowedDevOrigins", () => {
  const allowed = nextConfig.allowedDevOrigins ?? [];

  it("autorise exactement l'hôte du Preview Server Netlify, sans schéma ni port", () => {
    expect(NETLIFY_PREVIEW_DEV_ORIGIN).toBe("devserver-main--hommages.netlify.app");
    expect(allowed).toEqual([NETLIFY_PREVIEW_DEV_ORIGIN]);
    expect(isCsrfOriginAllowed("devserver-main--hommages.netlify.app", allowed)).toBe(true);
  });

  it("n'utilise aucun joker", () => {
    for (const entry of allowed) expect(entry).not.toMatch(/\*/);
  });

  it("ajoute seulement l'IPv4 privée locale configurée hors production", () => {
    expect(allowedDevOriginsFor("development", "192.168.1.11")).toEqual([
      NETLIFY_PREVIEW_DEV_ORIGIN,
      "192.168.1.11",
    ]);
    expect(allowedDevOriginsFor("production", "192.168.1.11")).toEqual([NETLIFY_PREVIEW_DEV_ORIGIN]);
  });

  it.each(["10.0.0.8", "172.16.0.1", "172.31.255.254", "192.168.42.7"])(
    "accepte l'adresse privée exacte %s",
    (origin) => expect(privateLanDevOrigin(origin)).toBe(origin),
  );

  it.each([
    "*",
    "0.0.0.0",
    "192.168.*.*",
    "192.168.1.11:3000",
    "http://192.168.1.11",
    "8.8.8.8",
    "172.15.0.1",
    "172.32.0.1",
    "devserver-main--hommages.netlify.app",
  ])("refuse l'origine LAN non privée ou non exacte %s", (origin) => {
    expect(() => privateLanDevOrigin(origin)).toThrow(/exact private IPv4/);
  });

  it.each([
    "hommages.netlify.app",
    "autre--hommages.netlify.app",
    "deploy-preview-1--hommages.netlify.app",
    "evil.netlify.app",
    "netlify.app",
    "x.devserver-main--hommages.netlify.app",
    "devserver-main--hommages.netlify.app.evil.com",
  ])("refuse l'origine Netlify ou voisine %s", (origin) => {
    expect(isCsrfOriginAllowed(origin, allowed)).toBe(false);
  });
});
