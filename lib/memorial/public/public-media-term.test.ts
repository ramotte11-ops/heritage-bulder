import { describe, expect, it, vi } from "vitest";
import { signPublicStorageRead } from "./public-media-term";

const DEADLINE = Date.parse("2036-11-28T12:00:00.123Z");
const EXP = Math.floor(DEADLINE / 1000);

function signedUrl(exp: number) {
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  return `https://storage.test/object/sign/image.webp?token=header.${payload}.signature`;
}

function setup(now: () => number, completeUntil: string | null | undefined = new Date(DEADLINE).toISOString()) {
  const rpc = vi.fn(async () => ({ data: [{ complete_until: completeUntil }], error: null }));
  const sign = vi.fn<(ttl?: number) => Promise<string>>(async () => signedUrl(EXP));
  const issue = () => signPublicStorageRead({ client: { rpc } as never, slug: "synthetic", sign, now });
  return { rpc, sign, issue };
}

describe("public Storage signatures", () => {
  it("caps the relative duration conservatively and keeps the normal 300-second limit", async () => {
    const near = setup(() => DEADLINE - 2_500);
    expect(await near.issue()).toBe(signedUrl(EXP));
    expect(near.sign).toHaveBeenCalledWith(2);
    const far = setup(() => DEADLINE - 400_000);
    expect(await far.issue()).toBe(signedUrl(EXP));
    expect(far.sign).toHaveBeenCalledWith(300);
  });

  it.each([-1, 0, 1])("never requests a signature %i ms from the deadline", async (offset) => {
    const { issue, sign } = setup(() => DEADLINE + offset);
    expect(await issue()).toBeNull();
    expect(sign).not.toHaveBeenCalled();
  });

  it("checks the clock after the fresh RPC and discards a late provider response", async () => {
    let now = DEADLINE - 5_000;
    const delayedAuthorization = setup(() => now);
    delayedAuthorization.rpc.mockImplementationOnce(async () => {
      now = DEADLINE;
      return { data: [{ complete_until: new Date(DEADLINE).toISOString() }], error: null };
    });
    expect(await delayedAuthorization.issue()).toBeNull();
    expect(delayedAuthorization.sign).not.toHaveBeenCalled();

    now = DEADLINE - 5_000;
    const delayedStorage = setup(() => now);
    delayedStorage.sign.mockImplementationOnce(async () => {
      now = DEADLINE;
      return signedUrl(EXP);
    });
    expect(await delayedStorage.issue()).toBeNull();
  });

  it("withholds opaque or overlong tokens and refuses a fresh empty RPC result", async () => {
    const { rpc, sign, issue } = setup(() => DEADLINE - 5_000);
    sign.mockResolvedValueOnce(signedUrl(EXP + 1)).mockResolvedValueOnce("https://storage.test/no-token");
    expect(await issue()).toBeNull();
    expect(await issue()).toBeNull();
    rpc.mockResolvedValueOnce({ data: [], error: null });
    expect(await issue()).toBeNull();
    expect(sign).toHaveBeenCalledTimes(2);
  });

  it("keeps the default signer for a visible homage without a premium term", async () => {
    const { sign, issue } = setup(() => DEADLINE, null);
    expect(await issue()).toBe(signedUrl(EXP));
    expect(sign).toHaveBeenCalledWith();
  });
});
