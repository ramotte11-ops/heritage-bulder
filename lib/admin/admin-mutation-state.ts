/**
 * Mission 015B — the shape `useActionState` carries between renders of
 * an Admin mutation form.
 *
 * Kept out of app/admin/actions.ts on purpose, exactly like
 * lib/auth/magic-link-state.ts: a "use server" file may only export
 * async functions (Next.js enforces this at build time), and this type
 * plus its initial value are plain data, not a Server Action.
 */
export interface AdminMutationFormState {
  status: "idle" | "success" | "refused" | "error";
  message: string;
  /**
   * Set ONLY by a successful activation-key replacement, and only in
   * the state that render produces. Nothing writes this anywhere else:
   * not localStorage, not a cookie, not the database — the RPC never
   * even returns the raw key (see lib/admin/admin-mutations.ts). Once
   * the page re-renders for any other reason this is gone, and there is
   * no way to recover it: support must copy it down immediately, which
   * is exactly the point of showing it at all.
   */
  rawActivationKey?: string;
}

export const INITIAL_ADMIN_MUTATION_STATE: AdminMutationFormState = { status: "idle", message: "" };
