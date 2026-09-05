/**
 * Kept out of app/activate/actions.ts on purpose: a "use server" file may
 * only export async functions (Next.js enforces this at build time) —
 * this type and its initial value are plain data, not a Server Action.
 * Same pattern as lib/auth/magic-link-state.ts and
 * lib/admin/admin-mutation-state.ts.
 */
export interface ActivateFormState {
  status: "idle" | "success" | "error";
  message: string;
}

export const INITIAL_ACTIVATE_STATE: ActivateFormState = { status: "idle", message: "" };
