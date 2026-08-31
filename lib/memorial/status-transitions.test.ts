import { describe, expect, it } from "vitest";
import {
  MEMORIAL_STATUS_TRANSITIONS,
  canTransitionMemorialStatus,
  transitionMemorial,
} from "./status-transitions";
import type { MemorialStatus } from "@/types/memorial";

const ALL_STATUSES: MemorialStatus[] = [
  "draft",
  "ready",
  "published",
  "editing",
  "archived",
];

// Mission 005's exact, validated transition table — every one of these 9
// pairs is named explicitly in the mission brief. `archived` is a
// deliberate terminal state for V1: no pair starts from it.
const ALLOWED: Array<[MemorialStatus, MemorialStatus]> = [
  ["draft", "ready"],
  ["ready", "draft"],
  ["ready", "published"],
  ["published", "editing"],
  ["editing", "published"],
  ["draft", "archived"],
  ["ready", "archived"],
  ["published", "archived"],
  ["editing", "archived"],
];

const ALLOWED_SET = new Set(ALLOWED.map(([from, to]) => `${from}->${to}`));

// The exhaustive matrix Mission 005 asks for: every (from, to) pair,
// including from === to — 5 statuses x 5 statuses = 25 pairs.
const ALL_PAIRS: Array<[MemorialStatus, MemorialStatus]> = ALL_STATUSES.flatMap(
  (from) => ALL_STATUSES.map((to): [MemorialStatus, MemorialStatus] => [from, to]),
);

describe("MEMORIAL_STATUS_TRANSITIONS", () => {
  it("declares exactly Mission 005's 9 validated transitions, nothing more", () => {
    const declared = ALL_STATUSES.flatMap((from) =>
      MEMORIAL_STATUS_TRANSITIONS[from].map((to) => `${from}->${to}`),
    );

    expect(new Set(declared)).toEqual(ALLOWED_SET);
    expect(declared.length).toBe(ALLOWED.length);
  });

  it("makes archived a terminal state — no outgoing transition at all, no un-archive in this mission", () => {
    expect(MEMORIAL_STATUS_TRANSITIONS.archived).toEqual([]);
  });
});

describe("canTransitionMemorialStatus — exhaustive matrix (25 pairs)", () => {
  it.each(ALL_PAIRS)("%s -> %s", (from, to) => {
    expect(canTransitionMemorialStatus(from, to)).toBe(ALLOWED_SET.has(`${from}->${to}`));
  });
});

describe("transitionMemorial — legality (25 pairs)", () => {
  it.each(ALL_PAIRS)("%s -> %s agrees with canTransitionMemorialStatus", (from, to) => {
    const result = transitionMemorial({ status: from, firstPublishedAt: null }, to);
    expect(result.ok).toBe(ALLOWED_SET.has(`${from}->${to}`));
  });

  it("never throws — an illegal transition is a rejection, not an exception", () => {
    expect(() =>
      transitionMemorial({ status: "draft", firstPublishedAt: null }, "published"),
    ).not.toThrow();
    expect(() =>
      transitionMemorial({ status: "archived", firstPublishedAt: null }, "draft"),
    ).not.toThrow();
  });

  it("returns a specific, safe reason naming both states for a refused transition", () => {
    const result = transitionMemorial(
      { status: "archived", firstPublishedAt: "2026-01-01T00:00:00Z" },
      "draft",
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("archived");
      expect(result.reason).toContain("draft");
    }
  });
});

describe("transitionMemorial — isFirstPublication (Mission 005 rule 3, no `republished` status)", () => {
  it("flags ready -> published as the first publication when firstPublishedAt is still null", () => {
    const result = transitionMemorial({ status: "ready", firstPublishedAt: null }, "published");

    expect(result).toEqual({ ok: true, status: "published", isFirstPublication: true });
  });

  it("flags editing -> published as a republication, not a first publication, once firstPublishedAt is set", () => {
    const result = transitionMemorial(
      { status: "editing", firstPublishedAt: "2026-01-01T00:00:00Z" },
      "published",
    );

    expect(result).toEqual({ ok: true, status: "published", isFirstPublication: false });
  });

  it("is always false for a transition that doesn't target published", () => {
    const result = transitionMemorial({ status: "draft", firstPublishedAt: null }, "ready");

    expect(result).toEqual({ ok: true, status: "ready", isFirstPublication: false });
  });

  it("is false on a rejected transition's absent success payload (ok: false carries no isFirstPublication)", () => {
    const result = transitionMemorial({ status: "draft", firstPublishedAt: null }, "editing");

    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty("isFirstPublication");
  });
});
