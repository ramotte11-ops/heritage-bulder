"use server";

import {
  runAdminActivationKeyInvalidate,
  runAdminActivationKeyReplace,
  runAdminEntitlementRevoke,
} from "@/lib/admin/admin-session";
import { runAdminEtsyOrderProvision } from "@/lib/integration/etsy/support-session";
import type { AdminMutationFormState } from "@/lib/admin/admin-mutation-state";

/**
 * Mission 015B — the three Server Actions behind the Admin mutation
 * buttons.
 *
 * Each one reads exactly one field from the submitted form —
 * `entitlementId` — and nothing else. There is no `adminAuthUserId`
 * field anywhere in these forms, and there could not be one that meant
 * anything: `runAdminActivationKeyReplace` and its two siblings
 * (lib/admin/admin-session.ts) resolve the admin's identity themselves,
 * from the validated session, every time. A browser cannot supply, and
 * these actions never read, who is making the request.
 *
 * A "use server" file may only export async functions (Next.js enforces
 * this at build time) — INITIAL_ADMIN_MUTATION_STATE therefore stays in
 * lib/admin/admin-mutation-state.ts, imported directly by the one Client
 * Component that drives all three actions
 * (components/admin/EntitlementActions.tsx), exactly like
 * components/auth/LoginForm.tsx imports INITIAL_MAGIC_LINK_STATE
 * straight from lib/auth/magic-link-state.ts rather than through
 * app/auth/actions.ts.
 */

