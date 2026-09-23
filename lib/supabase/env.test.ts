import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getSupabasePublicEnv, getSupabaseServiceRoleEnv } from "./env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getSupabasePublicEnv", () => {
  it("returns the URL and anon key when both are set", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    expect(getSupabasePublicEnv()).toEqual({ url: "https://example.supabase.co", anonKey: "anon" });
  });

  it("throws a named error when one is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    expect(() => getSupabasePublicEnv()).toThrow("Missing environment variable NEXT_PUBLIC_SUPABASE_URL");
  });

  it("reads both NEXT_PUBLIC_* values as literal expressions — the only form Next.js inlines into the browser bundle", () => {
    // T06 real test: a dynamic `process.env[name]` compiled to a read on
    // the browser's empty process.env shim, so the Hero photo upload
    // (browser → Storage) threw before sending anything.
    const source = readFileSync(path.join(import.meta.dirname, "env.ts"), "utf8");
    const publicEnvBody = source.slice(source.indexOf("export function getSupabasePublicEnv"));
    expect(publicEnvBody).toContain("process.env.NEXT_PUBLIC_SUPABASE_URL");
    expect(publicEnvBody).toContain("process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY");
  });
});

describe("getSupabaseServiceRoleEnv", () => {
  it("still requires the service role key, server-side", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(() => getSupabaseServiceRoleEnv()).toThrow("Missing environment variable SUPABASE_SERVICE_ROLE_KEY");
  });
});
