/**
 * Minimal, deliberately permissive email shape check.
 *
 * This does not validate deliverability or replace Supabase's own
 * validation — it only catches obviously malformed input before making
 * an API call, so the user gets an immediate, clear message instead of
 * an opaque provider error for something like an empty field or a
 * missing "@".
 */
export function isValidEmail(value: string): boolean {
  const trimmed = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

// The browser's own rule for <input type="email"> (WHATWG HTML « valid
// e-mail address »), plus a dot in the domain.
const DOMAIN_LABEL = "[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?";
const NEW_ADDRESS = new RegExp(`^[a-zA-Z0-9.!#$%&'*+/=?^_\`{|}~-]+@${DOMAIN_LABEL}(?:\\.${DOMAIN_LABEL})+$`);

/**
 * QG 004-G — the check for an address the family TYPES to create an account
 * or move to. The account forms use `noValidate` (the browser used to refuse
 * these addresses silently); the server now refuses exactly what the browser
 * refused — accents, commas, spaces, a trailing dot… — with a visible message.
 * Existing addresses (sign-in, recovery, owner resolution) keep the permissive
 * `isValidEmail`, so no current account is locked out.
 */
export function isAcceptableNewEmail(value: string): boolean {
  return NEW_ADDRESS.test(value.trim());
}
