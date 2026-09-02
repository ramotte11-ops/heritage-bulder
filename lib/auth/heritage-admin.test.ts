import { describe, expect, it } from "vitest";
import {
  HERITAGE_ADMIN_ROLE,
  HERITAGE_ROLE_METADATA_KEY,
  isHeritageAdmin,
  type HeritageAdminIdentity,
} from "./heritage-admin";

/**
 * Mission 014 — the Admin primitive. Every test here is about one of two
 * things: the flag is read from the right place, and nothing else can
 * fake it.
 */

function identity(appMetadata: unknown): HeritageAdminIdentity {
  return { app_metadata: appMetadata } as HeritageAdminIdentity;
}

describe("isHeritageAdmin", () => {
  it("recognises an Admin by app_metadata.heritage_role", () => {
    expect(isHeritageAdmin(identity({ [HERITAGE_ROLE_METADATA_KEY]: HERITAGE_ADMIN_ROLE }))).toBe(
      true,
    );
  });

  it("recognises an Admin alongside Supabase's own app_metadata fields", () => {
    // A real app_metadata always carries provider info; the role sits
    // beside it rather than replacing it.
    expect(
      isHeritageAdmin(
        identity({
          provider: "email",
          providers: ["email"],
          [HERITAGE_ROLE_METADATA_KEY]: HERITAGE_ADMIN_ROLE,
        }),
      ),
    ).toBe(true);
  });

  it("refuses an ordinary authenticated user", () => {
    expect(isHeritageAdmin(identity({ provider: "email", providers: ["email"] }))).toBe(false);
  });

  // --- THE test. user_metadata is writable by the user themselves via
  // supabase.auth.updateUser(), so a role found there is a claim by the
  // very person being checked. It must count for nothing.
  it("NEVER promotes a user who put heritage_role in their own user_metadata", () => {
    const selfDeclared = {
      app_metadata: { provider: "email" },
      user_metadata: { [HERITAGE_ROLE_METADATA_KEY]: HERITAGE_ADMIN_ROLE },
    } as unknown as HeritageAdminIdentity;

    expect(isHeritageAdmin(selfDeclared)).toBe(false);
  });

  it("NEVER promotes a user whose user_metadata claims every plausible admin shape", () => {
    for (const claim of [
      { role: "admin" },
      { is_admin: true },
      { heritage_role: "admin" },
      { heritageRole: "admin" },
      { admin: true },
    ]) {
      const user = {
        app_metadata: {},
        user_metadata: claim,
      } as unknown as HeritageAdminIdentity;

      expect(isHeritageAdmin(user)).toBe(false);
    }
  });

  // --- fail closed on anything that is not exactly the expected value
  it("refuses near-miss values instead of guessing", () => {
    for (const role of [
      "Admin",
      "ADMIN",
      " admin",
      "admin ",
      "administrator",
      "admin,support",
      "superadmin",
      true,
      1,
      ["admin"],
      { role: "admin" },
      null,
      undefined,
    ]) {
      expect(isHeritageAdmin(identity({ [HERITAGE_ROLE_METADATA_KEY]: role }))).toBe(false);
    }
  });

  it("refuses when the role sits under a different key", () => {
    for (const key of ["role", "heritageRole", "heritage-role", "is_admin", "admin"]) {
      expect(isHeritageAdmin(identity({ [key]: HERITAGE_ADMIN_ROLE }))).toBe(false);
    }
  });

  it("never throws on a missing or malformed app_metadata", () => {
    expect(isHeritageAdmin(null)).toBe(false);
    expect(isHeritageAdmin(undefined)).toBe(false);
    expect(isHeritageAdmin(identity(undefined))).toBe(false);
    expect(isHeritageAdmin(identity(null))).toBe(false);
    expect(isHeritageAdmin(identity("admin"))).toBe(false);
    expect(isHeritageAdmin(identity(42))).toBe(false);
    expect(isHeritageAdmin(identity([HERITAGE_ADMIN_ROLE]))).toBe(false);
    expect(isHeritageAdmin(identity([{ [HERITAGE_ROLE_METADATA_KEY]: "admin" }]))).toBe(false);
  });

  it("is not fooled by a prototype-borrowed property", () => {
    // `{}` inherits from Object.prototype; nothing walked up a prototype
    // chain may ever produce an Admin.
    const polluted = Object.create({ [HERITAGE_ROLE_METADATA_KEY]: HERITAGE_ADMIN_ROLE }) as object;

    expect(isHeritageAdmin(identity(polluted))).toBe(false);
  });
});
