import { describe, expect, it, vi } from "vitest";
import type {
  AcquireRefreshLeaseOutcome,
  SellerCredentialRepository,
  SellerCredentialSnapshot,
  StoreRefreshedCredentialOutcome,
} from "@/lib/adapters/seller-credential-repository";
import {
  getSellerAccessToken,
  type EtsyRefreshedTokens,
  type SellerCredentialDeps,
} from "./seller-credential";

/**
 * Mission 019B — the credential store's concurrency contract.
 *
 * The stake is specific and unforgiving: Etsy's refresh grant returns a
 * NEW refresh token and REVOKES the one used. So two processes
 * refreshing at once do not merely duplicate work — one of the two
 * resulting credentials is dead, and if the wrong one is kept the whole
 * Etsy channel stops until somebody re-bootstraps it by hand.
 *
 * These tests therefore assert behaviour under simultaneity, not just
 * the happy path.
 *
 * ## How the fake reproduces the real atomicity
 *
 * Each repository method mutates the store SYNCHRONOUSLY, with no await
 * in the middle. Under Node's single-threaded loop that makes each one
 * indivisible with respect to the others — which is exactly the property
 * the real implementation gets from expressing each method as one
 * conditional SQL statement. A fake that read, awaited, then wrote would
 * be testing a different program.
 */

const NOW = new Date("2026-09-07T12:00:00.000Z");

interface StoreState {
  row: {
    refreshToken: string;
    accessToken: string | null;
    accessTokenExpiresAt: string | null;
    credentialVersion: number;
    leaseHolder: string | null;
    leaseExpiresAt: string | null;
  } | null;
}

function fakeRepository(initial: StoreState["row"] = null) {
  const state: StoreState = { row: initial };
  const calls = { bootstrap: 0, acquire: 0, store: 0, release: 0 };

  const snapshot = (): SellerCredentialSnapshot => ({ ...state.row! });

  const repository: SellerCredentialRepository = {
    async read() {
      return state.row ? snapshot() : null;
    },

    async bootstrap(refreshToken: string) {
      calls.bootstrap += 1;
      // INSERT ... ON CONFLICT DO NOTHING: never an update, so a stale
      // seed can never overwrite what is already stored.
      if (state.row) return { created: false };
      state.row = {
        refreshToken,
        accessToken: null,
        accessTokenExpiresAt: null,
        credentialVersion: 1,
        leaseHolder: null,
        leaseExpiresAt: null,
      };
      return { created: true };
    },

    async acquireRefreshLease({ leaseHolder, now, leaseExpiresAt }) {
      calls.acquire += 1;
      if (!state.row) return { status: "missing" } as AcquireRefreshLeaseOutcome;

      const free =
        state.row.leaseExpiresAt === null ||
        Date.parse(state.row.leaseExpiresAt) < Date.parse(now);
      if (!free) return { status: "held" };

      state.row.leaseHolder = leaseHolder;
      state.row.leaseExpiresAt = leaseExpiresAt;
      return { status: "acquired", credential: snapshot() };
    },

    async storeRefreshedCredential({
      expectedCredentialVersion,
      refreshToken,
      accessToken,
      accessTokenExpiresAt,
    }) {
      calls.store += 1;
      if (!state.row) return { status: "superseded" } as StoreRefreshedCredentialOutcome;
      // The compare-and-swap. An attempt holding an older version writes
      // nothing at all.
      if (state.row.credentialVersion !== expectedCredentialVersion) {
        return { status: "superseded" };
      }

      state.row = {
        refreshToken,
        accessToken,
        accessTokenExpiresAt,
        credentialVersion: expectedCredentialVersion + 1,
        leaseHolder: null,
        leaseExpiresAt: null,
      };
      return { status: "stored", credential: snapshot() };
    },

    async releaseRefreshLease(leaseHolder: string) {
      calls.release += 1;
      // Guarded on the holder: a late release never frees somebody
      // else's lease. Touches no credential column.
      if (state.row && state.row.leaseHolder === leaseHolder) {
        state.row.leaseHolder = null;
        state.row.leaseExpiresAt = null;
      }
    },
  };

  return { repository, state, calls };
}

