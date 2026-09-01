import type { EntitlementRepository } from "@/lib/adapters/entitlement-repository";
import type { EntitlementSource } from "@/config/entitlements";
import { OFFERS, type OfferId } from "@/config/offers";
import type { Entitlement } from "@/types/entitlement";
import { generateActivationKey } from "./activation-key";

/**
 * Mission 013 — issuing a product right together with the activation key
 * that will let its buyer claim it.
 *
 * Named `...WithActivationKey` deliberately: a HERITAGE right does NOT
 * require a key. A future direct channel may create one attributed
 * straight to a known Owner, with no key at all, and nothing here should
 * suggest otherwise.
 *
 * Server-only, service-role. There is no route, Server Action or form
 * that reaches this — issuing rights is not something a browser does.
 *
 * Knows nothing about Etsy. `source` is a channel label the schema
 * already carries (`etsy | direct`); the commercial mapping that would
 * turn a real order into a call here belongs to a later mission.
 */

export interface IssueEntitlementWithActivationKeyInput {
  offerId: OfferId;
  source: EntitlementSource;
  /** The channel's own order reference, when it has one. Unique per
   * source — a second issue for the same order is refused, never
   * duplicated into a second right. */
  externalOrderId?: string | null;
}

export type IssueEntitlementWithActivationKeyResult =
  | {
      status: "issued";
      entitlement: Entitlement;
      /**
       * The one and only time this value exists outside the buyer's
       * hands. It is not stored, not logged, and not present in any
       * other result — the caller must deliver it and forget it.
       */
      rawActivationKey: string;
    }
  /** A right already exists for this (source, externalOrderId). Carries
   * no key: re-issuing one for an existing order is a support action
   * (replace), not a side effect of a duplicate call. */
  | { status: "duplicateExternalOrder"; entitlement: Entitlement }
  /** The offer id is not one this build knows. Nothing is written. */
  | { status: "invalidOffer" };

export interface IssueEntitlementDeps {
  entitlementRepository: EntitlementRepository;
}

export async function issueEntitlementWithActivationKey(
  { entitlementRepository }: IssueEntitlementDeps,
  { offerId, source, externalOrderId }: IssueEntitlementWithActivationKeyInput,
): Promise<IssueEntitlementWithActivationKeyResult> {
  // Mission 006's configuration is the authority on what an offer is.
  // Checked before anything is generated or written.
  if (!Object.hasOwn(OFFERS, offerId)) {
    return { status: "invalidOffer" };
  }

  const { rawKey, hash } = generateActivationKey();

  // Only the hash crosses this line. The repository's signature makes it
  // impossible to hand it the raw key even by accident.
  const outcome = await entitlementRepository.issueWithActivationKey({
    offerId,
    source,
    externalOrderId: externalOrderId ?? null,
    activationKeyHash: hash,
  });

  if (outcome.status === "duplicateExternalOrder") {
    return { status: "duplicateExternalOrder", entitlement: outcome.entitlement };
  }

  return { status: "issued", entitlement: outcome.entitlement, rawActivationKey: rawKey };
}
