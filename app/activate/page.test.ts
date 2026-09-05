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

const { getAuthenticatedUser } = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
}));
vi.mock("@/lib/supabase/session", () => ({ getAuthenticatedUser }));

const { default: ActivatePage } = await import("./page");
const { LoginForm } = await import("@/components/auth/LoginForm");
const { ActivateForm } = await import("@/components/activate/ActivateForm");

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
  });

  it("renders the Magic Link form, not the activation form, when signed out", async () => {
    getAuthenticatedUser.mockResolvedValue(null);

    const page = await ActivatePage();

    expect(treeIncludesType(page, LoginForm)).toBe(true);
    expect(treeIncludesType(page, ActivateForm)).toBe(false);
  });

  it("asks the Magic Link form to return to /activate", async () => {
    getAuthenticatedUser.mockResolvedValue(null);

    const page = await ActivatePage();

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

    const page = await ActivatePage();

    expect(treeIncludesType(page, ActivateForm)).toBe(true);
    expect(treeIncludesType(page, LoginForm)).toBe(false);
  });
});
