"use client";

import { useLinkStatus } from "next/link";
import type { ReactNode } from "react";
import { PendingActionLabel } from "@/components/builder/PendingActionLabel";

/**
 * Recette Builder V1 — the label of a `<Link>` to a slow, dynamic page
 * (the Builder of a memorial): the click is acknowledged at once, on the
 * link itself, with the shared Builder pending label, until the
 * navigation commits. Must be rendered inside the `<Link>`.
 */
export function PendingLinkLabel({ pendingLabel, children }: { pendingLabel: ReactNode; children: ReactNode }) {
  const { pending } = useLinkStatus();
  return (
    <PendingActionLabel pending={pending} pendingLabel={pendingLabel}>
      {children}
    </PendingActionLabel>
  );
}
