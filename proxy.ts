import type { NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase/proxy-session";

/**
 * Keeps the Supabase Auth session cookie fresh for the pages that
 * actually check it. Scoped narrowly on purpose (see `config.matcher`
 * below) — this never runs for "/" or "/builder", so Mission 003's demo
 * and the technical foundation page are structurally unaffected by
 * anything in Mission 004, working or not.
 *
 * Mission 015A added "/admin": the staff console reads the session on
 * every request, so an access token that expired between two lookups
 * would otherwise never be refreshed and would drop staff to a 404
 * mid-ticket. Matching it changes nothing about who may enter — that is
 * decided by requireHeritageAdmin, not by this file.
 *
 * Named/filed as Next.js 16 requires: the "middleware" file convention
 * is deprecated in favour of "proxy" (same mechanism, renamed) — see
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md.
 */
export async function proxy(request: NextRequest) {
  return updateSupabaseSession(request);
}

export const config = {
  matcher: ["/owner/:path*", "/admin/:path*", "/login", "/auth/:path*"],
};
