import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { OwnerRepository } from "@/lib/adapters/owner-repository";
import type { Owner } from "@/types/owner";

/**
 * SERVER ONLY. This repository writes to `owners`, a table with no
 * client-facing INSERT policy at all
 * (supabase/migrations/20260829152000_owners.sql), so it is only usable
 * with the service-role client (lib/supabase/service-role-client.ts).
 * Never import this file from a Client Component or anything reachable
 * from one — lib/entitlement/server-only-boundary.test.ts enforces that.
 */

interface OwnerRow {
  id: string;
  auth_user_id: string | null;
  email: string;
  created_at: string;
  updated_at: string;
}

function toOwner(row: OwnerRow): Owner {
  return {
    id: row.id,
    authUserId: row.auth_user_id,
    email: row.email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** PostgreSQL's unique_violation. The one refusal that is a concurrency
 * answer rather than a failure — see the port's `create` docstring. */
const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: PostgrestError | null): boolean {
  return error?.code === UNIQUE_VIOLATION;
}

export class SupabaseOwnerRepository implements OwnerRepository {
  constructor(private readonly client: SupabaseClient) {}

  async findByAuthUserId(authUserId: string): Promise<Owner | null> {
    const { data, error } = await this.client
      .from("owners")
      .select("*")
      .eq("auth_user_id", authUserId)
      .maybeSingle<OwnerRow>();

    if (error) throw error;
    return data ? toOwner(data) : null;
  }

  async findByEmail(email: string): Promise<Owner | null> {
    // `ilike` with no wildcards is a case-insensitive equality match,
    // which is what `owners_email_key`'s `unique (lower(email))`
    // actually enforces. A plain `eq` would miss a row stored with
    // different casing while the index would still reject inserting it —
    // the lookup has to see exactly what the constraint sees.
    const { data, error } = await this.client
      .from("owners")
      .select("*")
      .ilike("email", email)
      .maybeSingle<OwnerRow>();

    if (error) throw error;
    return data ? toOwner(data) : null;
  }

  async create({
    authUserId,
    email,
  }: {
    authUserId: string;
    email: string;
  }): Promise<{ status: "created"; owner: Owner } | { status: "conflict" }> {
    const { data, error } = await this.client
      .from("owners")
      .insert({ auth_user_id: authUserId, email })
      .select("*")
      .single<OwnerRow>();

    // A unique violation means one of `owners`' indexes already covers
    // this identity — the row we would have created exists, or one that
    // blocks it does. That is an answer, not a failure.
    if (isUniqueViolation(error)) return { status: "conflict" };
    if (error) throw error;

    return { status: "created", owner: toOwner(data) };
  }
}
