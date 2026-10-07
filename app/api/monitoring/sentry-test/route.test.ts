import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { captureException, flush } = vi.hoisted(() => ({
  captureException: vi.fn(),
  flush: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({ captureException, flush }));

const { POST } = await import("./route");

function request(token?: string): Request {
  return new Request("https://heritage.test/api/monitoring/sentry-test", {
    method: "POST",
    headers: token ? { "x-heritage-sentry-test-token": token } : undefined,
  });
}

beforeEach(() => {
  vi.stubEnv("SENTRY_DSN", "https://public@example.ingest.sentry.io/1");
  vi.stubEnv("SENTRY_TEST_TOKEN", "test-secret");
  captureException.mockReset().mockReturnValue("event-123");
  flush.mockReset().mockResolvedValue(true);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("controlled Sentry verification route", () => {
  it.each([undefined, "wrong-secret"])("looks absent without the exact test token", async (token) => {
    const response = await POST(request(token));

    expect(response.status).toBe(404);
    expect(captureException).not.toHaveBeenCalled();
  });

  it("looks absent when the test gate is not configured", async () => {
    vi.stubEnv("SENTRY_TEST_TOKEN", "");

    expect((await POST(request("test-secret"))).status).toBe(404);
  });

  it("captures one named error and waits for delivery", async () => {
    const response = await POST(request("test-secret"));

    expect(response.status).toBe(202);
    expect(captureException).toHaveBeenCalledOnce();
    expect(captureException.mock.calls[0]?.[0]).toMatchObject({
      message: "HeritageSentryVerificationError",
    });
    expect(flush).toHaveBeenCalledWith(2_000);
    expect(await response.json()).toEqual({ eventId: "event-123", delivered: true });
  });

  it("reports a delivery failure without exposing error details", async () => {
    flush.mockResolvedValue(false);

    const response = await POST(request("test-secret"));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ eventId: "event-123", delivered: false });
  });
});
