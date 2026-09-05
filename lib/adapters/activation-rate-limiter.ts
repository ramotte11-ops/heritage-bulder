/**
 * Mission 019C — the contract over Mission 019C's rate-limit RPC
 * (record_heritage_activation_attempt(), in
 * supabase/migrations/20260905100000_activation_rate_limit.sql).
 *
 * Exactly one method, taking exactly one thing: an already-verified
 * Supabase Auth user id. No activation key, no hash of one — this port
 * has no business knowing what was presented, only who presented it and
 * whether that identity is still within budget.
 */
export interface ActivationRateLimitDecision {
  allowed: boolean;
  /** Seconds until the current window resets. 0 when `allowed` is true —
   * a caller within budget has nothing to wait for. */
  retryAfterSeconds: number;
}

export interface ActivationRateLimiter {
  /**
   * Records one activation attempt for this identity and reports whether
   * it is still within HERITAGE's fixed budget for this surface. Must be
   * called, and must refuse before proceeding when `allowed` is false,
   * BEFORE the presented key is looked at — see
   * lib/entitlement/activate-heritage-access.ts.
   */
  recordAttempt(authUserId: string): Promise<ActivationRateLimitDecision>;
}