function entitlementIdFrom(formData: FormData): string | null {
  const value = formData.get("entitlementId");
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

const MISSING_ENTITLEMENT_ID: AdminMutationFormState = {
  status: "error",
  message: "Identifiant de droit manquant.",
};

const ACCESS_DENIED: AdminMutationFormState = { status: "refused", message: "Accès refusé." };
const NOT_FOUND: AdminMutationFormState = { status: "refused", message: "Ce droit n'existe pas." };
const CONCURRENT_MODIFICATION: AdminMutationFormState = {
  status: "refused",
  message:
    "Ce droit a été modifié entre-temps par quelqu'un d'autre. Rechargez la recherche et réessayez.",
};
const SAME_ACTIVATION_KEY: AdminMutationFormState = {
  status: "refused",
  message: "La nouvelle clé générée n'a rien changé. Réessayez.",
};

export async function replaceActivationKeyAction(
  _prevState: AdminMutationFormState,
  formData: FormData,
): Promise<AdminMutationFormState> {
  const entitlementId = entitlementIdFrom(formData);
  if (!entitlementId) return MISSING_ENTITLEMENT_ID;

  const outcome = await runAdminActivationKeyReplace(entitlementId);
  if (outcome.status === "denied") return ACCESS_DENIED;

  switch (outcome.result.status) {
    case "replaced":
      return {
        status: "success",
        message:
          "Nouvelle clé générée. Elle ne sera plus jamais affichée — notez-la maintenant.",
        rawActivationKey: outcome.result.rawActivationKey,
      };
    case "notFound":
      return NOT_FOUND;
    case "notAvailable":
      return {
        status: "refused",
        message: "Ce droit n'est plus disponible : sa clé ne peut plus être remplacée.",
      };
    case "concurrentModification":
      return CONCURRENT_MODIFICATION;
    case "sameActivationKey":
      return SAME_ACTIVATION_KEY;
  }
}

export async function invalidateActivationKeyAction(
  _prevState: AdminMutationFormState,
  formData: FormData,
): Promise<AdminMutationFormState> {
  const entitlementId = entitlementIdFrom(formData);
  if (!entitlementId) return MISSING_ENTITLEMENT_ID;

  const outcome = await runAdminActivationKeyInvalidate(entitlementId);
  if (outcome.status === "denied") return ACCESS_DENIED;

  switch (outcome.result.status) {
    case "invalidated":
      return { status: "success", message: "Clé invalidée. Ce droit n'a plus de clé active." };
    case "notFound":
      return NOT_FOUND;
    case "notAvailable":
      return {
        status: "refused",
        message: "Ce droit n'est plus disponible : sa clé ne peut plus être invalidée.",
      };
    case "concurrentModification":
      return CONCURRENT_MODIFICATION;
    case "noActivationKey":
      return { status: "refused", message: "Ce droit n'a pas de clé active à invalider." };
  }
}

export async function revokeEntitlementAction(
  _prevState: AdminMutationFormState,
  formData: FormData,
): Promise<AdminMutationFormState> {
  const entitlementId = entitlementIdFrom(formData);
  if (!entitlementId) return MISSING_ENTITLEMENT_ID;

  const outcome = await runAdminEntitlementRevoke(entitlementId);
  if (outcome.status === "denied") return ACCESS_DENIED;

  switch (outcome.result.status) {
    case "revoked":
      return { status: "success", message: "Droit révoqué. Sa clé, s'il en avait une, est morte." };
    case "notFound":
      return NOT_FOUND;
    case "notAvailable":
      return {
        status: "refused",
        message:
          outcome.result.blockingStatus === "redeemed"
            ? "Ce droit a déjà été activé par une famille : il ne peut pas être révoqué."
            : "Ce droit est déjà révoqué.",
      };
  }
}

/**
 * Mission 019B — provisioning a guest Etsy order, for support.
 *
 * Reads exactly one field, `receiptId`, and it is not trusted: it is an
 * order reference HERITAGE then verifies against ETSY, on our own shop,
 * before anything is created. Staff cannot conjure a right by typing
 * plausible data — every eligibility rule is the same code the nominal
 * OAuth path runs, and no Admin privilege overrides any of its refusals
 * (see lib/integration/etsy/provision-order-for-support.ts).
 *
 * Like the three Mission 015B actions above, there is no
 * `adminAuthUserId` field in this form and there could not be one that
 * meant anything: the identity is resolved from the validated session,
 * every time, inside `runAdminEtsyOrderProvision`.
 */
export async function provisionEtsyOrderAction(
  _prevState: AdminMutationFormState,
  formData: FormData,
): Promise<AdminMutationFormState> {
  const value = formData.get("receiptId");
  const receiptId = typeof value === "string" ? value.trim() : "";
  if (receiptId === "") {
    return { status: "error", message: "Numéro de commande Etsy manquant." };
  }

  const outcome = await runAdminEtsyOrderProvision(receiptId);
  if (outcome.status === "denied") return ACCESS_DENIED;

  switch (outcome.result.status) {
    case "provisioned":
      return {
        status: "success",
        message:
          "Droit créé pour cette commande. La clé ci-dessous ne sera plus jamais affichée — notez-la maintenant et transmettez-la à la famille.",
        rawActivationKey: outcome.result.rawActivationKey,
      };
    case "alreadyProvisioned":
      // Deliberately no key. The raw key is not stored and cannot be
      // re-read, so this path cannot legitimately produce one; minting a
      // fresh one here would silently break a key the family may already
      // hold, on nothing more than a second lookup. Re-keying stays the
      // explicit, audited Mission 015B replacement.
      return {
        status: "refused",
        message:
          "Cette commande a déjà un droit. Recherchez-la par numéro de commande, puis utilisez « Remplacer la clé » si la famille n'a plus la sienne.",
      };
    case "orderNotFound":
      return {
        status: "refused",
        message: "Etsy ne connaît pas cette commande pour notre boutique.",
      };
    case "notGuestPurchase":
      return {
        status: "refused",
        message:
          "Cette commande est rattachée à un compte Etsy : la famille peut la confirmer elle-même depuis /activate. Ce recours est réservé aux achats sans compte.",
      };
    case "notEligible":
      // The structural reason is deliberately not shown. Staff need to
      // know it cannot be provisioned, not which of six internal checks
      // said so — and several of those reasons name Etsy vocabulary.
      return {
        status: "refused",
        message:
          "Cette commande ne peut pas ouvrir de droit HERITAGE (paiement, annulation, remboursement, quantité ou article non reconnu).",
      };
    case "etsyUnavailable":
      return {
        status: "refused",
        message: "Etsy est momentanément injoignable. Réessayez dans quelques instants.",
      };
  }
}
