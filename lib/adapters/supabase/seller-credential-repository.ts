import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AcquireRefreshLeaseOutcome,
  SellerCredentialRepository,
  SellerCredentialSnapshot,
  StoreRefreshedCredentialOutcome,
} from "@/lib/adapters/seller-credential-repository";

/**
 * SERVER ONLY. Mission 019B — `etsy_seller_credentials`.
 *
 * The migration grants this table to `service_role` alone and to no
 * client role at all, so this repository only works with the
 * service-role client. Never import it from a Client Component:
 * lib/entitlement/server-only-boundary.test.ts enforces that, and the
 * table holds the one long-lived integration credential HERITAGE has.
 *
 * Every method below is ONE conditional statement. That is the entire
 * concurrency argument — see the migration's section C and
 * lib/integration/etsy/seller-credential.ts. A method that read and then
 * wrote would put the race back.
 */

const UNIQUE_VIOLATION = "23505";

interface SellerCredentialRow {
  refresh_token: string;
  access_token: string | null;
  access_token_expires_at: string | null;
  credential_version: number;
  lease_holder: string | null;
  lease_expires_at: string | null;
}

const CREDENTIAL_COLUMNS =
  "refresh_token, access_token, access_token_expires_at, credential_version, lease_holder, lease_expires_at";

function toSnapshot(row: SellerCredentialRow): SellerCredentialSnapshot {
  return {
    refreshToken: row.refresh_token,
    accessToken: row.access_token,
    accessTokenExpiresAt: row.access_token_expires_at,
    credentialVersion: row.credential_version,
    leaseHolder: row.lease_holder,
    leaseExpiresAt: row.lease_expires_at,
  };
}

export class SupabaseSellerCredentialRepository implements SellerCredentialRepository {
  constructor(private readonly client: SupabaseClient) {}

  async read(): Promise<SellerCredentialSnapshot | null> {
    const { data, error } = await this.client
      .from("etsy_seller_credentials")
      .select(CREDENTIAL_COLUMNS)
      .eq("singleton", true)
      .maybeSingle<SellerCredentialRow>();

    if (error) throw error;
    return data ? toSnapshot(data) : null;
  }

  async bootstrap(refreshToken: string): Promise<{ created: boolean }> {
    // INSERT ... ON CONFLICT DO NOTHING, expressed the same way the
    // entitlement repository expresses its own unique-violation
    // handling: attempt the write, let the primary key decide.
    //
    // This is what makes the two properties Mission 019B requires true
    // by construction rather than by discipline: two concurrent
    // bootstraps cannot both create a row, and a stale environment
    // variable can never overwrite a refresh token already stored —
    // there is no UPDATE anywhere on this path.
    const { error } = await this.client
      .from("etsy_seller_credentials")
      .insert({ singleton: true, refresh_token: refreshToken });

    if (error?.code === UNIQUE_VIOLATION) return { created: false };
    if (error) throw error;

    return { created: true };
  }

  async acquireRefreshLease({
    leaseHolder,
    now,
    leaseExpiresAt,
  }: {
    leaseHolder: string;
    now: string;
    leaseExpiresAt: string;
  }): Promise<AcquireRefreshLeaseOutcome> {
    // One conditional UPDATE. Two concurrent callers cannot both match:
    // the second blocks on the row lock the first holds, then
    // re-evaluates this WHERE clause against the committed row and finds
    // an unexpired lease.
    //
    // `credential_version` is deliberately untouched — taking a lease is
    // not a credential change, and bumping it here would break the guard
    // that `storeRefreshedCredential` depends on.
    const { data, error } = await this.client
      .from("etsy_seller_credentials")
      .update({ lease_holder: leaseHolder, lease_expires_at: leaseExpiresAt })
      .eq("singleton", true)
      .or(`lease_expires_at.is.null,lease_expires_at.lt.${now}`)
      .select(CREDENTIAL_COLUMNS)
      .maybeSingle<SellerCredentialRow>();

    if (error) throw error;
    if (data) return { status: "acquired", credential: toSnapshot(data) };

    // Nothing matched. Either somebody holds the lease, or there is no
    // row at all — two very different answers, so this reads once to
    // tell them apart rather than guessing.
    const existing = await this.read();
    return existing ? { status: "held" } : { status: "missing" };
  }

  async storeRefreshedCredential({
    expectedCredentialVersion,
    refreshToken,
    accessToken,
    accessTokenExpiresAt,
  }: {
    expectedCredentialVersion: number;
    refreshToken: string;
    accessToken: string;
    accessTokenExpiresAt: string;
  }): Promise<StoreRefreshedCredentialOutcome> {
    // Compare-and-swap on `credential_version`, in the same statement
    // that advances it. This is THE guarantee that an older credential
    // can never overwrite a newer one: an attempt whose lease lapsed
    // while another one already published finds the version moved and
    // matches nothing.
    //
    // The next version is computed here rather than as `version + 1` in
    // SQL because the guard already pins the current value — so
    // `expected + 1` is exactly `version + 1`, and PostgREST needs no
    // expression support for it.
    //
    // The lease is released in the same write: holding it any longer
    // would block the next refresh for no reason.
    const { data, error } = await this.client
      .from("etsy_seller_credentials")
      .update({
        refresh_token: refreshToken,
        access_token: accessToken,
        access_token_expires_at: accessTokenExpiresAt,
        credential_version: expectedCredentialVersion + 1,
        lease_holder: null,
        lease_expires_at: null,
      })
      .eq("singleton", true)
      .eq("credential_version", expectedCredentialVersion)
      .select(CREDENTIAL_COLUMNS)
      .maybeSingle<SellerCredentialRow>();

    if (error) throw error;

    return data
      ? { status: "stored", credential: toSnapshot(data) }
      : { status: "superseded" };
  }

  async releaseRefreshLease(leaseHolder: string): Promise<void> {
    // Guarded on the holder so a late release can never free a lease
    // somebody else has since taken. The credential columns are not
    // named at all here — a failed refresh must leave them exactly as
    // they were.
    const { error } = await this.client
      .from("etsy_seller_credentials")
      .update({ lease_holder: null, lease_expires_at: null })
      .eq("singleton", true)
      .eq("lease_holder", leaseHolder);

    if (error) throw error;
  }
}
