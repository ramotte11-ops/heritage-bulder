/**
 * Kept out of app/auth/actions.ts on purpose: a "use server" file may
 * only export async functions (Next.js enforces this at build time) —
 * this type and its initial value are plain data, not a Server Action.
 */
export interface MagicLinkFormState {
  status: "idle" | "success" | "error";
  message: string;
}

export const INITIAL_MAGIC_LINK_STATE: MagicLinkFormState = { status: "idle", message: "" };
