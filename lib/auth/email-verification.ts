import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role-client";

/**
 * QG 004-B — HERITAGE's proof that a family controls its e-mail address.
 *
 * Supabase « Confirm email » is disabled (the account is usable at once), so
 * `auth.users.email_confirmed_at` is filled automatically and proves nothing:
 * it is NEVER read as a proof anywhere. The proof lives in
 * `public.owner_email_verifications`, written only by these service_role RPCs
 * (supabase/migrations/20261114120000_qg004b_owner_email_verification.sql),
 * and only right after Supabase Auth itself has checked a code sent to the
 * address (e-mail OTP, password-recovery code, or e-mail-change code).
 *
 * The database enforces it (HV403) on publication, the « complet » upgrade
 * and Etsy redemption; these helpers let the server answer earlier and
 * clearly.
 */

export type VerificationMethod = "email_otp" | "password_recovery";

export interface EmailVerificationStore {
  isOwnerVerified(ownerId: string): Promise<boolean>;
  record(authUserId: string, email: string, method: VerificationMethod): Promise<"recorded" | "no_owner" | "email_mismatch">;
  isChangeAllowed(authUserId: string): Promise<boolean>;
  applyChange(authUserId: string, newEmail: string): Promise<"changed" | "no_owner" | "email_taken" | "email_locked">;
}

function firstOutcome<T extends string>(data: unknown): T {
  const row = Array.isArray(data) ? data[0] : data;
  const outcome = row && typeof row === "object" ? (row as { outcome?: unknown }).outcome : undefined;
  if (typeof outcome !== "string") throw new Error("Unexpected e-mail verification answer.");
  return outcome as T;
}

export function createEmailVerificationStore(
  client: SupabaseClient = createServiceRoleSupabaseClient(),
): EmailVerificationStore {
  return {
    async isOwnerVerified(ownerId) {
      const { data, error } = await client.rpc("owner_email_verified_v1", { p_owner_id: ownerId });
      if (error) throw new Error(`E-mail verification lookup failed: ${error.code ?? "unknown"}`);
      return data === true;
    },
    async record(authUserId, email, method) {
      const { data, error } = await client.rpc("record_owner_email_verification_v1", {
        p_auth_user_id: authUserId,
        p_email: email,
        p_method: method,
      });
      if (error) throw new Error(`E-mail verification record failed: ${error.code ?? "unknown"}`);
      return firstOutcome<"recorded" | "no_owner" | "email_mismatch">(data);
    },
    async isChangeAllowed(authUserId) {
      const { data, error } = await client.rpc("owner_email_change_allowed_v1", { p_auth_user_id: authUserId });
      if (error) throw new Error(`E-mail change lookup failed: ${error.code ?? "unknown"}`);
      return data === true;
    },
    async applyChange(authUserId, newEmail) {
      const { data, error } = await client.rpc("apply_owner_email_change_v1", {
        p_auth_user_id: authUserId,
        p_new_email: newEmail,
      });
      if (error) throw new Error(`E-mail change failed: ${error.code ?? "unknown"}`);
      return firstOutcome<"changed" | "no_owner" | "email_taken" | "email_locked">(data);
    },
  };
}
