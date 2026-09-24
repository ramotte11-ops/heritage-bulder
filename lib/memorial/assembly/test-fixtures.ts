import type { MemorialContent } from "@/types/memorial";
import {
  buildQgRuntimeDemoContentThroughA03,
  QG_RUNTIME_DEMO_MEDIA,
  QG_RUNTIME_DEMO_NAME_NORMAL,
} from "@/lib/builder/qg-runtime-demo";
import { commitA03 } from "@/lib/builder/guided-flow/death-notice-step";
import {
  commitA04,
  commitA05,
  skipA06,
  skipA07,
  skipA08,
  writeCeremonyDate,
} from "@/lib/builder/guided-flow/ceremony-step";
import { skipA09 } from "@/lib/builder/guided-flow/traditions-step";
import {
  commitPersonSheet,
  skipPersonSheet,
  writePersonWordsFieldText,
} from "@/lib/builder/guided-flow/person-sheet-step";
import type { MediaRequest, MediaResolver, ResolvedMedia } from "./media-resolver";

/**
 * Étape 2 — shared fixtures for the Memorial assembler's tests (pure and
 * jsdom). Every content is built through the REAL Guided Flow
 * write/commit functions, exactly like compose-memorial.test.ts — never
 * by hand-writing `content.guidedFlow`.
 */

type StepResult = { ok: true; content: MemorialContent } | { ok: false; reason: string };

function ok(result: StepResult): MemorialContent {
  if (!result.ok) throw new Error(`fixture step refused: ${result.reason}`);
  return result.content;
}

export const FIXTURE_DISPLAY_NAME = QG_RUNTIME_DEMO_NAME_NORMAL;
export const FIXTURE_HERO_MEDIA_ID = QG_RUNTIME_DEMO_MEDIA.id;
export const FIXTURE_READ_URL = "https://storage.test/signed/assembly-hero";
export const FIXTURE_PERSON_WORDS = "Elle riait de tout, surtout d'elle-même.";

/** T03–T08, A01, A02 done; A03 not yet — Hero renderable only. */
export function throughA02(): MemorialContent {
  return buildQgRuntimeDemoContentThroughA03({ displayName: FIXTURE_DISPLAY_NAME });
}

/** + A03 verified — Hero and Avis renderable; Ceremony pending. */
export function throughA03(): MemorialContent {
  return ok(commitA03(throughA02()));
}

/** + A04 "yes" and A05–A08 resolved, A09 skipped — the sheet pending. */
function throughA09WithCeremony(): MemorialContent {
  let content = ok(commitA04(throughA03(), "yes"));
  content = ok(writeCeremonyDate(content, "2026-10-02"));
  content = ok(commitA05(content));
  content = ok(skipA06(content));
  content = ok(skipA07(content));
  content = ok(skipA08(content));
  return ok(skipA09(content));
}

/** Every built section renderable: Hero, Avis, Récit (with the
 * family's own A10 text), Cérémonie. */
export function fullAnnouncement(): MemorialContent {
  const content = ok(writePersonWordsFieldText(throughA09WithCeremony(), FIXTURE_PERSON_WORDS));
  return ok(commitPersonSheet(content));
}

/** Same, but the A10–A12 sheet skipped: all three matters empty (QG
 * decision — still renderable, with HERITAGE fallbacks). */
export function fullAnnouncementEmptyRecit(): MemorialContent {
  return ok(skipPersonSheet(throughA09WithCeremony()));
}

export interface RecordingResolver {
  resolve: MediaResolver;
  calls: MediaRequest[];
}

/** A resolver that answers every request with `answer(request)`
 * (default: a valid echo) and records what it was asked. */
export function recordingResolver(
  answer: (request: MediaRequest) => ResolvedMedia | null | Promise<ResolvedMedia | null> = (request) => ({
    mediaId: request.mediaId,
    readUrl: FIXTURE_READ_URL,
  }),
): RecordingResolver {
  const calls: MediaRequest[] = [];
  return {
    calls,
    resolve: async (request) => {
      calls.push(request);
      return answer(request);
    },
  };
}
