import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Mission 015B — the three Server Actions behind the Admin mutation
 * buttons. What matters here: each reads only `entitlementId` from the
 * form, a `denied` gate becomes a refusal (never an exception, never a
 * silent success), every documented business outcome maps to a sensible
 * message, and the raw key appears in the returned state ONLY on a
 * successful replace.
 */

const { runAdminActivationKeyReplace, runAdminActivationKeyInvalidate, runAdminEntitlementRevoke } =
  vi.hoisted(() => ({
    runAdminActivationKeyReplace: vi.fn(),
    runAdminActivationKeyInvalidate: vi.fn(),
    runAdminEntitlementRevoke: vi.fn(),
  }));

vi.mock("@/lib/admin/admin-session", () => ({
  runAdminActivationKeyReplace,
  runAdminActivationKeyInvalidate,
  runAdminEntitlementRevoke,
}));

const { replaceActivationKeyAction, invalidateActivationKeyAction, revokeEntitlementAction } =
  await import("./actions");

const ENTITLEMENT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function formWith(entitlementId?: string): FormData {
  const data = new FormData();
  if (entitlementId !== undefined) data.set("entitlementId", entitlementId);
  return data;
}

beforeEach(() => {
  runAdminActivationKeyReplace.mockReset();
  runAdminActivationKeyInvalidate.mockReset();
  runAdminEntitlementRevoke.mockReset();
});

describe("replaceActivationKeyAction", () => {
  it("refuses without calling the wiring layer when entitlementId is missing", async () => {
    const state = await replaceActivationKeyAction(
      { status: "idle", message: "" },
      formWith(undefined),
    );

    expect(state.status).toBe("error");
    expect(runAdminActivationKeyReplace).not.toHaveBeenCalled();
  });

  it("passes exactly the submitted entitlementId through", async () => {
    runAdminActivationKeyReplace.mockResolvedValue({
      status: "completed",
      result: { status: "replaced", rawActivationKey: "HH1-AAAAAAAA-AAAAAAAA-AAAAAAAA-AAAAAAAA" },
    });

    await replaceActivationKeyAction({ status: "idle", message: "" }, formWith(ENTITLEMENT_ID));

    expect(runAdminActivationKeyReplace).toHaveBeenCalledExactlyOnceWith(ENTITLEMENT_ID);
  });

  it("surfaces the raw key ONLY on a successful replace", async () => {
    runAdminActivationKeyReplace.mockResolvedValue({
      status: "completed",
      result: { status: "replaced", rawActivationKey: "HH1-AAAAAAAA-AAAAAAAA-AAAAAAAA-AAAAAAAA" },
    });

    const state = await replaceActivationKeyAction(
      { status: "idle", message: "" },
      formWith(ENTITLEMENT_ID),
    );

    expect(state.status).toBe("success");
    expect(state.rawActivationKey).toBe("HH1-AAAAAAAA-AAAAAAAA-AAAAAAAA-AAAAAAAA");
  });

  it("maps a denied gate to a refusal, never an exception", async () => {
    runAdminActivationKeyReplace.mockResolvedValue({ status: "denied" });

    const state = await replaceActivationKeyAction(
      { status: "idle", message: "" },
      formWith(ENTITLEMENT_ID),
    );

    expect(state.status).toBe("refused");
    expect(state).not.toHaveProperty("rawActivationKey");
  });

  it.each([
    ["notFound", "refused"],
    ["notAvailable", "refused"],
  ] as const)("maps result status %s to form status %s, with no raw key", async (resultStatus, formStatus) => {
    runAdminActivationKeyReplace.mockResolvedValue({
      status: "completed",
      result: { status: resultStatus },
    });

    const state = await replaceActivationKeyAction(
      { status: "idle", message: "" },
      formWith(ENTITLEMENT_ID),
    );

    expect(state.status).toBe(formStatus);
    expect(state.rawActivationKey).toBeUndefined();
  });
});

describe("invalidateActivationKeyAction", () => {
  it("passes exactly the submitted entitlementId through", async () => {
    runAdminActivationKeyInvalidate.mockResolvedValue({
      status: "completed",
      result: { status: "invalidated" },
    });

    await invalidateActivationKeyAction({ status: "idle", message: "" }, formWith(ENTITLEMENT_ID));

    expect(runAdminActivationKeyInvalidate).toHaveBeenCalledExactlyOnceWith(ENTITLEMENT_ID);
  });

  it("never carries a raw key — invalidation issues none", async () => {
    runAdminActivationKeyInvalidate.mockResolvedValue({
      status: "completed",
      result: { status: "invalidated" },
    });

    const state = await invalidateActivationKeyAction(
      { status: "idle", message: "" },
      formWith(ENTITLEMENT_ID),
    );

    expect(state.status).toBe("success");
    expect(state).not.toHaveProperty("rawActivationKey");
  });

  it("maps a denied gate to a refusal", async () => {
    runAdminActivationKeyInvalidate.mockResolvedValue({ status: "denied" });

    expect(
      (await invalidateActivationKeyAction({ status: "idle", message: "" }, formWith(ENTITLEMENT_ID)))
        .status,
    ).toBe("refused");
  });
});

describe("revokeEntitlementAction", () => {
  it("passes exactly the submitted entitlementId through", async () => {
    runAdminEntitlementRevoke.mockResolvedValue({ status: "completed", result: { status: "revoked" } });

    await revokeEntitlementAction({ status: "idle", message: "" }, formWith(ENTITLEMENT_ID));

    expect(runAdminEntitlementRevoke).toHaveBeenCalledExactlyOnceWith(ENTITLEMENT_ID);
  });

  it("reports success on revoked", async () => {
    runAdminEntitlementRevoke.mockResolvedValue({ status: "completed", result: { status: "revoked" } });

    const state = await revokeEntitlementAction(
      { status: "idle", message: "" },
      formWith(ENTITLEMENT_ID),
    );

    expect(state.status).toBe("success");
  });

  it("distinguishes a 'redeemed' refusal from a 'revoked' refusal in its message", async () => {
    runAdminEntitlementRevoke.mockResolvedValue({
      status: "completed",
      result: { status: "notAvailable", blockingStatus: "redeemed" },
    });
    const redeemedState = await revokeEntitlementAction(
      { status: "idle", message: "" },
      formWith(ENTITLEMENT_ID),
    );

    runAdminEntitlementRevoke.mockResolvedValue({
      status: "completed",
      result: { status: "notAvailable", blockingStatus: "revoked" },
    });
    const revokedState = await revokeEntitlementAction(
      { status: "idle", message: "" },
      formWith(ENTITLEMENT_ID),
    );

    expect(redeemedState.status).toBe("refused");
    expect(revokedState.status).toBe("refused");
    expect(redeemedState.message).not.toBe(revokedState.message);
  });

  it("maps a denied gate to a refusal", async () => {
    runAdminEntitlementRevoke.mockResolvedValue({ status: "denied" });

    expect(
      (await revokeEntitlementAction({ status: "idle", message: "" }, formWith(ENTITLEMENT_ID))).status,
    ).toBe("refused");
  });
});
