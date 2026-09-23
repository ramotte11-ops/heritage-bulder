/**
 * Reads Supabase environment configuration lazily.
 *
 * Every export here is a function — nothing runs at import time. This is
 * deliberate: importing this module (or anything that imports it) must
 * never throw just because Supabase hasn't been configured yet. The app
 * must build, run, and serve its current pages with zero Supabase
 * environment variables set (see .env.example and Mission 002's brief).
 * An error is only ever thrown when Supabase is actually used.
 */

export interface SupabasePublicEnv {
  url: string;
  anonKey: string;
}

export interface SupabaseServiceRoleEnv extends SupabasePublicEnv {
  serviceRoleKey: string;
}

function requireValue(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Supabase is not configured yet — see .env.example.`,
    );
  }
  return value;
}

function readRequired(name: string): string {
  return requireValue(name, process.env[name]);
}

/** URL + anon key only — safe to read from a browser context (both are
 * NEXT_PUBLIC_*).
 *
 * Both are read as LITERAL `process.env.NEXT_PUBLIC_…` expressions, never
 * through `readRequired`'s dynamic `process.env[name]`: Next.js only
 * inlines a `NEXT_PUBLIC_*` value into the browser bundle where the
 * literal expression appears. A dynamic lookup compiles, in the browser,
 * to a read on an empty `process.env` shim — which is exactly why the
 * Hero photo's direct browser → Storage upload
 * (lib/supabase/browser-client.ts) threw "Missing environment variable"
 * before sending any request, while every server-side read kept working. */
export function getSupabasePublicEnv(): SupabasePublicEnv {
  return {
    url: requireValue("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    anonKey: requireValue("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  };
}

/** Includes the service role key. Server-only — never call this from a
 * Client Component or anything bundled to the browser. */
export function getSupabaseServiceRoleEnv(): SupabaseServiceRoleEnv {
  return {
    ...getSupabasePublicEnv(),
    serviceRoleKey: readRequired("SUPABASE_SERVICE_ROLE_KEY"),
  };
}
