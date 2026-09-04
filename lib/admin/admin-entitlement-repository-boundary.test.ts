import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Mission 015B — the point the Opus audit made explicit: there must not
 * be two ways for Admin code to change `entitlements.activation_key_hash`
 * — one audited (admin_mutate_activation_key, called through
 * SupabaseAdminEntitlementRepository) and one that is not
 * (EntitlementRepository.swapActivationKey, a direct PostgREST
 * compare-and-swap with no audit row).
 *
 * Mission 013's primitives (lib/entitlement/activation-key-lifecycle.ts,
 * EntitlementRepository.swapActivationKey) are preserved exactly as they
 * were — this test does not ask for their removal, only that nothing
 * reachable from the Admin surface ever calls them. If a future change
 * ever wires app/admin, components/admin or lib/admin to that direct
 * path — instead of to admin_mutate_activation_key()/
 * admin_revoke_entitlement() — this test catches it by construction,
 * not by review.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");

const ADMIN_DIRECTORIES = ["app/admin", "components/admin", "lib/admin"];
const SOURCE_EXTENSIONS = [".ts", ".tsx"];

function listAdminSourceFiles(): string[] {
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

  for (const directory of ADMIN_DIRECTORIES) {
    const full = path.join(REPO_ROOT, directory);
    if (existsSync(full)) walk(full);
  }

  return files;
}

describe("Admin entitlement mutations — no unaudited direct path", () => {
  it("finds the Admin source files it is supposed to be checking", () => {
    // Guards the test itself: if discovery ever silently returned
    // nothing, every assertion below would pass vacuously.
    expect(listAdminSourceFiles().length).toBeGreaterThan(0);
  });

  it("no app/admin, components/admin or lib/admin source calls swapActivationKey", () => {
    const violations: string[] = [];

    for (const file of listAdminSourceFiles()) {
      const source = readFileSync(path.join(REPO_ROOT, file), "utf8");
      if (source.includes("swapActivationKey")) violations.push(file);
    }

    expect(violations).toEqual([]);
  });

  it("no app/admin, components/admin or lib/admin source imports the unaudited lifecycle primitives", () => {
    const violations: string[] = [];

    for (const file of listAdminSourceFiles()) {
      const source = readFileSync(path.join(REPO_ROOT, file), "utf8");
      if (source.includes("activation-key-lifecycle")) violations.push(file);
    }

    expect(violations).toEqual([]);
  });

  it("SupabaseAdminEntitlementRepository never calls .update( — every write goes through an audited RPC", () => {
    const source = readFileSync(
      path.join(REPO_ROOT, "lib/adapters/supabase/admin-entitlement-repository.ts"),
      "utf8",
    );

    expect(source).not.toContain(".update(");
    expect(source).toContain('.rpc("admin_mutate_activation_key"');
    expect(source).toContain('.rpc("admin_revoke_entitlement"');
  });

  it("Mission 013's primitives are preserved, not deleted — only unwired from Admin", () => {
    for (const file of [
      "lib/entitlement/activation-key-lifecycle.ts",
      "lib/adapters/entitlement-repository.ts",
      "lib/adapters/supabase/entitlement-repository.ts",
    ]) {
      expect(existsSync(path.join(REPO_ROOT, file))).toBe(true);
    }

    const lifecycle = readFileSync(
      path.join(REPO_ROOT, "lib/entitlement/activation-key-lifecycle.ts"),
      "utf8",
    );
    expect(lifecycle).toContain("export async function replaceActivationKey");
    expect(lifecycle).toContain("export async function invalidateActivationKey");

    const repository = readFileSync(
      path.join(REPO_ROOT, "lib/adapters/supabase/entitlement-repository.ts"),
      "utf8",
    );
    expect(repository).toContain("async swapActivationKey(");
  });
});
