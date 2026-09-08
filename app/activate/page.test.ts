import { describe, expect, it, vi, beforeEach } from "vitest";
import { isValidElement, type ReactNode } from "react";

/**
 * Mission 019C — the /activate page itself.
 *
 * The environment here is `node` (see vitest.config.mts) and nothing in
 * this repository renders React in a test — same constraint as
 * app/owner/page.test.tsx and app/admin/page.test.tsx. What is asserted
 * is what CAN be checked without a DOM: which branch renders for which
 * session state, by walking the plain React-element tree the Server
 * Component function returns (JSX creates descriptor objects; it does
 * not invoke a component's hooks until something actually renders it).
 */

const { getAuthenticatedUser, isEtsyChannelConfigured } = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  isEtsyChannelConfigured: vi.fn(),
}));
vi.mock("@/lib/supabase/session", () => ({ getAuthenticatedUser }));
vi.mock("@/lib/integration/etsy/config", () => ({ isEtsyChannelConfigured }));

const { default: ActivatePage } = await import("./page");
const { LoginForm } = await import("@/components/auth/LoginForm");
const { ActivateForm } = await import("@/components/activate/ActivateForm");
const { EtsyClaimButton } = await import("@/components/activate/EtsyClaimButton");

/** The page reads `searchParams` as a promise (Next 16). */
function props(searchParams: { claim?: string } = {}) {
  return { searchParams: Promise.resolve(searchParams) };
}

/** Finds the first element of `type` anywhere in the returned tree. */
function findByType(node: ReactNode, type: unknown): { props: Record<string, unknown> } | null {
  if (!isValidElement(node)) return null;
  if (node.type === type) return node as unknown as { props: Record<string, unknown> };
  const children = (node.props as { children?: ReactNode })?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findByType(child, type);
      if (found) return found;
    }
    return null;
  }
  return findByType(children, type);
}

/** Every string rendered anywhere in the tree, flattened. */
function collectText(node: ReactNode, into: string[] = []): string[] {
  if (typeof node === "string") into.push(node);
  if (Array.isArray(node)) node.forEach((child) => collectText(child, into));
  if (isValidElement(node)) {
    collectText((node.props as { children?: ReactNode })?.children, into);
  }
  return into;
}

function treeIncludesType(node: ReactNode, type: unknown): boolean {
  if (!isValidElement(node)) return false;
  if (node.type === type) return true;
  const children = (node.props as { children?: ReactNode })?.children;
  if (Array.isArray(children)) {
    return children.some((child) => treeIncludesType(child, type));
  }
  return treeIncludesType(children, type);
}

describe("ActivatePage", () => {
  beforeEach(() => {
    getAuthenticatedUser.mockReset();
    isEtsyChannelConfigured.mockReset();
    isEtsyChannelConfigured.mockReturnValue(true);
  });

  it("renders the Magic Link form, not the activation form, when signed out", async () => {
    getAuthenticatedUser.mockResolvedValue(null);

    const page = await ActivatePage(props());

    expect(treeIncludesType(page, LoginForm)).toBe(true);
    expect(treeIncludesType(page, ActivateForm)).toBe(false);
  });

  it("asks the Magic Link form to return to /activate", async () => {
    getAuthenticatedUser.mockResolvedValue(null);

    const page = await ActivatePage(props());

    function findLoginForm(node: ReactNode): { props: { next?: string } } | null {
      if (!isValidElement(node)) return null;
      if (node.type === LoginForm) return node as unknown as { props: { next?: string } };
      const children = (node.props as { children?: ReactNode })?.children;
      if (Array.isArray(children)) {
        for (const child of children) {
          const found = findLoginForm(child);
          if (found) return found;
        }
        return null;
      }
      return findLoginForm(children);
    }

    const loginForm = findLoginForm(page);
    expect(loginForm?.props.next).toBe("/activate");
  });

  it("renders the activation form, not the Magic Link form, when signed in", async () => {
    getAuthenticatedUser.mockResolvedValue({ id: "auth-user-1", email: "famille@example.test" });

    const page = await ActivatePage(props());

    expect(treeIncludesType(page, ActivateForm)).toBe(true);
    expect(treeIncludesType(page, LoginForm)).toBe(false);
  });

  /**
   * Mission 019B — the UX rules the QG locked: Etsy is the nominal path
   * and is what the family meets first; the activation key survives only
   * as a discreet recovery, never as an equal choice.
   */
  describe("Mission 019B — nominal Etsy first, HH1 as recovery", () => {
    beforeEach(() => {
      getAuthenticatedUser.mockResolvedValue({ id: "auth-user-1", email: "famille@example.test" });
    });

    it("offers the Etsy confirmation as the primary action", async () => {
      const page = await ActivatePage(props());

      expect(treeIncludesType(page, EtsyClaimButton)).toBe(true);
    });

    it("keeps the activation key folded away by default, not presented as an equal choice", async () => {
      const page = await ActivatePage(props());

      const details = findByType(page, "details");
      expect(details).not.toBeNull();
      // Closed on a normal visit: reachable, never competing with the
      // nominal action.
      expect(details?.props.open).toBe(false);
      // And the key form lives INSIDE it, rather than beside the button.
      expect(treeIncludesType(details as unknown as ReactNode, ActivateForm)).toBe(true);
    });

    it("unfolds the recovery once the Etsy round-trip found nothing", async () => {
      const page = await ActivatePage(props({ claim: "recovery" }));

      expect(findByType(page, "details")?.props.open).toBe(true);
    });

    it("falls back to the key form alone when Etsy is not configured at all", async () => {
      isEtsyChannelConfigured.mockReturnValue(false);

      const page = await ActivatePage(props());

      expect(treeIncludesType(page, EtsyClaimButton)).toBe(false);
      expect(treeIncludesType(page, ActivateForm)).toBe(true);
    });

    it("ignores an unrecognised claim value instead of rendering it", async () => {
      const page = await ActivatePage(props({ claim: "<script>alert(1)</script>" }));

      const text = collectText(page).join(" ");
      expect(text).not.toContain("script");
    });

    it("never renders a technical value from the claim round-trip", async () => {
      for (const claim of ["recovery", "support", "retry", "failed"]) {
        const text = collectText(await ActivatePage(props({ claim }))).join(" ");

        // No identifier, no vocabulary from Etsy or PostgreSQL, and
        // nothing a family could mistake for something to copy.
        for (const forbidden of [
          "buyer_user_id",
          "receipt",
          "entitlement",
          "token",
          "shop_id",
          "oauth",
          "null",
          "undefined",
        ]) {
          expect(text.toLowerCase()).not.toContain(forbidden);
        }
      }
    });
  });
});
