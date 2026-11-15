"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server-client";

/**
 * QG 017 — leave only this browser session before showing the account form.
 * Other devices stay connected, and the guest draft in IndexedDB is never
 * read, changed or cleared by this action.
 */
export async function signOutGuestDraftAccountAction(): Promise<{ ok: boolean }> {
  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      console.error("Guest draft account change failed:", error.message);
      return { ok: false };
    }
    return { ok: true };
  } catch (error) {
    console.error(
      "Guest draft account change failed:",
      error instanceof Error ? error.message : error,
    );
    return { ok: false };
  }
}
