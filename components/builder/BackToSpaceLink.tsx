"use client";

import Link, { useLinkStatus } from "next/link";
import type { Language } from "@/config/languages";
import { translate } from "@/lib/i18n/translate";
import { PendingActionLabel } from "./PendingActionLabel";

/**
 * Mission 04-G / L1.3 — « Retour à mon espace » on the Guided Flow's
 * resting screen. The same `<Link href="/owner">` as before, with the
 * same class and text; while the App Router is still bringing the
 * family space, the label becomes the shared « Un instant… » feedback
 * (`PendingActionLabel`: spinner, polite status, the family's language).
 * When `/owner` was already prefetched, the router shows its loading
 * state (app/owner/loading.tsx) at once and this label never flickers.
 */
export function BackToSpaceLink({ language, className }: { language: Language; className?: string }) {
  return (
    <Link href="/owner" className={className}>
      <BackToSpaceLabel language={language} />
    </Link>
  );
}

function BackToSpaceLabel({ language }: { language: Language }) {
  const { pending } = useLinkStatus();
  return (
    <PendingActionLabel pending={pending} pendingLabel={translate(language, "common.pleaseWait")}>
      {translate(language, "flowPause.backToSpace")}
    </PendingActionLabel>
  );
}
