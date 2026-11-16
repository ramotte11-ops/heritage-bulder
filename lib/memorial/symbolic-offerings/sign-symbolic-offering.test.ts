import { describe, expect, it, vi } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { SymbolicOfferingSignatureOutcome, SymbolicOfferingSignatureRepository } from "@/lib/adapters/symbolic-offering-repository";
import { signSymbolicOffering } from "./sign-symbolic-offering";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const KEY = "0F8FAD5B-D9CB-469F-A165-70867728950E";

function repository(result: SymbolicOfferingSignatureOutcome | Error) {
  const sign = vi.fn(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
  return { repository: { sign } satisfies SymbolicOfferingSignatureRepository, sign };
}

describe("signSymbolicOffering (Lot 2)", () => {
  it("sends the trimmed slug, the lower-cased key of THE gesture and the normalised signature", async () => {
    const { repository: repo, sign } = repository("signed");
    expect(await signSymbolicOffering({ repository: repo }, { slug: " d7f78a1b1b16 ", idempotencyKey: KEY, signature: "  Mamie\nJeanne " })).toEqual({ ok: true });
    expect(sign).toHaveBeenCalledWith({ slug: "d7f78a1b1b16", idempotencyKey: KEY.toLowerCase(), signature: "Mamie Jeanne" });
  });

  it("a retry of the same signature is the success it already was", async () => {
    const { repository: repo } = repository("already_signed");
    expect(await signSymbolicOffering({ repository: repo }, { slug: "d7f78a1b1b16", idempotencyKey: KEY, signature: "Marie" })).toEqual({ ok: true });
  });

  it("a refusal and an infrastructure error are opaque failures, never a throw", async () => {
    expect(await signSymbolicOffering({ repository: repository("refused").repository }, { slug: "d7f78a1b1b16", idempotencyKey: KEY, signature: "Marie" })).toEqual({ ok: false, reason: "refused" });
    expect(await signSymbolicOffering({ repository: repository(new Error("reset")).repository }, { slug: "d7f78a1b1b16", idempotencyKey: KEY, signature: "Marie" })).toEqual({ ok: false, reason: "error" });
  });

  it.each([
    ["a missing slug", { slug: undefined, idempotencyKey: KEY, signature: "Marie" }],
    ["a malformed key", { slug: "d7f78a1b1b16", idempotencyKey: "not-a-uuid", signature: "Marie" }],
    ["a missing key", { slug: "d7f78a1b1b16", idempotencyKey: null, signature: "Marie" }],
    ["an empty signature", { slug: "d7f78a1b1b16", idempotencyKey: KEY, signature: "   " }],
    ["41 characters", { slug: "d7f78a1b1b16", idempotencyKey: KEY, signature: "a".repeat(41) }],
    ["a non-text signature", { slug: "d7f78a1b1b16", idempotencyKey: KEY, signature: { name: "Marie" } }],
  ])("refuses %s before reaching the database", async (_label, request) => {
    const { repository: repo, sign } = repository("signed");
    expect(await signSymbolicOffering({ repository: repo }, request)).toEqual({ ok: false, reason: "invalid" });
    expect(sign).not.toHaveBeenCalled();
  });

  it("the signing module never logs (the signature is personal data)", () => {
    for (const file of ["sign-symbolic-offering.ts", "server-sign-symbolic-offering.ts", "offering-signature.ts"]) {
      const source = readFileSync(path.join(import.meta.dirname, file), "utf8");
      expect(source, file).not.toMatch(/console\./);
      expect(source, file).not.toMatch(/^\s*["']use server["']/m);
    }
  });

  it("the public page's Server Action is the ONLY route reaching the signing module; no component does", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
          if (/symbolic-offerings\/(server-)?sign-symbolic-offering/.test(readFileSync(full, "utf8"))) offenders.push(path.relative(REPO_ROOT, full));
        }
      }
    };
    for (const root of ["app", "components"]) if (existsSync(path.join(REPO_ROOT, root))) walk(path.join(REPO_ROOT, root));
    expect(offenders).toEqual([path.join("app", "hommage", "[slug]", "actions.ts")]);
  });

  it("the signing function is granted to service_role only, and the family loses the idempotency key", () => {
    const migration = readFileSync(path.join(REPO_ROOT, "supabase/migrations/20261116120000_lot2_offering_signature.sql"), "utf8");
    expect(migration).toMatch(/revoke all on function public\.sign_symbolic_offering_v1\(text, uuid, text\) from public, anon, authenticated, service_role;/);
    expect(migration).toMatch(/grant execute on function public\.sign_symbolic_offering_v1\(text, uuid, text\) to service_role;/);
    expect(migration).toMatch(/revoke select on table public\.symbolic_offerings from authenticated;/);
    const grant = migration.match(/grant select \(([^)]*)\)\s+on table public\.symbolic_offerings to authenticated;/)?.[1];
    expect(grant?.split(",").map((c) => c.trim()).sort()).toEqual(["created_at", "id", "kind", "memorial_id", "read_at", "signature", "signed_at"]);
  });
});
