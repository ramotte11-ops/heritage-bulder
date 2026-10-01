import type { AlbumGrammarId } from "@/config/album-a13-grammars";

/**
 * A13 Album — partition and phase (Handoff §2, §4; pure, theme-free).
 *
 * The media COUNT only chooses group sizes; it never enters a geometry or a
 * scale. Media order is never touched: group g holds the contiguous slice
 * `[start, start + size)`, so media i always sits in an earlier or the same
 * group as media i + 1.
 *
 * - groups of 5 while preserving the final remainder;
 * - remainder 2, 3 or 4 → that dedicated closure;
 * - remainder 1 → the last six media become 4 + 2;
 * - 0 or 1 media: no Album (a singleton group is forbidden).
 *
 * Phase of a full group (JSON `phaseRule`): A when popcount(groupIndex) is
 * even, B when odd — the Thue–Morse sequence A B B A B A A B…, deterministic
 * and non-periodic. A closure always uses its own grammar.
 */

export interface AlbumGroupSpec {
  index: number;
  start: number;
  size: 2 | 3 | 4 | 5;
  grammar: AlbumGrammarId;
  phase: "A" | "B" | null;
}

export function partitionSizes(count: number): number[] {
  if (!Number.isInteger(count) || count < 2) return [];
  const full = Math.floor(count / 5);
  const r = count % 5;
  if (r === 0) return Array(full).fill(5);
  if (r === 1) return [...Array(full - 1).fill(5), 4, 2];
  return [...Array(full).fill(5), r];
}

export function popcount(n: number) {
  let c = 0;
  for (let v = n; v > 0; v >>>= 1) c += v & 1;
  return c;
}

export function phaseOf(groupIndex: number): "A" | "B" {
  return popcount(groupIndex) % 2 === 0 ? "A" : "B";
}

export function partitionAlbum(count: number): AlbumGroupSpec[] {
  let start = 0;
  return partitionSizes(count).map((size, index) => {
    const spec: AlbumGroupSpec =
      size === 5
        ? { index, start, size, grammar: phaseOf(index), phase: phaseOf(index) }
        : { index, start, size: size as 2 | 3 | 4, grammar: `C${size}` as AlbumGrammarId, phase: null };
    start += size;
    return spec;
  });
}

// ── Mobile Light profile (Handoff Album Mobile V1.1 `grouping`) ──────────

export type AlbumMobileGroupGrammar = "TOP3" | "PAIR_A" | "PAIR_B" | "CLOSURE3";

export interface AlbumMobileGroupSpec {
  index: number;
  start: number;
  size: 2 | 3;
  grammar: AlbumMobileGroupGrammar;
  /** Rank among the body groups (pairs and closure), 0 = the first after TOP3. */
  bodyIndex: number | null;
}

/**
 * TOP3 always first; the remainder in pairs, PAIR_A / PAIR_B alternating;
 * an odd remainder makes the LAST group a CLOSURE3 (never a singleton).
 * Strict contiguous media order. No Album below 7 media.
 */
export function partitionAlbumMobile(count: number): AlbumMobileGroupSpec[] {
  if (!Number.isInteger(count) || count < 7) return [];
  const specs: AlbumMobileGroupSpec[] = [{ index: 0, start: 0, size: 3, grammar: "TOP3", bodyIndex: null }];
  const rest = count - 3;
  const pairs = rest % 2 === 0 ? rest / 2 : (rest - 3) / 2;
  let start = 3;
  for (let j = 0; j < pairs; j++) {
    specs.push({ index: specs.length, start, size: 2, grammar: j % 2 === 0 ? "PAIR_A" : "PAIR_B", bodyIndex: j });
    start += 2;
  }
  if (rest % 2 === 1) specs.push({ index: specs.length, start, size: 3, grammar: "CLOSURE3", bodyIndex: pairs });
  return specs;
}
