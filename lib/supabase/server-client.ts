import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicEnv } from "./env";

/**
 * Server-only Supabase client using the public (anon) key, wired to the
 * Next.js cookie store via @supabase/ssr — this is the officially
 * recommended way to keep a Supabase Auth session alive across Server
 * Components, Server Actions and Route Handlers in the App Router (RLS
 * applies as whichever user's session cookie is present, or as anon if
 * there is none).
 *
 * Mission 004 correction to Mission 002's version of this file: that one
 * used a plain `createClient` with no cookie awareness at all, which
 * cannot persist a session across requests. Nothing called the old
 * version yet (confirmed in Mission 002's report), so this is not a
 * breaking change to any real caller — it is what that file's own
 * comment already anticipated ("once real authentication exists").
 *
 * `setAll` can be called from a Server Component, which is not allowed
 * to write cookies — that failure is expected and safely ignored there,
 * as long as middleware.ts is refreshing the session on the way in (the
 * standard @supabase/ssr pattern for Next.js).
 */
export async function createServerSupabaseClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabasePublicEnv();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component — see the docstring above.
        }
      },
    },
  });
}
