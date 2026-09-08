import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Mission 019B — the return leg of the Etsy handshake.
 *
 * What is asserted here is mostly about what does NOT travel. This route
 * is the one place where values from Etsy, from Supabase and from the
 * family's own session meet a URL the browser will display, keep in its
 * history, and send as a `Referer` to whatever loads next.
 */

const { completeEtsyClaim } = vi.hoisted(() => ({ completeEtsyClaim: vi.fn() }));
vi.mock("@/lib/integration/etsy/etsy-session", () => ({ completeEtsyClaim }));

const { GET } = await import("./route");

const ORIGIN = "https://heritage.test";

function request(query: string): Request {
  return new Request(`${ORIGIN}/api/etsy/callback${query}`);
}

function locationOf(response: Response): string {
  return response.headers.get("location") ?? "";
}

beforeEach(() => {
  completeEtsyClaim.mockReset();
});

describe("success", () => {
  it("sends the family straight into their memorial", async () => {
    completeEtsyClaim.mockResolvedValue({ status: "claimed", memorialId: "memorial-1" });

    const response = await GET(request("?code=abc&state=xyz"));

    expect(locationOf(response)).toBe(`${ORIGIN}/builder/memorial-1`);
  });

  it("carries nothing but the memorial id into the Builder URL", async () => {
    completeEtsyClaim.mockResolvedValue({ status: "claimed", memorialId: "memorial-1" });

    const location = locationOf(await GET(request("?code=SECRETCODE&state=STATEVALUE")));

    expect(location).not.toContain("SECRETCODE");
    expect(location).not.toContain("STATEVALUE");
    expect(location).not.toContain("?");
  });
});

describe("the four generic notices, and nothing else", () => {
  it.each([
    ["noMatchingPurchase", "recovery"],
    ["multiplePurchases", "support"],
    ["purchaseNotEligible", "support"],
    ["etsyUnavailable", "retry"],
    ["rateLimited", "retry"],
    ["unauthenticated", "failed"],
    ["handshakeRejected", "failed"],
    ["failed", "failed"],
  ])("maps %s to ?claim=%s on /activate", async (status, notice) => {
    completeEtsyClaim.mockResolvedValue({ status });

    const location = locationOf(await GET(request("?code=abc&state=xyz")));

    expect(location).toBe(`${ORIGIN}/activate?claim=${notice}`);
  });

  it("routes a guest checkout to the recovery notice, which is what unfolds the key form", async () => {
    // A guest receipt carries no buyer id, so the claim finds no match —
    // and this is the only route by which such a family reaches the
    // activation-key path.
    completeEtsyClaim.mockResolvedValue({ status: "noMatchingPurchase" });

    expect(locationOf(await GET(request("?code=abc&state=xyz")))).toBe(
      `${ORIGIN}/activate?claim=recovery`,
    );
  });
});

describe("nothing technical ever reaches the URL", () => {
  it("never echoes the OAuth code or state on a refusal", async () => {
    completeEtsyClaim.mockResolvedValue({ status: "handshakeRejected" });

    const location = locationOf(
      await GET(request("?code=ONE-TIME-CODE&state=THE-STATE&error=access_denied")),
    );

    expect(location).not.toContain("ONE-TIME-CODE");
    expect(location).not.toContain("THE-STATE");
    expect(location).not.toContain("access_denied");
  });

  it("never carries an identifier of any kind", async () => {
    completeEtsyClaim.mockResolvedValue({ status: "purchaseNotEligible" });

    const location = locationOf(await GET(request("?code=abc&state=xyz")));

    for (const forbidden of [
      "buyer",
      "receipt",
      "entitlement",
      "order",
      "token",
      "shop",
      "owner",
      "memorial",
    ]) {
      expect(location.toLowerCase()).not.toContain(forbidden);
    }
  });

  it("passes the query values to the session layer untouched, and reads nothing else", async () => {
    completeEtsyClaim.mockResolvedValue({ status: "failed" });

    await GET(request("?code=abc&state=xyz&next=/somewhere&shop_id=999"));

    // Only `code` and `state` are read. A `next` parameter would be an
    // open-redirect vector, and this route deliberately has no such
    // concept: its destinations are two fixed internal paths.
    expect(completeEtsyClaim).toHaveBeenCalledWith({ code: "abc", state: "xyz" });
  });

  it("treats a callback with no parameters at all as an ordinary refusal", async () => {
    completeEtsyClaim.mockResolvedValue({ status: "handshakeRejected" });

    const response = await GET(request(""));

    expect(completeEtsyClaim).toHaveBeenCalledWith({ code: null, state: null });
    expect(locationOf(response)).toBe(`${ORIGIN}/activate?claim=failed`);
  });
});

describe("an unexpected failure is still a calm ending", () => {
  it("redirects rather than surfacing a thrown error", async () => {
    completeEtsyClaim.mockRejectedValue(new Error("supabase: connection string leaked here"));

    const location = locationOf(await GET(request("?code=abc&state=xyz")));

    expect(location).toBe(`${ORIGIN}/activate?claim=failed`);
    expect(location).not.toContain("supabase");
    expect(location).not.toContain("connection");
  });
});
