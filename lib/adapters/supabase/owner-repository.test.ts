import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseOwnerRepository } from "./owner-repository";

/**
 * Mission 011B — the adapter's own job: snake_case <-> camelCase, and
 * turning PostgreSQL's unique_violation into the concurrency answer the
 * port promises rather than an exception.
 */

const ROW = {
  id: "owner-1",
  auth_user_id: "auth-user-1",
  email: "famille@example.test",
  created_at: "2026-09-01T10:00:00.000Z",
  updated_at: "2026-09-01T10:00:00.000Z",
};

function fakeClient(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const single = vi.fn().mockResolvedValue(result);
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  // Present so a regression back to a pattern operator is caught rather
  // than crashing: the assertions below require it is never called.
  const ilike = vi.fn().mockReturnValue({ maybeSingle });
  const selectAfterInsert = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ eq, ilike });
  const insert = vi.fn().mockReturnValue({ select: selectAfterInsert });
  const from = vi.fn().mockReturnValue({ select, insert });

  return { client: { from } as unknown as SupabaseClient, from, eq, ilike, insert };
}

describe("SupabaseOwnerRepository.findByAuthUserId", () => {
  it("maps the row to an Owner", async () => {
    const { client, from, eq } = fakeClient({ data: ROW, error: null });

    const owner = await new SupabaseOwnerRepository(client).findByAuthUserId("auth-user-1");

    expect(from).toHaveBeenCalledWith("owners");
    expect(eq).toHaveBeenCalledWith("auth_user_id", "auth-user-1");
    expect(owner).toEqual({
      id: "owner-1",
      authUserId: "auth-user-1",
      email: "famille@example.test",
      createdAt: "2026-09-01T10:00:00.000Z",
      updatedAt: "2026-09-01T10:00:00.000Z",
    });
  });

  it("returns null when no owner is linked", async () => {
    const { client } = fakeClient({ data: null, error: null });

    expect(await new SupabaseOwnerRepository(client).findByAuthUserId("nobody")).toBeNull();
  });

  it("rejects on a genuine error", async () => {
    const { client } = fakeClient({ data: null, error: { message: "boom", code: "08006" } });

    await expect(
      new SupabaseOwnerRepository(client).findByAuthUserId("auth-user-1"),
    ).rejects.toMatchObject({ code: "08006" });
  });
});

describe("SupabaseOwnerRepository.findByEmail", () => {
  it("uses exact equality, never a pattern operator", async () => {
    const { client, eq, ilike } = fakeClient({ data: ROW, error: null });

    await new SupabaseOwnerRepository(client).findByEmail("famille@example.test");

    expect(eq).toHaveBeenCalledWith("email", "famille@example.test");
    expect(ilike).not.toHaveBeenCalled();
  });

  it("normalises casing before querying, matching lower(email)", async () => {
    const { client, eq } = fakeClient({ data: ROW, error: null });

    await new SupabaseOwnerRepository(client).findByEmail("  Famille@Example.TEST  ");

    expect(eq).toHaveBeenCalledWith("email", "famille@example.test");
  });

  it("matches a row stored in a different case", async () => {
    const { client } = fakeClient({
      data: { ...ROW, email: "Famille@Example.test" },
      error: null,
    });

    const owner = await new SupabaseOwnerRepository(client).findByEmail("famille@example.test");

    expect(owner?.id).toBe("owner-1");
  });

  it.each([
    ["a percent wildcard", "%@example.test"],
    ["an underscore wildcard", "famille_@example.test"],
    ["a PostgREST star alias", "*@example.test"],
    ["a backslash escape", "famille\\@example.test"],
  ])("passes %s through as a literal value, never as a pattern", async (_label, address) => {
    const { client, eq, ilike } = fakeClient({ data: null, error: null });

    await new SupabaseOwnerRepository(client).findByEmail(address);

    expect(ilike).not.toHaveBeenCalled();
    // The value reaches the query unchanged and uninterpreted — no
    // wildcard, no escaping dance, nothing for PostgreSQL to expand.
    expect(eq).toHaveBeenCalledWith("email", address.toLowerCase());
  });

  it("discards a row whose email is not this exact address, whatever the query returned", async () => {
    // Defence in depth: even if the query layer somehow over-matched,
    // a stranger's row must never be handed back as this identity's.
    const { client } = fakeClient({
      data: { ...ROW, id: "somebody-else", email: "fooXbar@example.test" },
      error: null,
    });

    const owner = await new SupabaseOwnerRepository(client).findByEmail("foo_bar@example.test");

    expect(owner).toBeNull();
  });
});

describe("SupabaseOwnerRepository.create", () => {
  it("returns the created owner", async () => {
    const { client, insert, from } = fakeClient({ data: ROW, error: null });

    const result = await new SupabaseOwnerRepository(client).create({
      authUserId: "auth-user-1",
      email: "famille@example.test",
    });

    expect(insert).toHaveBeenCalledWith({
      auth_user_id: "auth-user-1",
      email: "famille@example.test",
    });
    expect(from).toHaveBeenCalledWith("owners");
    expect(result).toEqual({ status: "created", owner: expect.objectContaining({ id: "owner-1" }) });
  });

  it("reports a unique violation as a conflict, not an exception", async () => {
    // 23505 is what both owners_auth_user_id_key and owners_email_key
    // raise — the concurrency guarantee the port relies on.
    const { client } = fakeClient({
      data: null,
      error: { code: "23505", message: 'duplicate key value violates unique constraint' },
    });

    const result = await new SupabaseOwnerRepository(client).create({
      authUserId: "auth-user-1",
      email: "famille@example.test",
    });

    expect(result).toEqual({ status: "conflict" });
  });

  it("normalises the email it writes, so reads and the lower(email) index agree", async () => {
    const { client, insert } = fakeClient({ data: ROW, error: null });

    await new SupabaseOwnerRepository(client).create({
      authUserId: "auth-user-1",
      email: "  Famille@Example.TEST  ",
    });

    expect(insert).toHaveBeenCalledWith({
      auth_user_id: "auth-user-1",
      email: "famille@example.test",
    });
  });

  it("still rejects on any other error, so a real failure is never read as a lost race", async () => {
    const { client } = fakeClient({ data: null, error: { code: "42501", message: "denied" } });

    await expect(
      new SupabaseOwnerRepository(client).create({
        authUserId: "auth-user-1",
        email: "famille@example.test",
      }),
    ).rejects.toMatchObject({ code: "42501" });
  });
});
