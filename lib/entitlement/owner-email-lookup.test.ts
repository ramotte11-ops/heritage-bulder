import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseOwnerRepository } from "@/lib/adapters/supabase/owner-repository";
import { resolveOwnerForIdentity, type AuthenticatedIdentity } from "./resolve-owner";

/**
 * Mission 011B correction — an integration test of the REAL adapter
 * wired into the REAL owner resolution, over an in-memory store that
 * enforces `owners`' actual constraints.
 *
 * It exists because an email is not an inert string: `%` and `_` are
 * legal in a local part (RFC 5322 atext) AND are wildcards to
 * LIKE/ILIKE. An earlier version of this adapter passed the address
 * straight to `.ilike()`, which postgrest-js appends verbatim as
 * `ilike.<value>` — so `foo_bar@example.test` would have matched a
 * stranger's `fooXbar@example.test` at an identity boundary.
 *
 * Testing the helper alone would not have caught that. These tests drive
 * the same path a request does: resolveOwnerForIdentity ->
 * SupabaseOwnerRepository -> query layer.
 */

interface StoredOwner {
  id: string;
  auth_user_id: string | null;
  email: string;
  created_at: string;
  updated_at: string;
}

const UNIQUE_VIOLATION = { code: "23505", message: "duplicate key value violates unique constraint" };

/**
 * A deliberately faithful stand-in for the pieces of PostgREST +
 * PostgreSQL this adapter touches:
 *   - `eq`    exact equality, as PostgREST issues it;
 *   - `ilike` REAL SQL ILIKE semantics, wildcards and all — so a
 *             regression to a pattern operator would actually
 *             over-match here rather than quietly behaving like `eq`;
 *   - insert  enforces owners_auth_user_id_key (partial, where not
 *             null) and owners_email_key (unique on lower(email)).
 */
function fakeOwnersDatabase(rows: StoredOwner[]) {
  const ilike = vi.fn((_column: string, pattern: string) => {
    const expression = new RegExp(
      `^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".")}$`,
      "i",
    );
    const matches = rows.filter((row) => expression.test(row.email));
    return {
      maybeSingle: async () =>
        matches.length > 1
          ? { data: null, error: { code: "PGRST116", message: "more than one row returned" } }
          : { data: matches[0] ?? null, error: null },
    };
  });

  const eq = vi.fn((column: string, value: string) => {
    const matches = rows.filter((row) => String(row[column as keyof StoredOwner]) === value);
    return {
      maybeSingle: async () => ({ data: matches[0] ?? null, error: null }),
    };
  });

  const insert = vi.fn((row: { auth_user_id: string; email: string }) => ({
    select: () => ({
      single: async () => {
        const authTaken =
          row.auth_user_id !== null &&
          rows.some((existing) => existing.auth_user_id === row.auth_user_id);
        const emailTaken = rows.some(
          (existing) => existing.email.toLowerCase() === row.email.toLowerCase(),
        );

        if (authTaken || emailTaken) return { data: null, error: UNIQUE_VIOLATION };

        const created: StoredOwner = {
          id: `owner-${rows.length + 1}`,
          auth_user_id: row.auth_user_id,
          email: row.email,
          created_at: "2026-09-01T10:00:00.000Z",
          updated_at: "2026-09-01T10:00:00.000Z",
        };
        rows.push(created);
        return { data: created, error: null };
      },
    }),
  }));

  const client = {
    from: () => ({ select: () => ({ eq, ilike }), insert }),
  } as unknown as SupabaseClient;

  return { client, rows, eq, ilike };
}

function identity(email: string, id = "auth-user-me"): AuthenticatedIdentity {
  return { id, email, email_confirmed_at: "2026-09-01T10:00:00.000Z", is_anonymous: false };
}

