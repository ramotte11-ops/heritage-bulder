/**
 * Mission 019C — a safe "return to this HERITAGE page after the Magic
 * Link" path.
 *
 * /activate needs a user who isn't signed in yet to authenticate first,
 * then land back on /activate rather than the default /owner. The
 * mechanism threading that through — requestMagicLink's emailRedirectTo,
 * read back by app/auth/callback/route.ts — must never accept an
 * arbitrary caller-supplied value: an unvalidated redirect target is an
 * open-redirect vector, and this is a value that ultimately comes from a
 * query string a browser controls.
 *
 * So the only values this ever produces are internal paths this app
 * actually owns: a single leading slash, no protocol, no host (which
 * would make it point off-site), no `//` (protocol-relative — the classic
 * bypass for a "must start with /" check), and no query string or
 * fragment (nothing here needs one). Anything else silently falls back to
 * DEFAULT_RETURN_PATH rather than erroring — a caller passing garbage
 * should land somewhere safe and ordinary, not see a broken redirect.
 *
 * This is deliberately unrelated to Mission 013's secret-handling rules:
 * a path like "/activate" is already public information (the route
 * itself is), never an activation key or anything that identifies one.
 */

export const DEFAULT_RETURN_PATH = "/owner";

const SAFE_RETURN_PATH = /^\/(?!\/)[a-zA-Z0-9\-_/]*$/;

export function sanitizeReturnPath(candidate: string | null | undefined): string {
  if (!candidate) return DEFAULT_RETURN_PATH;
  return SAFE_RETURN_PATH.test(candidate) ? candidate : DEFAULT_RETURN_PATH;
}
