"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ContributionsFeatures } from "@/lib/memorial/contributions/contributions-settings";
import type { ContributionDepositTransport, DepositStatus } from "./deposit-transport";

/**
 * M8-E4 — le MOTEUR du parcours de dépôt, sans aucun rendu.
 *
 * Il porte toute la mécanique validée du parcours : étapes, catégories
 * disponibles, un jeton signé par dépôt, envoi, correspondance des réponses
 * du serveur, « un autre souvenir » et messages. La présentation (aujourd'hui
 * le prototype `ContributionDepositWindow`, NON validé artistiquement) ne fait
 * qu'afficher son état et lui transmettre la saisie. Une nouvelle direction PO
 * pourra donc remplacer l'habillage sans toucher à la mécanique.
 */

export type DepositKind = "condolence" | "testimonial" | "photo";

export const DEPOSIT_KINDS: readonly { kind: DepositKind; feature: keyof ContributionsFeatures }[] = [
  { kind: "condolence", feature: "condolences" },
  { kind: "testimonial", feature: "stories" },
  { kind: "photo", feature: "photos" },
];

export type DepositStep =
  | { name: "choose" }
  | { name: "write"; kind: DepositKind }
  | { name: "done"; kind: DepositKind; status: "published" | "pending" }
  | { name: "busy" }
  | { name: "closed" };

export type DepositFieldError = "authorName" | "text" | "caption" | "photo" | "photoMissing" | "generic" | null;

export interface DepositInput {
  authorName: string;
  text?: string;
  caption?: string;
  file?: File | null;
  /** Le champ piège (R4) : vide pour un humain. */
  website: string;
}

export interface ContributionDepositEngine {
  step: DepositStep;
  /** Catégories ouvertes et non encore utilisées pendant cette ouverture. */
  available: readonly DepositKind[];
  /** À l'étape de confirmation : les catégories proposées pour « un autre souvenir ». */
  remaining: readonly DepositKind[];
  /** Un jeton est prêt : l'envoi est possible. */
  ready: boolean;
  sending: boolean;
  error: DepositFieldError;
  choose: (kind: DepositKind) => void;
  back: () => void;
  submit: (kind: DepositKind, input: DepositInput) => Promise<void>;
  clearError: () => void;
}

function initialStep(categories: ContributionsFeatures): DepositStep {
  const open = DEPOSIT_KINDS.filter((k) => categories[k.feature]).map((k) => k.kind);
  if (open.length === 0) return { name: "closed" };
  return open.length === 1 ? { name: "write", kind: open[0] } : { name: "choose" };
}

export function useContributionDeposit(categories: ContributionsFeatures, transport: ContributionDepositTransport): ContributionDepositEngine {
  const [used, setUsed] = useState<ReadonlySet<DepositKind>>(() => new Set());
  const [step, setStep] = useState<DepositStep>(() => initialStep(categories));
  const [token, setToken] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<DepositFieldError>(null);
  const available = useMemo(() => DEPOSIT_KINDS.filter((k) => categories[k.feature] && !used.has(k.kind)).map((k) => k.kind), [categories, used]);

  // Un jeton par dépôt (son nonce est la clé d'idempotence côté serveur) :
  // demandé à l'ouverture, puis renouvelé après chaque dépôt.
  const refreshToken = useCallback(async () => {
    try {
      const r = await transport.open();
      if (r.status === "ready" && "formToken" in r) setToken(r.formToken);
      else setStep({ name: "closed" });
    } catch {
      setStep({ name: "closed" });
    }
  }, [transport]);
  useEffect(() => {
    // Synchronisation avec le serveur (source externe) : le jeton arrive après la réponse.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshToken();
  }, [refreshToken]);

  const submit = useCallback(
    async (kind: DepositKind, input: DepositInput) => {
      if (!token || sending) return;
      if (kind === "photo" && !input.file) {
        setError("photoMissing");
        return;
      }
      setError(null);
      setSending(true);
      let r: DepositStatus;
      try {
        r =
          kind === "photo"
            ? await transport.depositPhoto({ file: input.file as File, authorName: input.authorName, caption: input.caption ?? "", formToken: token, website: input.website })
            : await transport.depositText({ type: kind, authorName: input.authorName, text: input.text ?? "", formToken: token, website: input.website });
      } catch {
        r = { status: "unavailable" };
      }
      setSending(false);
      switch (r.status) {
        case "published":
        case "pending":
          setUsed((u) => new Set([...u, kind]));
          setStep({ name: "done", kind, status: r.status });
          setToken(null);
          void refreshToken();
          return;
        case "busy":
          setStep({ name: "busy" });
          return;
        case "refused":
          setStep({ name: "closed" });
          return;
        case "expired":
          setToken(null);
          void refreshToken();
          setError("generic");
          return;
        case "invalid":
          setError(r.field === "request" ? "generic" : r.field);
          return;
        default:
          setError("generic");
      }
    },
    [token, sending, transport, refreshToken],
  );

  const remaining = step.name === "done" ? available.filter((k) => k !== step.kind) : available;
  return {
    step,
    available,
    remaining,
    ready: token !== null,
    sending,
    error,
    choose: (kind) => {
      setError(null);
      setStep({ name: "write", kind });
    },
    back: () => {
      setError(null);
      setStep({ name: "choose" });
    },
    submit,
    clearError: () => setError(null),
  };
}
