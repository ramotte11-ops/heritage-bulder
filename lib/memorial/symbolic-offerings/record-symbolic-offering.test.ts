import { describe, expect, it, vi } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { OFFERING_KINDS } from "@/config/symbolic-offerings-v1-tokens";
import type { SymbolicOfferingOutcome, SymbolicOfferingRepository } from "@/lib/adapters/symbolic-offering-repository";
import { recordSymbolicOffering, SYMBOLIC_OFFERING_SLUG_MAX_LENGTH } from "./record-symbolic-offering";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const KEY = "0F8FAD5B-D9CB-469F-A165-70867728950E";

function repository(result: SymbolicOfferingOutcome | Error) {
  const record = vi.fn(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
  return { repository: { record } satisfies SymbolicOfferingRepository, record };
}

describe("recordSymbolicOffering", () => {
  it("records a valid gesture with the trimmed slug and a normalised key", async () => {
    const { repository: repo, record } = repository("recorded");

    expect(await recordSymbolicOffering({ repository: repo }, { slug: "  jeanne-martin ", kind: "lys", idempotencyKey: KEY })).toEqual({ ok: true });
    expect(record).toHaveBeenCalledWith({ slug: "jeanne-martin", kind: "lys", idempotencyKey: KEY.toLowerCase() });
  });

  it("treats a duplicate as the success it already was", async () => {
    const { repository: repo } = repository("duplicate");
    expect(await recordSymbolicOffering({ repository: repo }, { slug: "jeanne-martin", kind: "coeur", idempotencyKey: KEY })).toEqual({ ok: true });
  });

  it.each([
    ["refused", "refused"],
    ["rate_limited", "rate_limited"],
  ] as const)("answers %s with an opaque failure", async (outcome, reason) => {
    const { repository: repo } = repository(outcome);
    expect(await recordSymbolicOffering({ repository: repo }, { slug: "jeanne-martin", kind: "bougie", idempotencyKey: KEY })).toEqual({ ok: false, reason });
  });

  it("turns an infrastructure error into the same opaque failure, never a throw", async () => {
    const { repository: repo } = repository(new Error("connection reset"));
    expect(await recordSymbolicOffering({ repository: repo }, { slug: "jeanne-martin", kind: "bougie", idempotencyKey: KEY })).toEqual({ ok: false, reason: "error" });
  });

  it.each([
    ["a missing slug", { slug: undefined, kind: "bougie", idempotencyKey: KEY }],
    ["a blank slug", { slug: "   ", kind: "bougie", idempotencyKey: KEY }],
    ["a non-string slug", { slug: 42, kind: "bougie", idempotencyKey: KEY }],
    ["an oversized slug", { slug: "a".repeat(SYMBOLIC_OFFERING_SLUG_MAX_LENGTH + 1), kind: "bougie", idempotencyKey: KEY }],
    ["an unknown kind", { slug: "jeanne-martin", kind: "rose", idempotencyKey: KEY }],
    ["a non-string kind", { slug: "jeanne-martin", kind: ["bougie"], idempotencyKey: KEY }],
    ["a malformed key", { slug: "jeanne-martin", kind: "bougie", idempotencyKey: "not-a-uuid" }],
    ["a missing key", { slug: "jeanne-martin", kind: "bougie", idempotencyKey: null }],
  ])("refuses %s before reaching the database", async (_label, request) => {
    const { repository: repo, record } = repository("recorded");
    expect(await recordSymbolicOffering({ repository: repo }, request)).toEqual({ ok: false, reason: "invalid" });
    expect(record).not.toHaveBeenCalled();
  });
});

describe("C1 fidelity and exposure", () => {
  const migration = readFileSync(path.join(REPO_ROOT, "supabase/migrations/20261023160000_symbolic_offerings_v1.sql"), "utf8");

  it("the stored kinds are exactly the scene's OFFERING_KINDS", () => {
    const tableCheck = migration.match(/kind text not null check \(kind in \(([^)]*)\)\)/)?.[1];
    const functionCheck = migration.match(/p_kind not in \(([^)]*)\)/)?.[1];
    const expected = OFFERING_KINDS.map((kind) => `'${kind}'`).join(", ");
    expect(tableCheck).toBe(expected);
    expect(functionCheck).toBe(expected);
  });

  it("the recording function is granted to service_role only", () => {
    expect(migration).toMatch(/revoke execute on function public\.record_symbolic_offering_v1\(text, text, uuid\) from public, anon, authenticated;/);
    expect(migration).toMatch(/grant execute on function public\.record_symbolic_offering_v1\(text, text, uuid\) to service_role;/);
  });

  it("no route, component or Server Action reaches the recording module in C1", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
          if (/symbolic-offerings\/(server-)?record-symbolic-offering|symbolic-offering-repository/.test(readFileSync(full, "utf8"))) {
            offenders.push(path.relative(REPO_ROOT, full));
          }
        }
      }
    };
    for (const root of ["app", "components"]) if (existsSync(path.join(REPO_ROOT, root))) walk(path.join(REPO_ROOT, root));
    expect(offenders).toEqual([]);
  });

  it("neither C1 module is a Server Action", () => {
    for (const file of ["record-symbolic-offering.ts", "server-record-symbolic-offering.ts"]) {
      const source = readFileSync(path.join(import.meta.dirname, file), "utf8");
      expect(source).not.toMatch(/^\s*["']use server["']/m);
    }
  });
});
