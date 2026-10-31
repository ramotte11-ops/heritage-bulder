import { describe, expect, it } from "vitest";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config } from "./proxy";

/**
 * Builder continuity mission — the session-refresh perimeter. Asserted
 * with Next.js's own matcher implementation (not a hand-rolled regex),
 * so this fails if a route that reads the session silently falls out of
 * the refresh again. The installed next@16.3.3 still exports this helper
 * under its pre-rename name (`unstable_doesMiddlewareMatch`); the bundled
 * proxy.md already documents it as `unstable_doesProxyMatch`.
 */
function matches(url: string): boolean {
  return unstable_doesMiddlewareMatch({ config, url });
}

describe("proxy matcher", () => {
  it.each([
    "/activate",
    "/builder/11111111-1111-4111-8111-111111111111",
    "/owner",
    "/login",
    "/auth/callback",
    "/admin",
    "/brouillon/reprise",
    "/brouillon/sauvegarder",
  ])("refreshes the session for %s", (url) => {
    expect(matches(url)).toBe(true);
  });

  it("never runs for the public root", () => {
    expect(matches("/")).toBe(false);
  });

  it("QG 008 Lot 2: never runs for the guest Builder, which holds no session", () => {
    expect(matches("/creer")).toBe(false);
    expect(matches("/pilote/builder-invite")).toBe(false);
  });
});
