import { describe, expect, it, vi, beforeEach } from "vitest";
import { INITIAL_ACTIVATE_STATE } from "@/lib/entitlement/activate-form-state";

const { runHeritageActivationAttempt, startEtsyClaim, redirect } = vi.hoisted(() => ({
  runHeritageActivationAttempt: vi.fn(),
  startEtsyClaim: vi.fn(),
  // Next's redirect() signals by throwing, and every caller here relies
  // on that: nothing may run after it. The mock reproduces the throw so
  // a test would fail loudly if the action ever kept going.
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/entitlement/activation-session", () => ({ runHeritageActivationAttempt }));
vi.mock("@/lib/integration/etsy/etsy-session", () => ({ startEtsyClaim }));
vi.mock("next/navigation", () => ({ redirect }));

const { activateHeritageAccessAction, startEtsyClaimAction } = await import("./actions");

function formWith(activationKey?: string): FormData {
  const data = new FormData();
  if (activationKey !== undefined) data.set("activationKey", activationKey);
  return data;
}

beforeEach(() => {
  runHeritageActivationAttempt.mockReset();
  startEtsyClaim.mockReset();
  redirect.mockClear();
});

describe("activateHeritageAccessAction", () => {
  it("refuses an empty key WITHOUT calling the wiring layer at all", async () => {
    const state = await activateHeritageAccessAction(INITIAL_ACTIVATE_STATE, formWith(""));

    expect(state.status).toBe("error");
    expect(runHeritageActivationAttempt).not.toHaveBeenCalled();
  });

  it("refuses a missing field the same way", async () => {
    const state = await activateHeritageAccessAction(INITIAL_ACTIVATE_STATE, formWith(undefined));

    expect(state.status).toBe("error");
    expect(runHeritageActivationAttempt).not.toHaveBeenCalled();
  });

  it("passes the raw key through exactly as submitted, trimmed of surrounding whitespace", async () => {
    runHeritageActivationAttempt.mockResolvedValue({
      status: "completed",
      result: { status: "redeemed", memorialId: "memorial-1" },
    });

    await expect(
      activateHeritageAccessAction(INITIAL_ACTIVATE_STATE, formWith("  HH1-KEY  ")),
    ).rejects.toThrow(/NEXT_REDIRECT/);

    expect(runHeritageActivationAttempt).toHaveBeenCalledWith("HH1-KEY");
  });

  // Mission 019B — the maillon that was missing. A successful activation
  // used to end on a sentence promising the editor "in a later step"; the
  // memorial it had just created was unreachable.
  it.each(["redeemed", "alreadyRedeemed"])(
    "redirects a %s outcome straight into the Builder",
    async (status) => {
      runHeritageActivationAttempt.mockResolvedValue({
        status: "completed",
        result: { status, memorialId: "memorial-1" },
      });

      await expect(
        activateHeritageAccessAction(INITIAL_ACTIVATE_STATE, formWith("HH1-KEY")),
      ).rejects.toThrow(/NEXT_REDIRECT/);

      // Both outcomes land on the SAME memorial: re-submitting a key one
      // has already used is somebody looking for their memorial, not an
      // error, and never a second memorial.
      expect(redirect).toHaveBeenCalledWith("/builder/memorial-1");
    },
  );

  it("maps a rate-limited outcome to a distinct, still-generic message", async () => {
    runHeritageActivationAttempt.mockResolvedValue({
      status: "completed",
      result: { status: "rateLimited", retryAfterSeconds: 400 },
    });

    const state = await activateHeritageAccessAction(INITIAL_ACTIVATE_STATE, formWith("HH1-KEY"));

    expect(state.status).toBe("error");
    // The rate-limit message never reveals a duration derived from server
    // internals, and never anything about the key's own validity.
    expect(state.message).not.toContain("400");
  });

  it("maps every other refusal to the same generic failure message", async () => {
    runHeritageActivationAttempt.mockResolvedValue({
      status: "completed",
      result: { status: "failed" },
    });

    const state = await activateHeritageAccessAction(INITIAL_ACTIVATE_STATE, formWith("HH1-KEY"));

    expect(state.status).toBe("error");
    expect(state.message).toMatch(/n'avons pas pu confirmer/i);
  });

  it("refuses an unauthenticated caller with the same generic message, never a session hint", async () => {
    runHeritageActivationAttempt.mockResolvedValue({ status: "unauthenticated" });

    const state = await activateHeritageAccessAction(INITIAL_ACTIVATE_STATE, formWith("HH1-KEY"));

    expect(state.status).toBe("error");
    expect(state.message).toMatch(/n'avons pas pu confirmer/i);
  });

  it("never echoes the submitted key back into the returned state", async () => {
    runHeritageActivationAttempt.mockResolvedValue({
      status: "completed",
      result: { status: "failed" },
    });

    const rawKey = "HH1-SUPERSECRETVALUE-AAAAAAAA-AAAAAAAA-AAAAAAAA";
    const state = await activateHeritageAccessAction(INITIAL_ACTIVATE_STATE, formWith(rawKey));

    expect(JSON.stringify(state)).not.toContain(rawKey);
  });
});

describe("startEtsyClaimAction", () => {
  it("sends the family to the URL the server built, and nothing else", async () => {
    startEtsyClaim.mockResolvedValue({
      status: "redirect",
      authorizationUrl: "https://www.etsy.com/oauth/connect?state=abc",
    });

    await expect(startEtsyClaimAction()).rejects.toThrow(/NEXT_REDIRECT/);

    expect(redirect).toHaveBeenCalledWith("https://www.etsy.com/oauth/connect?state=abc");
  });

  it("takes nothing from the caller — the wiring is invoked with no arguments", async () => {
    startEtsyClaim.mockResolvedValue({ status: "unavailable" });

    // The action declares no parameter, so a submitted field cannot
    // reach it even in principle: React calls it with (prevState,
    // formData) and both are discarded. This asserts the consequence —
    // the shop, redirect URI and identity come from the server alone.
    await startEtsyClaimAction();

    expect(startEtsyClaim).toHaveBeenCalledWith();
  });

  it.each(["unauthenticated", "unavailable"])(
    "collapses a %s outcome into one calm message, never a redirect",
    async (status) => {
      startEtsyClaim.mockResolvedValue({ status });

      const state = await startEtsyClaimAction();

      expect(state.status).toBe("error");
      expect(redirect).not.toHaveBeenCalled();
      // Never "you are not signed in" versus "Etsy is not configured":
      // one is unreachable from the rendered page, the other is an
      // operator's problem, and neither is a family's business.
      expect(state.message).toMatch(/n'est pas disponible/i);
    },
  );
});
