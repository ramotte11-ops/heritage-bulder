import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicEnv } from "./env";

/**
 * Mission 033 — the one Supabase client a Client Component may ever
 * hold: URL + ANON key only (both `NEXT_PUBLIC_*`, safe to ship to a
 * browser — see `lib/supabase/env.ts`'s own doc on the split). No
 * service-role key, ever, anywhere near this file.
 *
 * Its entire purpose is `storage.from(MEDIA_BUCKET).uploadToSignedUrl()`
 * — the one step of the Mission 030 upload model the mission brief
 * requires to happen browser -> Storage directly, never through a
 * Server Action (mission brief section 7). `uploadToSignedUrl` needs no
 * signed-in session of its own: the short-lived upload TOKEN a reserve
 * Server Action already returned (`lib/media/upload-lifecycle.ts`'s
 * `ReservedUpload`) is the actual authorization for that one write — the
 * anon key here only lets the client construct valid requests against
 * the right Supabase project, nothing more. `anon` itself holds zero
 * privilege on `storage.objects` for this bucket (Mission 030); the
 * token is what does the work.
 *
 * Session-less on purpose (`persistSession: false`): this client never
 * reads or writes the auth cookie, and has no business trying to.
 *
 * Memoized per browser tab so repeated uploads (e.g. "Changer la
 * photo") don't construct a fresh client every time.
 */
let cached: SupabaseClient | null = null;

export function getBrowserSupabaseClient(): SupabaseClient {
  if (cached) return cached;

  const { url, anonKey } = getSupabasePublicEnv();
  cached = createClient(url, anonKey, { auth: { persistSession: false } });
  return cached;
}