function storedRow(overrides: Partial<NonNullable<StoreState["row"]>> = {}) {
  return {
    refreshToken: "refresh-0",
    accessToken: null,
    accessTokenExpiresAt: null,
    credentialVersion: 1,
    leaseHolder: null,
    leaseExpiresAt: null,
    ...overrides,
  };
}

function deps(
  repository: SellerCredentialRepository,
  overrides: Partial<SellerCredentialDeps> = {},
): SellerCredentialDeps {
  let leaseCounter = 0;
  return {
    repository,
    refreshWithEtsy: vi.fn(
      async (refreshToken: string): Promise<EtsyRefreshedTokens> => ({
        accessToken: `access-from-${refreshToken}`,
        refreshToken: `${refreshToken}-next`,
        expiresInSeconds: 3600,
      }),
    ),
    bootstrapRefreshToken: null,
    now: () => NOW,
    newLeaseHolderId: () => `lease-${(leaseCounter += 1)}`,
    // Real elapsed time, so a loser genuinely gives the winner a chance
    // to finish rather than spinning through its attempts inside one
    // microtask batch.
    wait: () => new Promise((resolve) => setTimeout(resolve, 10)),
    ...overrides,
  };
}

describe("bootstrap", () => {
  it("seeds an empty store from the environment value", async () => {
    const { repository, state } = fakeRepository(null);

    const result = await getSellerAccessToken(
      deps(repository, { bootstrapRefreshToken: "seed-refresh" }),
    );

    expect(result).toEqual({ status: "ready", accessToken: "access-from-seed-refresh" });
    expect(state.row?.refreshToken).toBe("seed-refresh-next");
  });

  it("refuses when there is neither a stored credential nor a seed", async () => {
    const { repository, calls } = fakeRepository(null);

    const result = await getSellerAccessToken(deps(repository));

    expect(result).toEqual({ status: "unavailable", reason: "notBootstrapped" });
    expect(calls.acquire).toBe(0);
  });

  it("NEVER lets a stale environment value overwrite a newer stored token", async () => {
    // The whole reason the store exists. The database already holds a
    // token obtained by a previous refresh; the env var still carries
    // the original seed, long since revoked by Etsy.
    const { repository, state } = fakeRepository(storedRow({ refreshToken: "refresh-current" }));
    const refreshWithEtsy = vi.fn(async (refreshToken: string) => ({
      accessToken: "access-1",
      refreshToken: `${refreshToken}-next`,
      expiresInSeconds: 3600,
    }));

    await getSellerAccessToken(
      deps(repository, { bootstrapRefreshToken: "seed-long-since-revoked", refreshWithEtsy }),
    );

    // Etsy was called with the STORED token, never the seed.
    expect(refreshWithEtsy).toHaveBeenCalledWith("refresh-current");
    expect(state.row?.refreshToken).toBe("refresh-current-next");
  });
});

describe("the cached access token", () => {
  it("is used as-is when still comfortably valid — no refresh, no rotation", async () => {
    const { repository, calls } = fakeRepository(
      storedRow({
        accessToken: "access-cached",
        accessTokenExpiresAt: new Date(NOW.getTime() + 30 * 60_000).toISOString(),
      }),
    );
    const d = deps(repository);

    const result = await getSellerAccessToken(d);

    expect(result).toEqual({ status: "ready", accessToken: "access-cached" });
    expect(d.refreshWithEtsy).not.toHaveBeenCalled();
    expect(calls.acquire).toBe(0);
  });

  it("is refreshed exactly once when expired", async () => {
    const { repository, calls } = fakeRepository(
      storedRow({
        accessToken: "access-old",
        accessTokenExpiresAt: new Date(NOW.getTime() - 1_000).toISOString(),
      }),
    );
    const d = deps(repository);

    const result = await getSellerAccessToken(d);

    expect(result).toEqual({ status: "ready", accessToken: "access-from-refresh-0" });
    expect(d.refreshWithEtsy).toHaveBeenCalledTimes(1);
    expect(calls.store).toBe(1);
  });

  it("is refreshed while it is still technically valid but about to lapse", async () => {
    // A token with twenty seconds left is useless: the request it would
    // sign may arrive after it dies.
    const { repository } = fakeRepository(
      storedRow({
        accessToken: "access-nearly-dead",
        accessTokenExpiresAt: new Date(NOW.getTime() + 20_000).toISOString(),
      }),
    );
    const d = deps(repository);

    await getSellerAccessToken(d);

    expect(d.refreshWithEtsy).toHaveBeenCalledTimes(1);
  });

  it("treats an unreadable expiry as expired rather than trusting the token", async () => {
    const { repository } = fakeRepository(
      storedRow({ accessToken: "access-x", accessTokenExpiresAt: "not-a-date" }),
    );
    const d = deps(repository);

    await getSellerAccessToken(d);

    expect(d.refreshWithEtsy).toHaveBeenCalledTimes(1);
  });
});

