import { describe, expect, it } from "vitest";
import { isConfiguredMemorial, type Memorial, type StoredMemorial } from "./memorial";

/**
 * Mission 011A — the one TypeScript boundary this mission introduces:
 * telling a memorial the database can hand back (StoredMemorial, where
 * the family's own choices may still be NULL) apart from one the Builder
 * can actually consume (Memorial).
 *
 * The redemption engine itself is a PostgreSQL primitive and is proved
 * where it lives, against a real cluster, in scripts/db/test-local.sh
 * (atomicity, rollback, revoked, idempotence, concurrency). No
 * TypeScript service calls it yet — that is Mission 011B.
 */

/** Exactly the row a redemption creates: owned, typed, skinned, and
 * nothing the family has not yet decided. */
const justRedeemed: StoredMemorial = {
  id: "11111111-1111-1111-1111-111111111111",
  ownerId: "22222222-2222-2222-2222-222222222222",
  entitlementId: "33333333-3333-3333-3333-333333333333",
  memorialType: "person",
  editorialContext: null,
  skin: "intemporel",
  language: null,
  enabledSections: [],
  status: "draft",
  slug: null,
  draft: { content: {}, updatedAt: "2026-09-01T12:00:00.000Z" },
  published: null,
  createdAt: "2026-09-01T12:00:00.000Z",
  updatedAt: "2026-09-01T12:00:00.000Z",
};

describe("isConfiguredMemorial", () => {
  it("rejects the memorial a redemption just created", () => {
    expect(isConfiguredMemorial(justRedeemed)).toBe(false);
  });

  it("accepts a memorial once the family has made all three choices", () => {
    const configured: StoredMemorial = {
      ...justRedeemed,
      editorialContext: "remembrance",
      language: "fr",
      slug: "prenom-nom-a1b2c3",
    };

    expect(isConfiguredMemorial(configured)).toBe(true);
  });

  it.each([
    ["editorialContext", { editorialContext: null }],
    ["language", { language: null }],
    ["slug", { slug: null }],
  ])("rejects a memorial still missing %s alone", (_field, missing) => {
    const almost: StoredMemorial = {
      ...justRedeemed,
      editorialContext: "announcement",
      language: "en",
      slug: "prenom-nom-a1b2c3",
      ...missing,
    };

    expect(isConfiguredMemorial(almost)).toBe(false);
  });

  it("narrows to Memorial for the compiler, without a cast", () => {
    const stored: StoredMemorial = {
      ...justRedeemed,
      editorialContext: "announcement",
      language: "en",
      slug: "prenom-nom-a1b2c3",
    };

    if (!isConfiguredMemorial(stored)) throw new Error("expected a configured memorial");

    // `stored` is a Memorial from here on purely because the predicate
    // ran — these reads would not compile against StoredMemorial.
    const configured: Memorial = stored;
    const context: Memorial["editorialContext"] = configured.editorialContext;
    const slugLength: number = configured.slug.length;

    expect(context).toBe("announcement");
    expect(slugLength).toBeGreaterThan(0);
  });
});
