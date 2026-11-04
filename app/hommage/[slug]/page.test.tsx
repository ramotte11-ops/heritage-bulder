import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { isValidElement, type ReactElement } from "react";

/**
 * QG 016 / M2 — `/hommage/[slug]`. Like the other route tests of this
 * repository, the async Server Component is called directly (Vitest runs
 * in the "node" environment). The loader has its own end-to-end tests
 * (lib/memorial/public/load-public-memorial.test.ts); this file proves the
 * ROUTE: request-time rendering, the service-role client, one neutral 404
 * for every non-ready outcome, the existing MemorialAssembly with no
 * Builder chrome, and noindex.
 */

const { notFound } = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("next/navigation", () => ({ notFound }));

const { connection } = vi.hoisted(() => ({ connection: vi.fn(async () => undefined) }));
vi.mock("next/server", () => ({ connection }));

const { createServiceRoleSupabaseClient } = vi.hoisted(() => ({
  createServiceRoleSupabaseClient: vi.fn(() => ({ fake: "service-role-client" })),
}));
vi.mock("@/lib/supabase/service-role-client", () => ({ createServiceRoleSupabaseClient }));

const { loadPublicMemorial } = vi.hoisted(() => ({ loadPublicMemorial: vi.fn() }));
vi.mock("@/lib/memorial/public/load-public-memorial", () => ({ loadPublicMemorial }));

// The real renderers load next/font at import time, which only works under Next's compiler;
// the route test checks WHICH component is mounted and with WHAT, as app/admin/atelier/preview does.
const { MemorialAssembly } = vi.hoisted(() => ({ MemorialAssembly: function MemorialAssembly() { return null; } }));
vi.mock("@/components/memorial/assembly/MemorialAssembly", () => ({ MemorialAssembly }));

const { default: PublicMemorialPage, metadata } = await import("./page");

const ASSEMBLED = { status: "assembled", language: "fr", skinVariant: "dark", sections: [], archivedSections: [], failures: [] };

function call(slug: string) {
  return PublicMemorialPage({ params: Promise.resolve({ slug }) });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/hommage/[slug]", () => {
  it("renders the published memorial through the existing MemorialAssembly, with the service-role loader", async () => {
    loadPublicMemorial.mockResolvedValue({ status: "ready", assembled: ASSEMBLED });
    const element = (await call("95bd2601eac8")) as ReactElement<{ lang: string; children: ReactElement }>;
    expect(connection).toHaveBeenCalledTimes(1);
    expect(loadPublicMemorial).toHaveBeenCalledWith("95bd2601eac8", { client: { fake: "service-role-client" } });
    expect(isValidElement(element)).toBe(true);
    expect(element.type).toBe("main");
    expect(element.props.lang).toBe("fr");
    const child = element.props.children;
    expect(child.type).toBe(MemorialAssembly);
    expect((child.props as { assembled: unknown }).assembled).toBe(ASSEMBLED);
  });

  it("renders at request time: connection() runs before any read (no prerender, no cached signed URL)", async () => {
    const order: string[] = [];
    connection.mockImplementationOnce(async () => {
      order.push("connection");
    });
    loadPublicMemorial.mockImplementationOnce(async () => {
      order.push("load");
      return { status: "ready", assembled: ASSEMBLED };
    });
    await call("95bd2601eac8");
    expect(order).toEqual(["connection", "load"]);
  });

  it("every non-ready outcome is the same neutral notFound()", async () => {
    loadPublicMemorial.mockResolvedValue({ status: "unavailable" });
    for (const slug of ["95bd2601eac8", "ffffffffffff", "jeanne-test-s1"]) {
      await expect(call(slug)).rejects.toThrow("NEXT_NOT_FOUND");
    }
    expect(notFound).toHaveBeenCalledTimes(3);
  });

  it("is not indexed (first TEST version): noindex, nofollow, nocache", () => {
    expect(metadata.robots).toMatchObject({ index: false, follow: false, nocache: true });
    expect(metadata.title).toBe("Hommage — HERITAGE");
  });

  it("has no Builder chrome, no editor link, no client-side Supabase and no proxy session", () => {
    const source = readFileSync(path.join(import.meta.dirname, "page.tsx"), "utf8");
    const imports = source.split("\n").filter((line) => line.startsWith("import "));
    expect(imports.join("\n")).not.toMatch(/components\/builder|BuilderShell|GuidedFlowPause|browser-client|server-client|heritage-session/);
    expect(source).not.toMatch(/href=["'`]\/builder/);
    expect(source).not.toMatch(/"use client"/);
    const proxy = readFileSync(path.join(import.meta.dirname, "..", "..", "..", "proxy.ts"), "utf8");
    expect(proxy).not.toContain("/hommage");
  });
});
