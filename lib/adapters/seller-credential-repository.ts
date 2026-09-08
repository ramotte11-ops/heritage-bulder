/**
 * Mission 019B — the contract over `etsy_seller_credentials`.
 *
 * A port rather than direct Supabase calls, for the same reason as every
 * other repository here: the refresh algorithm
 * (lib/integration/etsy/seller-credential.ts) is the part that has to be
 * right under concurrency, and it must be testable without a database.
 *
 * Every method below maps to ONE conditional SQL statement. That is not
 * a stylistic preference — it is the whole safety argument. A method
 * that read and then wrote would reintroduce the race the lease exists
 * to remove, so no method here is allowed to be a read-then-write, and
 * each one's docstring states the predicate it is atomic on.
 *
 * Deliberately no `delete`: the migration grants DELETE to nobody, so a
 * method for it could not work even if someone added one.
 */

/** The stored credential, as every caller of this port sees it. */
export interface SellerCredentialSnapshot {
  refreshToken: string;
  /** Cached; `null` means "no usable access token, refresh first". */
  accessToken: string | null;
  /** ISO 8601. Always set together with `accessToken`, never alone. */
  accessTokenExpiresAt: string | null;
  /** Incremented only when the credential changes — see the migration. */
  credentialVersion: number;
  /** Non-null only while a refresh attempt holds the lease. */
  leaseHolder: string | null;
  /** ISO 8601. */
  leaseExpiresAt: string | null;
}

export type AcquireRefreshLeaseOutcome =
  /** This attempt now holds the lease and is the only one allowed to
   * call Etsy's refresh grant. Carries the credential as it stood at
   * acquisition — `credentialVersion` is what the eventual store must be
   * guarded on. */
  | { status: "acquired"; credential: SellerCredentialSnapshot }
  /** Somebody else holds an unexpired lease. The caller must NOT call
   * Etsy: it waits and re-reads. */
  | { status: "held" }
  /** No credential row exists at all — the store has never been
   * bootstrapped. Never invented here. */
  | { status: "missing" };

export type StoreRefreshedCredentialOutcome =
  | { status: "stored"; credential: SellerCredentialSnapshot }
  /** The guard did not match: the credential moved on while this attempt
   * was talking to Etsy, so what it is holding is no longer the newest.
   * Nothing was written — an older credential must never overwrite a
   * newer one. */
  | { status: "superseded" };

export interface SellerCredentialRepository {
  /** Reads the singleton row, or null when it has never been
   * bootstrapped. */
  read(): Promise<SellerCredentialSnapshot | null>;

  /**
   * Creates the singleton row from a bootstrap seed, and does nothing at
   * all if it already exists.
   *
   * `INSERT ... ON CONFLICT DO NOTHING` on the singleton primary key.
   * This is what guarantees the two properties Mission 019B's brief
   * demands: two concurrent bootstraps cannot create two rows, and a
   * stale environment variable can never overwrite a refresh token the
   * database already holds.
   *
   * Returns whether this call was the one that created the row —
   * informational only; no caller may branch on it for correctness.
   */
  bootstrap(refreshToken: string): Promise<{ created: boolean }>;

  /**
   * Takes the refresh lease, atomically, in one conditional UPDATE:
   *
   *   set lease_holder/lease_expires_at
   *   where singleton and (lease_expires_at is null or lease_expires_at < now)
   *
   * Only one concurrent caller can match. Does NOT touch
   * `credential_version` — a lease is not a credential change.
   */
  acquireRefreshLease(input: {
    leaseHolder: string;
    /** ISO 8601. Now, as the caller sees it. */
    now: string;
    /** ISO 8601. When this lease stops protecting anything. */
    leaseExpiresAt: string;
  }): Promise<AcquireRefreshLeaseOutcome>;

  /**
   * Stores a renewed credential and releases the lease, in one
   * conditional UPDATE guarded on `credential_version = expectedVersion`,
   * which the same statement increments.
   *
   * The guard is the real safety property (see the migration, section C
   * point 4): a slow attempt whose lease expired while another one
   * already published a newer credential finds the version moved and
   * writes nothing.
   */
  storeRefreshedCredential(input: {
    expectedCredentialVersion: number;
    refreshToken: string;
    accessToken: string;
    accessTokenExpiresAt: string;
  }): Promise<StoreRefreshedCredentialOutcome>;

  /**
   * Releases the lease WITHOUT touching the credential — the path taken
   * when the Etsy call failed. Guarded on `lease_holder = leaseHolder`
   * so a late release can never free somebody else's lease.
   */
  releaseRefreshLease(leaseHolder: string): Promise<void>;
}
