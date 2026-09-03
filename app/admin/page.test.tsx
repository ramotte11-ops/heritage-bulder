import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Mission 015A — the Admin page itself.
 *
 * The environment here is `node` (see vitest.config.ts) and nothing in
 * this repository renders React in a test. What is asserted is what
 * matters and what CAN be asserted without a DOM: who reaches the page
 * at all, and that a refused caller never causes a support read.
 */

const { requireAdminForRequest, runAdminSupportSearch, notFound } = vi.hoisted(() => ({
  requireAdminForRequest: vi.fn(),
  runAdminSupportSearch: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/lib/admin/admin-session", () => ({
  requireAdminForRequest,
  runAdminSupportSearch,
}));
vi.mock("next/navigation", () => ({ notFound }));

const { default: AdminSupportPage } = await import("./page");

function params(searchParams: { kind?: string; q?: string } = {}) {
  return { searchParams: Promise.resolve(searchParams) };
}

describe("AdminSupportPage — the gate", () => {
  beforeEach(() => {
    requireAdminForRequest.mockReset();
    runAdminSupportSearch.mockReset();
    notFound.mockClear();
  });

  // --- a refused caller learns nothing, not even that this page exists
  it("404s for anyone the Admin gate refuses", async () => {
    requireAdminForRequest.mockResolvedValue({ status: "denied" });

    await expect(AdminSupportPage(params({ q: "famille@example.test" }))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(notFound).toHaveBeenCalled();
  });

  it("performs NO support read when the gate refuses", async () => {
    requireAdminForRequest.mockResolvedValue({ status: "denied" });

    await expect(
      AdminSupportPage(params({ kind: "ownerEmail", q: "famille@example.test" })),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(runAdminSupportSearch).not.toHaveBeenCalled();
  });

  it("checks the gate BEFORE reading the query string", async () => {
    requireAdminForRequest.mockResolvedValue({ status: "denied" });

    // A searchParams promise that would blow up if awaited: the gate
    // must have refused before anything touched it.
    const exploding = {
      searchParams: Promise.reject(new Error("searchParams must not be read")),
    } as unknown as { searchParams: Promise<{ kind?: string; q?: string }> };
    // Keep Node from reporting the rejection as unhandled if, as
    // expected, nothing ever awaits it.
    exploding.searchParams.catch(() => {});

    await expect(AdminSupportPage(exploding)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders for staff", async () => {
    requireAdminForRequest.mockResolvedValue({ status: "granted" });

    const page = await AdminSupportPage(params());

    expect(page).toBeTruthy();
    expect(notFound).not.toHaveBeenCalled();
  });
});

describe("AdminSupportPage — what it asks for", () => {
  beforeEach(() => {
    requireAdminForRequest.mockReset().mockResolvedValue({ status: "granted" });
    runAdminSupportSearch.mockReset().mockResolvedValue({
      status: "completed",
      result: { status: "notFound" },
    });
    notFound.mockClear();
  });

  it("runs no search when the form has not been submitted", async () => {
    await AdminSupportPage(params());

    expect(runAdminSupportSearch).not.toHaveBeenCalled();
  });

  it("runs no search for a blank value", async () => {
    for (const q of ["", "   "]) {
      await AdminSupportPage(params({ kind: "ownerEmail", q }));
    }

    expect(runAdminSupportSearch).not.toHaveBeenCalled();
  });

  it("passes the requested mode and value through, unchanged", async () => {
    await AdminSupportPage(params({ kind: "memorialId", q: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }));

    expect(runAdminSupportSearch).toHaveBeenCalledExactlyOnceWith({
      kind: "memorialId",
      value: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    });
  });

  // --- an unknown mode must not silently become a different search
  it("falls back to the default mode for an unknown kind, never to another search", async () => {
    await AdminSupportPage(params({ kind: "'; drop table owners; --", q: "x@example.test" }));

    expect(runAdminSupportSearch).toHaveBeenCalledExactlyOnceWith({
      kind: "ownerEmail",
      value: "x@example.test",
    });
  });

  it("never receives an owner id, a role, or an actor from the URL", async () => {
    await AdminSupportPage(
      params({
        kind: "ownerEmail",
        q: "famille@example.test",
        // Extra parameters an attacker would try. The page's own type
        // ignores them, and this asserts they reach nothing.
        ...({ ownerId: "somebody-else", role: "admin", isHeritageAdmin: "true" } as Record<
          string,
          string
        >),
      }),
    );

    const [call] = runAdminSupportSearch.mock.calls;
    expect(Object.keys(call[0]).sort()).toEqual(["kind", "value"]);
  });

  it("renders the service's own refusal rather than a record, if it ever refuses", async () => {
    runAdminSupportSearch.mockResolvedValue({ status: "denied" });

    const page = await AdminSupportPage(params({ kind: "ownerEmail", q: "a@example.test" }));

    expect(page).toBeTruthy();
  });
});
