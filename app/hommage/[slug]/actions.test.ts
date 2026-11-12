import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * QG 016 — l'action serveur de la page publique : validation du slug,
 * délégation au module C1, réponse booléenne seulement, jamais de raison.
 */
vi.mock("server-only", () => ({}));
const { recordSymbolicOfferingOnServer } = vi.hoisted(() => ({ recordSymbolicOfferingOnServer: vi.fn() }));
vi.mock("@/lib/memorial/symbolic-offerings/server-record-symbolic-offering", () => ({ recordSymbolicOfferingOnServer }));

const { depositSymbolicOffering } = await import("./actions");

const SLUG = "d7f78a1b1b16";
const KEY = "4f1d2c3b-5a6e-4f70-8a9b-0c1d2e3f4a5b";

afterEach(() => vi.clearAllMocks());

describe("depositSymbolicOffering (Server Action)", () => {
  it("a forged slug is refused before any server call", async () => {
    for (const slug of [null, 42, "", "jeanne-test", "D7F78A1B1B16", "d7f78a1b1b1", "../builder", `${SLUG}/x`]) {
      expect(await depositSymbolicOffering(slug, "bougie", KEY)).toBe(false);
    }
    expect(recordSymbolicOfferingOnServer).not.toHaveBeenCalled();
  });

  it("forwards slug, gesture and key untouched to the C1 module (which validates them) and answers its boolean", async () => {
    recordSymbolicOfferingOnServer.mockResolvedValueOnce({ ok: true });
    expect(await depositSymbolicOffering(SLUG, "lys", KEY)).toBe(true);
    expect(recordSymbolicOfferingOnServer).toHaveBeenCalledWith({ slug: SLUG, kind: "lys", idempotencyKey: KEY });
  });

  it.each(["invalid", "refused", "rate_limited"] as const)("a %s outcome is a plain false, with no reason leaked and nothing logged", async (reason) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    recordSymbolicOfferingOnServer.mockResolvedValueOnce({ ok: false, reason });
    const answer = await depositSymbolicOffering(SLUG, "coeur", KEY);
    expect(answer).toBe(false);
    expect(typeof answer).toBe("boolean");
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("an infrastructure error is false for the visitor and logged server-side without visitor data", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    recordSymbolicOfferingOnServer.mockResolvedValueOnce({ ok: false, reason: "error" });
    expect(await depositSymbolicOffering(SLUG, "bougie", KEY)).toBe(false);
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0])).not.toContain(SLUG);
    expect(String(log.mock.calls[0])).not.toContain(KEY);
    log.mockRestore();
  });
});
