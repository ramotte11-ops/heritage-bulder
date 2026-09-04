"use server";

import {
  runAdminActivationKeyInvalidate,
  runAdminActivationKeyReplace,
  runAdminEntitlementRevoke,
} from "@/lib/admin/admin-session";
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
