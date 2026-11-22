"use server";

import { authorizeMemorialForRequest } from "@/lib/auth/heritage-session";
import { createSupabaseMemorialEditRepository } from "@/lib/adapters/supabase/memorial-edit-repository";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import {
  saveTextThenStep,
  type TextThenStepAttempt,
  type TextThenStepResponse,
} from "@/lib/memorial/save-text-then-step";
import type { MemorialContent } from "@/types/memorial";

/**
 * Mission 04-J — EXPERIMENT (local only). The two historical writes of a
 * step's Continue — the scheduled text, then the text plus the step — in
 * one request (lib/memorial/save-text-then-step.ts).
 *
 * Same boundary as `saveDraftAction`, with no new privilege: arguments
 * are validated first, the actor is re-authorized from the session on
 * this very request, the AUTHORIZED id is the only one used, and the same
 * session-scoped client + edit repository (Security V1, atomic RPC with
 * revision CAS) perform both writes. A refusal rejects before any read.
 */
export async function saveTextThenStepAction(
  memorialId: string,
  text: MemorialContent,
  final: MemorialContent,
  expectedRevision: number,
  attempt: TextThenStepAttempt = "first",
): Promise<TextThenStepResponse> {
  for (const content of [text, final]) {
    if (typeof content !== "object" || content === null || Array.isArray(content)) {
      throw new Error("Unsupported draft content.");
    }
  }
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw new Error("Unsupported draft revision.");
  }
  // Mission 04-L — anything but an explicit « retry » is a new operation.
  if (attempt !== "first" && attempt !== "retry") throw new Error("Unsupported draft attempt.");

  const access = await authorizeMemorialForRequest(memorialId);
  if (access.status !== "granted") throw new Error("Draft save refused.");

  const supabase = await createServerSupabaseClient();
  return saveTextThenStep({
    repository: createSupabaseMemorialEditRepository(supabase),
    access,
    text,
    final,
    expectedRevision,
    attempt,
  });
}
