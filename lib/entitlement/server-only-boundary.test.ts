import { describe, expect, it } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Mission 011B, test P — the service-role key must never be able to
 * reach a browser bundle.
 *
 * Next.js already keeps SUPABASE_SERVICE_ROLE_KEY out of client bundles
 * because it is not prefixed NEXT_PUBLIC_ — but that protection only
 * holds if no client-reachable module ever constructs the service-role
 * client in the first place. The canonical belt-and-braces guard would
 * be `import "server-only"`, which throws at build time; that package is
 * not installed here and adding a dependency is out of this mission's
 * scope, so this test enforces the same property directly instead of
 * trusting a comment.
 *
 * It walks the real import graph: every "use client" module, plus
 * everything each of them transitively imports, must not include the
 * service-role client or any repository that can only work with it. A
 * regression fails `npm run test`, not just review.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");

/**
 * Modules that must never appear in a client component's import graph:
 * the one that CONSTRUCTS the service-role client, and the repositories
 * that are useless without it.
 *
 * lib/supabase/env.ts is deliberately NOT listed. It is shared with the
 * public/anon client (getSupabasePublicEnv), and it is not a leak
 * vector: the service-role key is read through a dynamic
 * `process.env[name]` lookup of a non-NEXT_PUBLIC_ variable, which Next
 * never inlines and never exposes to a browser. Its safety is asserted
 * directly in its own test below instead.
 */
const SERVER_ONLY_MODULES = [
  "lib/supabase/service-role-client.ts",
  "lib/adapters/supabase/owner-repository.ts",
  "lib/adapters/supabase/entitlement-repository.ts",
  // Mission 013: these hold the activation-key secret material — the
  // CSPRNG, the hashing, and every primitive that issues, replaces or
  // redeems a key. `node:crypto` is a server module and none of this has
  // any business reaching a browser bundle.
  "lib/entitlement/activation-key.ts",
  "lib/entitlement/issue-entitlement.ts",
  "lib/entitlement/activation-key-lifecycle.ts",
  "lib/entitlement/redeem-with-activation-key.ts",
  // Mission 014: the authorization layer. `heritage-session.ts`
  // constructs the service-role client, and the ownership repository is
  // only usable with it — `authenticated` holds no privilege on
  // `memorials` (Mission 013C). Neither has any business in a browser
  // bundle, and an authorization decision must never be reachable from
  // code the user controls.
  "lib/adapters/supabase/memorial-ownership-repository.ts",
  "lib/auth/heritage-session.ts",
  // Mission 015A: the staff support reads. They run with the
  // service-role client over owners/entitlements/memorials — every
  // family's record, not just the caller's — so nothing client-reachable
  // may import them.
  "lib/adapters/supabase/admin-support-repository.ts",
  "lib/admin/admin-session.ts",
];

const SOURCE_DIRECTORIES = ["app", "components", "lib", "types", "config"];
const SOURCE_EXTENSIONS = [".ts", ".tsx"];