describe("concurrency", () => {
  it("calls Etsy ONCE when several instances need a token simultaneously", async () => {
    const { repository, calls } = fakeRepository(storedRow());

    let inFlight = 0;
    let maxInFlight = 0;
    const refreshWithEtsy = vi.fn(async (refreshToken: string) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      // Yield, so any other caller that was going to reach Etsy would
      // do so while this one is still waiting.
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return { accessToken: "access-1", refreshToken: `${refreshToken}-next`, expiresInSeconds: 3600 };
    });

    const results = await Promise.all(
      Array.from({ length: 8 }, () => getSellerAccessToken(deps(repository, { refreshWithEtsy }))),
    );

    // The property that matters: one rotation, not eight.
    expect(refreshWithEtsy).toHaveBeenCalledTimes(1);
    expect(maxInFlight).toBe(1);
    expect(calls.store).toBe(1);

    // And every caller still got a usable token.
    for (const result of results) {
      expect(result).toEqual({ status: "ready", accessToken: "access-1" });
    }
  });

  it("a loser never calls Etsy — it waits and reads the winner's result", async () => {
    // A lease already held by somebody else, unexpired.
    const { repository } = fakeRepository(
      storedRow({
        leaseHolder: "someone-else",
        leaseExpiresAt: new Date(NOW.getTime() + 20_000).toISOString(),
      }),
    );

    let waited = 0;
    const d = deps(repository, {
      wait: async () => {
        waited += 1;
        // The winner publishes while we are waiting.
        if (waited === 1) {
          repository.storeRefreshedCredential({
            expectedCredentialVersion: 1,
            refreshToken: "refresh-1",
            accessToken: "access-from-winner",
            accessTokenExpiresAt: new Date(NOW.getTime() + 3600_000).toISOString(),
          });
        }
      },
    });

    const result = await getSellerAccessToken(d);

    expect(result).toEqual({ status: "ready", accessToken: "access-from-winner" });
    // The decisive assertion: the loser never touched the refresh grant
    // with the shared refresh token.
    expect(d.refreshWithEtsy).not.toHaveBeenCalled();
  });

  it("recovers a lease left behind by a crashed instance", async () => {
    const { repository } = fakeRepository(
      storedRow({
        leaseHolder: "crashed-instance",
        // Already elapsed: the holder died mid-refresh.
        leaseExpiresAt: new Date(NOW.getTime() - 1_000).toISOString(),
      }),
    );
    const d = deps(repository);

    const result = await getSellerAccessToken(d);

    expect(result.status).toBe("ready");
    expect(d.refreshWithEtsy).toHaveBeenCalledTimes(1);
  });

  it("never lets an older credential overwrite a newer one", async () => {
    const { repository, state } = fakeRepository(storedRow());

    // A slow winner: while it is at Etsy, another attempt publishes a
    // newer credential and advances the version.
    const refreshWithEtsy = vi.fn(async () => {
      await repository.storeRefreshedCredential({
        expectedCredentialVersion: 1,
        refreshToken: "refresh-from-the-other-attempt",
        accessToken: "access-newer",
        accessTokenExpiresAt: new Date(NOW.getTime() + 3600_000).toISOString(),
      });
      return {
        accessToken: "access-stale",
        refreshToken: "refresh-stale",
        expiresInSeconds: 3600,
      };
    });

    const result = await getSellerAccessToken(deps(repository, { refreshWithEtsy }));

    // The stale write matched nothing, and the newer credential stands.
    expect(state.row?.refreshToken).toBe("refresh-from-the-other-attempt");
    expect(state.row?.credentialVersion).toBe(2);
    // The caller is handed the NEWER token, not its own stale one.
    expect(result).toEqual({ status: "ready", accessToken: "access-newer" });
  });

  it("uses a token another attempt published between acquiring the lease and refreshing", async () => {
    const { repository } = fakeRepository(storedRow());
    const d = deps(repository);

    // Publish while the lease is being taken.
    // Published BEFORE our acquisition completes, which is the only
    // ordering that can really happen: whoever publishes has to have
    // held the lease, and we could not have taken it while they did. The
    // snapshot our own acquisition returns therefore already carries
    // their token.
    const original = repository.acquireRefreshLease.bind(repository);
    repository.acquireRefreshLease = async (input) => {
      await repository.storeRefreshedCredential({
        expectedCredentialVersion: 1,
        refreshToken: "refresh-1",
        accessToken: "access-published-meanwhile",
        accessTokenExpiresAt: new Date(NOW.getTime() + 3600_000).toISOString(),
      });
      return original(input);
    };

    const result = await getSellerAccessToken(d);

    // Spending a rotation when a perfectly good token already exists is
    // the behaviour that makes rotation dangerous. It does not happen.
    expect(d.refreshWithEtsy).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "ready", accessToken: "access-published-meanwhile" });
  });
});

