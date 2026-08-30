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
