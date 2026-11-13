/**
 * QG 003 — HERITAGE's password rule, shared by the forms (immediate
 * feedback) and the Server Actions (authority).
 *
 * PO decision: at least 8 characters, NO artificial composition rules
 * (no forced capital, digit or symbol). What is refused instead is what
 * actually weakens a password: too short, longer than bcrypt can use (72
 * bytes — Supabase Auth would silently ignore the rest), or one of the most
 * common passwords. Passwords exposed in known breaches are refused by
 * Supabase Auth itself when its "leaked password protection" is enabled
 * (see docs/authentification-mot-de-passe.md); this local list is the
 * proportionate floor that needs no external service.
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72;

export type PasswordProblem = "too_short" | "too_long" | "too_common";

/** Most frequent passwords of 8+ characters (public breach statistics,
 * FR/EN/ES), compared case-insensitively. Deliberately short: a floor,
 * not a breach database. */
const COMMON_PASSWORDS = new Set([
  "12345678", "123456789", "1234567890", "12345678910", "123123123", "11111111", "00000000",
  "88888888", "87654321", "11223344", "12341234", "123456789a", "1q2w3e4r", "1q2w3e4r5t",
  "1qaz2wsx", "qwertyuiop", "qwerty123", "qwerty1234", "azertyuiop", "azerty123", "azerty1234",
  "password", "password1", "password12", "password123", "passw0rd", "p@ssw0rd", "motdepasse",
  "motdepasse1", "motdepasse123", "contrasena", "contraseña", "contrasena123", "iloveyou",
  "iloveyou1", "jetaime1", "teamo123", "sunshine", "princess", "football", "baseball",
  "superman", "starwars", "whatever", "trustno1", "letmein1", "welcome1", "welcome123",
  "bienvenue", "bienvenue1", "abcdefgh", "abcd1234", "abc12345", "aaaaaaaa", "asdfghjk",
  "asdfghjkl", "zxcvbnm1", "monkey123", "dragon123", "michelle", "jennifer", "computer",
  "changeme", "changeme1", "admin123", "administrator", "soleil123", "marseille", "doudou123",
  "chocolat", "chouchou", "loulou123", "nicolas1", "football1", "liverpool", "barcelona",
  "realmadrid", "qwertzuiop", "heritage", "heritage1", "heritage123", "hommage1", "hommage123",
]);

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length;
}

/** The first problem with `password`, or null when it is acceptable. */
export function checkPassword(password: string, email?: string): PasswordProblem | null {
  if ([...password].length < PASSWORD_MIN_LENGTH) return "too_short";
  if (utf8Length(password) > PASSWORD_MAX_BYTES) return "too_long";
  const lowered = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lowered)) return "too_common";
  if (email) {
    const address = email.trim().toLowerCase();
    if (lowered === address || lowered === address.split("@")[0]) return "too_common";
  }
  return null;
}
