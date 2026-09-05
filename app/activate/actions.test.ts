import { describe, expect, it, vi, beforeEach } from "vitest";
import { INITIAL_ACTIVATE_STATE } from "@/lib/entitlement/activate-form-state";

const { runHeritageActivationAttempt } = vi.hoisted(() => ({
  runHeritageActivationAttempt: vi.fn(),
}));
vi.mock("@/lib/entitlement/activation-session", () => ({ runHeritageActivationAttempt }));

const { activateHeritageAccessAction } = await import("./actions");

function formWith(activationKey?: string): FormData {
  const data = new FormData();
  if (activationKey !== undefined) data.set("activationKey", activationKey);
  return data;
}

beforeEach(() => {
  runHeritageActivationAttempt.mockReset();
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

    await activateHeritageAccessAction(INITIAL_ACTIVATE_STATE, formWith("  HH1-KEY  "));

    expect(runHeritageActivationAttempt).toHaveBeenCalledWith("HH1-KEY");
  });

  it.each(["redeemed", "alreadyRedeemed"])("reports success on a %s outcome", async (status) => {
    runHeritageActivationAttempt.mockResolvedValue({
      status: "completed",
      result: { status, memorialId: "memorial-1" },
    });

    const state = await activateHeritageAccessAction(INITIAL_ACTIVATE_STATE, formWith("HH1-KEY"));

    expect(state.status).toBe("success");
  });

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