function listSourceFiles(): string[] {
  const files: string[] = [];

  function walk(directory: string): void {
    for (const entry of readdirSync(directory)) {
      const full = path.join(directory, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (SOURCE_EXTENSIONS.includes(path.extname(full)) && !full.includes(".test.")) {
        files.push(path.relative(REPO_ROOT, full));
      }
    }
  }

  for (const directory of SOURCE_DIRECTORIES) {
    const full = path.join(REPO_ROOT, directory);
    if (existsSync(full)) walk(full);
  }

  return files;
}

/** Resolves a specifier to a repo-relative source path, or null when it
 * is external (a package) or unresolvable. */
function resolveSpecifier(fromFile: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) {
    base = path.join(REPO_ROOT, specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    base = path.resolve(REPO_ROOT, path.dirname(fromFile), specifier);
  } else {
    return null; // a node_modules package
  }

  for (const candidate of [
    base,
    ...SOURCE_EXTENSIONS.map((extension) => `${base}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) => path.join(base, `index${extension}`)),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return path.relative(REPO_ROOT, candidate);
    }
  }

  return null;
}

/** Every local module `file` imports. Covers static imports/re-exports
 * and dynamic import() — including type-only imports, deliberately: a
 * `import type` is erased at build time, but treating it as an edge
 * keeps this check conservative rather than clever. */
function importsOf(file: string): string[] {
  const source = readFileSync(path.join(REPO_ROOT, file), "utf8");
  const specifiers = [
    ...source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g),
  ].map((match) => match[1]);

  return specifiers
    .map((specifier) => resolveSpecifier(file, specifier))
    .filter((resolved): resolved is string => resolved !== null);
}

function isServerActionModule(file: string): boolean {
  const head = readFileSync(path.join(REPO_ROOT, file), "utf8").slice(0, 200);
  return /^\s*["']use server["']/.test(head);
}

/**
 * Everything `entry` can reach, stopping at any "use server" module.
 *
 * That stop is the real architectural boundary, not a convenience: Next
 * replaces a Server Action's exports client-side with a network
 * reference, so neither the module's body nor anything it imports is
 * bundled to the browser. Traversing through one would flag
 * LoginForm -> app/auth/actions.ts -> server-client.ts as if the client
 * could see it, which it cannot.
 */
function transitiveImports(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];

  while (queue.length > 0) {
    const current = queue.pop() as string;
    if (current !== entry && isServerActionModule(current)) continue;
    for (const imported of importsOf(current)) {
      if (seen.has(imported)) continue;
      seen.add(imported);
      queue.push(imported);
    }
  }

  return seen;
}

function clientEntrypoints(): string[] {
  return listSourceFiles().filter((file) => {
    const head = readFileSync(path.join(REPO_ROOT, file), "utf8").slice(0, 200);
    return /^\s*["']use client["']/.test(head);
  });
}

describe("server-only boundary", () => {
  it("finds the client components it is supposed to be checking", () => {
    // Guards the test itself: if the discovery ever silently returned
    // nothing, every assertion below would pass vacuously.
    expect(clientEntrypoints().length).toBeGreaterThan(0);
  });

  it("resolves the modules it is supposed to be guarding", () => {
    for (const serverOnly of SERVER_ONLY_MODULES) {
      expect(existsSync(path.join(REPO_ROOT, serverOnly))).toBe(true);
    }
  });

  it("P: no client component can reach the service-role client or a server-only repository", () => {
    const violations: string[] = [];

    for (const entry of clientEntrypoints()) {
      const reachable = transitiveImports(entry);
      for (const serverOnly of SERVER_ONLY_MODULES) {
        if (reachable.has(serverOnly)) violations.push(`${entry} -> ${serverOnly}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("stops at a Server Action boundary, as Next.js itself does", () => {
    // app/auth/actions.ts is "use server"; a client component importing
    // it gets a network reference, never server-client.ts.
    const reachable = transitiveImports("components/auth/LoginForm.tsx");
    expect(reachable.has("app/auth/actions.ts")).toBe(true);
    expect(reachable.has("lib/supabase/server-client.ts")).toBe(false);
  });

  it("detects a violation when one is introduced (the check is not vacuous)", () => {
    // Proves the graph walk really does find these modules: a known
    // server-side entrypoint must reach the service-role client.
    const reachable = transitiveImports("lib/adapters/supabase/owner-repository.ts");
    expect(reachable.has("lib/adapters/owner-repository.ts")).toBe(true);

    const serviceRoleReach = transitiveImports("lib/supabase/service-role-client.ts");
    expect(serviceRoleReach.has("lib/supabase/env.ts")).toBe(true);

    // And a client component that DID import a server-only repository
    // would be caught: the walk reaches it in one hop, with no "use
    // server" module in between to stop at.
    const direct = transitiveImports("lib/adapters/supabase/entitlement-repository.ts");
    expect(direct.has("lib/adapters/entitlement-repository.ts")).toBe(true);
  });

  it("Mission 013: no client component can reach node:crypto through our modules", () => {
    // A second, independent angle on the same boundary: the key material
    // modules import node:crypto directly, so if one ever became
    // client-reachable the bundle would break loudly — but this asserts
    // it rather than relying on that.
    for (const entry of clientEntrypoints()) {
      for (const reachable of transitiveImports(entry)) {
        const source = readFileSync(path.join(REPO_ROOT, reachable), "utf8");
        expect(source).not.toContain('from "node:crypto"');
      }
    }
  });

  it("keeps the service-role key out of anything a client bundle could read", () => {
    const env = readFileSync(path.join(REPO_ROOT, "lib/supabase/env.ts"), "utf8");
    // The key is read from a non-NEXT_PUBLIC_ variable, which is what
    // makes Next.js strip it from client bundles.
    expect(env).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(env).not.toContain("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY");
  });
});