describe("failure is closed, and never destructive", () => {
  it("leaves the stored credential untouched when Etsy refuses", async () => {
    const { repository, state, calls } = fakeRepository(storedRow());

    const result = await getSellerAccessToken(
      deps(repository, {
        refreshWithEtsy: vi.fn(async () => {
          throw new Error("etsy said no");
        }),
      }),
    );

    expect(result).toEqual({ status: "unavailable", reason: "refreshFailed" });
    // Nothing written, and the lease handed back so the next attempt is
    // not blocked by this failure.
    expect(state.row?.refreshToken).toBe("refresh-0");
    expect(state.row?.credentialVersion).toBe(1);
    expect(state.row?.leaseHolder).toBeNull();
    expect(calls.store).toBe(0);
  });

  it("does not retry the refresh grant with the token Etsy just refused", async () => {
    const { repository } = fakeRepository(storedRow());
    const refreshWithEtsy = vi.fn(async () => {
      throw new Error("etsy said no");
    });

    await getSellerAccessToken(deps(repository, { refreshWithEtsy }));

    // Retrying could rotate on the second attempt and lose the result of
    // the first — one attempt, then fail closed.
    expect(refreshWithEtsy).toHaveBeenCalledTimes(1);
  });

  it("gives up as `busy` rather than forcing its way past a held lease", async () => {
    const { repository } = fakeRepository(
      storedRow({
        leaseHolder: "someone-else",
        leaseExpiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
      }),
    );
    const d = deps(repository);

    const result = await getSellerAccessToken(d);

    expect(result).toEqual({ status: "unavailable", reason: "busy" });
    expect(d.refreshWithEtsy).not.toHaveBeenCalled();
  });

  it("refuses rather than re-seeding when the row disappears mid-flight", async () => {
    const { repository, state } = fakeRepository(storedRow());
    const d = deps(repository, { bootstrapRefreshToken: "seed-revoked" });

    const original = repository.acquireRefreshLease.bind(repository);
    repository.acquireRefreshLease = async (input) => {
      state.row = null;
      return original(input);
    };

    const result = await getSellerAccessToken(d);

    // Re-bootstrapping here could resurrect a revoked token over a
    // deliberate reset.
    expect(result).toEqual({ status: "unavailable", reason: "notBootstrapped" });
    expect(d.refreshWithEtsy).not.toHaveBeenCalled();
  });

  it("never puts a token, a seed or an Etsy error into its result", async () => {
    const { repository } = fakeRepository(storedRow({ refreshToken: "refresh-SECRET" }));

    const result = await getSellerAccessToken(
      deps(repository, {
        bootstrapRefreshToken: "seed-SECRET",
        refreshWithEtsy: vi.fn(async () => {
          throw new Error("invalid_grant: refresh-SECRET is revoked");
        }),
      }),
    );

    const serialised = JSON.stringify(result);
    expect(serialised).not.toContain("SECRET");
    expect(serialised).not.toContain("invalid_grant");
    expect(serialised).toBe(JSON.stringify({ status: "unavailable", reason: "refreshFailed" }));
  });
});
