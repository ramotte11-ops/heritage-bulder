import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicEnv } from "./env";

/**
 * Refreshes the Supabase Auth session cookie for one request, if there is
 * one to refresh. This is the standard @supabase/ssr pattern for
 * Next.js's Proxy (formerly "Middleware" — see proxy.ts at the repo
 * root): Server Components can only *read* cookies, so an expired access
 * token would otherwise never get refreshed for them — Proxy is what
 * keeps the cookie fresh on the way in.
 *
 * Deliberately fails open: if Supabase isn't configured (no env vars —
 * true for local dev before Mission 004's setup, and for anyone running
 * this repo without a Supabase project), this returns the request
 * unmodified instead of throwing. proxy.ts's matcher already scopes this
 * to /login, /owner and /auth/* only, but this guard means even a
 * misconfigured deployment can't take down those pages with a hard
 * crash, and can never affect "/" or "/builder" (outside the matcher).
 */
export async function updateSupabaseSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  try {
    const { url, anonKey } = getSupabasePublicEnv();

    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    });

    // Triggers a token refresh when needed; the setAll above persists the
    // refreshed cookie onto the response.
    await supabase.auth.getUser();
  } catch (error) {
    console.error(
      "Supabase session refresh skipped:",
      error instanceof Error ? error.message : error,
    );
  }

  return response;
}
