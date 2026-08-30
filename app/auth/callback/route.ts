import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";

/**
 * Magic link callback: exchanges the one-time PKCE code Supabase Auth
 * appended to the emailRedirectTo URL for a real session, writing the
 * session cookie via createServerSupabaseClient, then redirects into the
 * app. On any failure, redirects back to /login with a generic error
 * flag — never exposes the underlying Supabase error to the client, and
 * never logs the code itself (it's a one-time credential).
 */
export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    try {
      const supabase = await createServerSupabaseClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (!error) {
        return NextResponse.redirect(`${origin}/owner`);
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

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
