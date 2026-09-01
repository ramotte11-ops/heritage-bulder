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

/**
 * The form this repository both writes and looks up. Mirrors what
 * `owners_email_key` (`unique (lower(email))`) actually compares, so a
 * conflict is always a real conflict and never a casing artefact.
 */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
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
    // EXACT equality, never a pattern. `.ilike()` would look tempting
    // here (the unique index is on `lower(email)`), but postgrest-js
    // appends the value verbatim as `ilike.<value>`, so `%` and `_` —
    // both legal in an email's local part — would become live SQL
    // wildcards. `foo_bar@example.test` would then match a STRANGER's
    // `fooXbar@example.test`. That is unacceptable at an identity
    // boundary, so no pattern operator is used at all.
    //
    // Case-insensitivity is preserved by normalising here as well as at
    // the call site, so what we look up is exactly what this codebase
    // writes (`create` below stores the same normalised form). A row
    // stored in mixed case by something outside this codebase would not
    // be found — a deliberately safe miss, not a hole: the INSERT that
    // follows is still refused by `owners_email_key`'s `lower(email)`,
    // so the outcome is a refusal, never a takeover.
    const normalized = normalizeEmail(email);

    const { data, error } = await this.client
      .from("owners")
      .select("*")
      .eq("email", normalized)
      .maybeSingle<OwnerRow>();

    if (error) throw error;
    if (!data) return null;

    // Defence in depth. Whatever the query layer did with the value —
    // an operator change, a PostgREST parsing quirk on some exotic
    // address — a row whose email is not this exact address (case
    // aside) is never this identity's owner, and is discarded here
    // rather than handed to the resolution logic.
    if (normalizeEmail(data.email) !== normalized) return null;

    return toOwner(data);
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
      .insert({ auth_user_id: authUserId, email: normalizeEmail(email) })
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
