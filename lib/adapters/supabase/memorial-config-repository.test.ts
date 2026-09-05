import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseMemorialConfigRepository } from "./memorial-config-repository";

/**
 * Mission 021B — the narrow read the real Builder actually performs.
 *
 * Same fake-query-builder technique as draft-repository.test.ts: one
 * shape only, `.from(...).select(...).eq(...).maybeSingle()`, because
 * one shape is all this repository is allowed to have.
 */
function fakeSupabaseClient(finalResult: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(finalResult);
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });

  return { client: { from } as unknown as SupabaseClient, from, select, eq, maybeSingle };
}

const ROW = {
  id: "11111111-1111-1111-1111-111111111111",
  owner_id: "22222222-2222-2222-2222-222222222222",
  entitlement_id: "33333333-3333-3333-3333-333333333333",
  memorial_type: "person",
  editorial_context: "announcement",
  skin_id: "intemporel",
  language: "fr",
  enabled_sections: ["story"],
  status: "draft",
  slug: "prenom-nom-a1b2c3",
  created_at: "2026-09-01T12:00:00.000Z",
  updated_at: "2026-09-02T12:00:00.000Z",
};

describe("SupabaseMemorialConfigRepository.findConfigById", () => {
  it("maps the row to the domain shape (snake_case -> camelCase), configuration only", async () => {
    const { client } = fakeSupabaseClient({ data: ROW, error: null });

    const result = await new SupabaseMemorialConfigRepository(client).findConfigById(ROW.id);

    expect(result).toEqual({
      id: ROW.id,
      ownerId: ROW.owner_id,
      entitlementId: ROW.entitlement_id,
      memorialType: "person",
      editorialContext: "announcement",
      skin: "intemporel",
      language: "fr",
      enabledSections: ["story"],
      status: "draft",
      slug: "prenom-nom-a1b2c3",
      createdAt: ROW.created_at,
      updatedAt: ROW.updated_at,
    });
  });

  it("carries NO content of any kind — no draft, no published snapshot", async () => {
    // The whole reason this port exists: the Builder's read path must
    // not carry (or require the privilege for) content it does not
    // display. The draft comes from DraftRepository; the published
    // snapshot comes from nowhere at all.
    const { client } = fakeSupabaseClient({ data: ROW, error: null });

    const result = await new SupabaseMemorialConfigRepository(client).findConfigById(ROW.id);

    expect(result).not.toHaveProperty("draft");
    expect(result).not.toHaveProperty("published");
  });

  it("reads ONE row from ONE table — memorials — and never touches memorial_published_snapshots", async () => {
    const { client, from, select, eq, maybeSingle } = fakeSupabaseClient({
      data: ROW,
      error: null,
    });

    await new SupabaseMemorialConfigRepository(client).findConfigById(ROW.id);

    expect(from).toHaveBeenCalledExactlyOnceWith("memorials");
    expect(from).not.toHaveBeenCalledWith("memorial_published_snapshots");
    expect(from).not.toHaveBeenCalledWith("memorial_drafts");
    expect(eq).toHaveBeenCalledExactlyOnceWith("id", ROW.id);
    expect(maybeSingle).toHaveBeenCalledOnce();

    // An explicit column list, not `*`: the query asks for exactly the
    // configuration fields, so a column added to `memorials` later is
    // not silently pulled into the Builder's read path.
    const requestedColumns = select.mock.calls[0][0] as string;
    expect(requestedColumns).not.toContain("*");
    for (const column of Object.keys(ROW)) {
      expect(requestedColumns).toContain(column);
    }
  });

  it("returns null when zero rows come back — nonexistent and RLS-blocked stay indistinguishable", async () => {
    const { client } = fakeSupabaseClient({ data: null, error: null });

    expect(
      await new SupabaseMemorialConfigRepository(client).findConfigById("not-mine"),
    ).toBeNull();
  });

  it("rejects on a genuine repository error instead of folding it into null", async () => {
    // A failed read is not a proof of absence: turning `permission
    // denied` into `null` would make an outage look like "no such
    // memorial" to every caller above.
    const { client } = fakeSupabaseClient({
      data: null,
      error: { message: "permission denied for table memorials" },
    });

    await expect(
      new SupabaseMemorialConfigRepository(client).findConfigById(ROW.id),
    ).rejects.toMatchObject({ message: "permission denied for table memorials" });
  });

  it("preserves the not-yet-configured shape a redemption creates, without inventing values", async () => {
    const { client } = fakeSupabaseClient({
      data: { ...ROW, editorial_context: null, language: null, slug: null, enabled_sections: [] },
      error: null,
    });

    const result = await new SupabaseMemorialConfigRepository(client).findConfigById(ROW.id);

    expect(result).toMatchObject({ editorialContext: null, language: null, slug: null });
  });
});
