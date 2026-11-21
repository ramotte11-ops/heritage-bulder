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
 *   other skin, no longer publicly visible, or no open eligibility
 *   (opened at the first publication since QG 016, free and complete
 *   offers alike; closed by an administrative suspension);
 * - `rate_limited`: the memorial's hour or day ceiling is reached.
 */
export type SymbolicOfferingOutcome = "recorded" | "duplicate" | "refused" | "rate_limited";

export interface SymbolicOfferingRepository {
  record(input: SymbolicOfferingInput): Promise<SymbolicOfferingOutcome>;
}

/**
 * Lot 2 — the contract over sign_symbolic_offering_v1() (supabase/
 * migrations/20261116120000_lot2_offering_signature.sql): attaches the
 * visitor's OPTIONAL signature to a gesture ALREADY recorded, designated by
 * the public slug and the gesture's own idempotency key. Never creates a
 * gesture. The signature is private to the family; it is never logged.
 */
export interface SymbolicOfferingSignatureInput {
  slug: string;
  idempotencyKey: string;
  /** Already normalised (lib/memorial/symbolic-offerings/offering-signature.ts). */
  signature: string;
}

/**
 * Exactly the function's outcomes:
 * - `signed`: the signature is attached;
 * - `already_signed`: the same signature already was (a retry);
 * - `refused`: unknown slug or gesture, signed otherwise, or too late.
 */
export type SymbolicOfferingSignatureOutcome = "signed" | "already_signed" | "refused";

export interface SymbolicOfferingSignatureRepository {
  sign(input: SymbolicOfferingSignatureInput): Promise<SymbolicOfferingSignatureOutcome>;
}
