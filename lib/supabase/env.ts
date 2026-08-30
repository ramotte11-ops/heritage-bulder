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

function readRequired(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Supabase is not configured yet — see .env.example.`,
    );
  }
  return value;
}

/** URL + anon key only — safe to read from a browser context (both are
 * NEXT_PUBLIC_*). */
export function getSupabasePublicEnv(): SupabasePublicEnv {
  return {
    url: readRequired("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: readRequired("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
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
