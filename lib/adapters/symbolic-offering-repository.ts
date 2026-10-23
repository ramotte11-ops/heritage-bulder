import type { OfferingKind } from "@/config/symbolic-offerings-v1-tokens";

/**
 * Offrandes symboliques V1 — C1: the contract over
 * record_symbolic_offering_v1() (supabase/migrations/
 * 20261023160000_symbolic_offerings_v1.sql).
 *
 * One method. It takes the memorial's public slug — never an internal id
 * supplied by a visitor — the gesture, and the random key the visitor's
 * browser drew for that one gesture. Nothing about the visitor: the
 * function has no parameter that could carry a name, an address or an IP.
 */
export interface SymbolicOfferingInput {
  slug: string;
  kind: OfferingKind;
  idempotencyKey: string;
}

/**
 * Exactly the function's outcomes:
 * - `recorded`: stored;
 * - `duplicate`: that key was already stored for this memorial — nothing
 *   new is written, and the gesture is the success it already was;
 * - `refused`: unknown slug, not published, hidden in the live snapshot,
 *   other skin, or no open eligibility (the closed-by-default lock);
 * - `rate_limited`: the memorial's hour or day ceiling is reached.
 */
export type SymbolicOfferingOutcome = "recorded" | "duplicate" | "refused" | "rate_limited";

export interface SymbolicOfferingRepository {
  record(input: SymbolicOfferingInput): Promise<SymbolicOfferingOutcome>;
}
