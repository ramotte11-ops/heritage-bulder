import type { NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase/proxy-session";

/**
 * Keeps the Supabase Auth session cookie fresh for the pages that
 * actually check it. Scoped narrowly on purpose (see `config.matcher`
 * below) — this never runs for "/", so the technical foundation page is
 * structurally unaffected by anything in Mission 004, working or not.
 *
 * Mission 015A added "/admin": the staff console reads the session on
 * every request, so an access token that expired between two lookups
 * would otherwise never be refreshed and would drop staff to a 404
 * mid-ticket. Matching it changes nothing about who may enter — that is
 * decided by requireHeritageAdmin, not by this file.
 *
 * Builder continuity mission added "/activate" and "/builder/:path*",
 * for the exact same reason. Both read the session on every request
 * (`getAuthenticatedUser` / `getHeritageActor`), and the Builder's
 * autosave Server Actions POST to the `/builder/{memorialId}` route
 * itself — so a family who left a Guided Flow screen open past the
 * access token's lifetime had nothing left to refresh it, and their
 * next autosave was refused as a visitor. Matching them changes nothing
 * about who may enter: that is still decided by
 * `authorizeMemorialForRequest` and the activation flow, never here.
 * `/builder/demo` falls under the same pattern; `updateSupabaseSession`
 * only refreshes an existing cookie (and fails open without Supabase
 * configuration), so the persist-less demo is unaffected.
 *
 * Named/filed as Next.js 16 requires: the "middleware" file convention
 * is deprecated in favour of "proxy" (same mechanism, renamed) — see
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md.
 */
export async function proxy(request: NextRequest) {
  return updateSupabaseSession(request);
}

export const config = {
  matcher: [
    "/owner/:path*",
    "/admin/:path*",
    "/login",
    "/auth/:path*",
    "/activate",
    "/builder/:path*",
  ],
};