function storedOwner(overrides: Partial<StoredOwner>): StoredOwner {
  return {
    id: "owner-stranger",
    auth_user_id: "auth-user-stranger",
    email: "stranger@example.test",
    created_at: "2026-09-01T10:00:00.000Z",
    updated_at: "2026-09-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("owner email lookup — pattern characters are never wildcards", () => {
  it("an underscore in the address cannot match a stranger's owner", async () => {
    // Under the old `.ilike()`, `foo_bar@…` matched `fooXbar@…`.
    const db = fakeOwnersDatabase([
      storedOwner({ id: "owner-stranger", email: "fooXbar@example.test" }),
    ]);
    const repository = new SupabaseOwnerRepository(db.client);

    const result = await resolveOwnerForIdentity(repository, identity("foo_bar@example.test"));

    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") throw new Error("unreachable");
    expect(result.owner.id).not.toBe("owner-stranger");
    expect(result.owner.email).toBe("foo_bar@example.test");
    expect(db.ilike).not.toHaveBeenCalled();
  });

  it("a percent sign in the address cannot match every owner at a domain", async () => {
    const db = fakeOwnersDatabase([
      storedOwner({ id: "owner-a", email: "alice@example.test" }),
      storedOwner({ id: "owner-b", auth_user_id: "auth-b", email: "bob@example.test" }),
    ]);
    const repository = new SupabaseOwnerRepository(db.client);

    const result = await resolveOwnerForIdentity(repository, identity("%@example.test"));

    // Under `.ilike()` this matched two rows, so the query itself failed
    // — a self-inflicted denial as well as a leak. It now simply finds
    // nothing and creates its own owner.
    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") throw new Error("unreachable");
    expect(result.owner.email).toBe("%@example.test");
    expect(db.ilike).not.toHaveBeenCalled();
  });

  it("cannot be used to probe whether a stranger's owner exists", async () => {
    const withStranger = fakeOwnersDatabase([
      storedOwner({ email: "victim@example.test" }),
    ]);
    const withoutStranger = fakeOwnersDatabase([]);

    const probe = identity("v_ctim@example.test");
    const a = await resolveOwnerForIdentity(new SupabaseOwnerRepository(withStranger.client), probe);
    const b = await resolveOwnerForIdentity(
      new SupabaseOwnerRepository(withoutStranger.client),
      probe,
    );

    // Same outcome either way: the stranger's existence is unobservable.
    expect(a.status).toBe("resolved");
    expect(b.status).toBe("resolved");
  });
});

describe("owner email lookup — exact case-insensitive equality still holds", () => {
  it("Family@example.test resolves to the owner stored as family@example.test", async () => {
    const db = fakeOwnersDatabase([
      storedOwner({ id: "owner-mine", auth_user_id: null, email: "family@example.test" }),
    ]);
    const repository = new SupabaseOwnerRepository(db.client);

    // Case C: found by email, unlinked — so refused, never auto-linked.
    // What matters here is that it was FOUND despite the casing.
    const result = await resolveOwnerForIdentity(repository, identity("Family@example.test"));

    expect(result).toEqual({ status: "ownerLinkConflict" });
  });

  it("never matches a different address", async () => {
    const db = fakeOwnersDatabase([storedOwner({ email: "familly@example.test" })]);
    const repository = new SupabaseOwnerRepository(db.client);

    const result = await resolveOwnerForIdentity(repository, identity("family@example.test"));

    expect(result.status).toBe("resolved");
  });
});

describe("owner email lookup — the resolution rules are unchanged", () => {
  it("A: reuses the owner already linked to this auth user", async () => {
    const db = fakeOwnersDatabase([
      storedOwner({ id: "owner-mine", auth_user_id: "auth-user-me", email: "me@example.test" }),
    ]);

    const result = await resolveOwnerForIdentity(
      new SupabaseOwnerRepository(db.client),
      identity("me@example.test"),
    );

    expect(result).toEqual(expect.objectContaining({ status: "resolved" }));
    if (result.status !== "resolved") throw new Error("unreachable");
    expect(result.owner.id).toBe("owner-mine");
  });

  it("B: creates exactly one owner, and a concurrent second attempt reuses it", async () => {
    const db = fakeOwnersDatabase([]);
    const repository = new SupabaseOwnerRepository(db.client);
    const me = identity("new@example.test");

    const first = await resolveOwnerForIdentity(repository, me);
    const second = await resolveOwnerForIdentity(repository, me);

    expect(first.status).toBe("resolved");
    expect(second.status).toBe("resolved");
    if (first.status !== "resolved" || second.status !== "resolved") {
      throw new Error("unreachable");
    }
    expect(second.owner.id).toBe(first.owner.id);
    expect(db.rows).toHaveLength(1);
  });

  it("C: an unlinked owner at the same email is a conflict, never an auto-link", async () => {
    const db = fakeOwnersDatabase([
      storedOwner({ id: "owner-unlinked", auth_user_id: null, email: "shared@example.test" }),
    ]);

    const result = await resolveOwnerForIdentity(
      new SupabaseOwnerRepository(db.client),
      identity("shared@example.test"),
    );

    expect(result).toEqual({ status: "ownerLinkConflict" });
    expect(db.rows).toHaveLength(1);
  });

  it("D: an email owned by another auth user is refused outright", async () => {
    const db = fakeOwnersDatabase([
      storedOwner({ auth_user_id: "auth-user-someone-else", email: "shared@example.test" }),
    ]);

    const result = await resolveOwnerForIdentity(
      new SupabaseOwnerRepository(db.client),
      identity("shared@example.test"),
    );

    expect(result).toEqual({ status: "ownerIdentityConflict" });
    expect(db.rows).toHaveLength(1);
  });
});
