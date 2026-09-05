import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { sanitizeReturnPath } from "@/lib/auth/return-path";

/**
 * Magic link callback: exchanges the one-time PKCE code Supabase Auth
 * appended to the emailRedirectTo URL for a real session, writing the
 * session cookie via createServerSupabaseClient, then redirects into the
 * app. On any failure, redirects back to /login with a generic error
 * flag — never exposes the underlying Supabase error to the client, and
 * never logs the code itself (it's a one-time credential).
 *
 * `next` (Mission 019C) carries the internal path requestMagicLink was
 * asked to return to (e.g. "/activate"), re-sanitized here on read —
 * defense in depth, since this value ultimately comes from a query
 * string. On success it replaces the previous hardcoded `/owner`
 * redirect (still the default when no `next` was supplied). On failure it
 * is preserved into the /login redirect, so retrying the magic link still
 * ends up back where the visitor started.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = sanitizeReturnPath(searchParams.get("next"));

  if (code) {
    try {
      const supabase = await createServerSupabaseClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (!error) {
        return NextResponse.redirect(`${origin}${next}`);
      }

      console.error("Magic link callback failed:", error.message);
    } catch (error) {
      unstable_rethrow(error);
      console.error(
        "Magic link callback failed:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth&next=${encodeURIComponent(next)}`);
}
