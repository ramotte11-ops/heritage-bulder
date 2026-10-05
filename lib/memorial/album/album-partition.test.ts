import { describe, expect, it } from "vitest";
import { partitionAlbum, partitionSizes, phaseOf, popcount } from "@/lib/memorial/album/album-partition";

describe("A13 Album — partition (Handoff §2)", () => {
  it("reproduces every authoritative example", () => {
    expect(partitionSizes(7)).toEqual([5, 2]);
    expect(partitionSizes(10)).toEqual([5, 5]);
    expect(partitionSizes(11)).toEqual([5, 4, 2]);
    expect(partitionSizes(15)).toEqual([5, 5, 5]);
    expect(partitionSizes(16)).toEqual([5, 5, 4, 2]);
    expect(partitionSizes(20)).toEqual([5, 5, 5, 5]);
    expect(partitionSizes(30)).toEqual(Array(6).fill(5));
    expect(partitionSizes(40)).toEqual(Array(8).fill(5));
  });

  it("never emits a singleton, only 2…5, and covers every media once (2…500)", () => {
    for (let n = 2; n <= 500; n++) {
      const s = partitionSizes(n);
      expect(s.reduce((a, b) => a + b, 0)).toBe(n);
      expect(s.every((x) => x >= 2 && x <= 5)).toBe(true);
      // full groups first, closures only at the end
      const firstPartial = s.findIndex((x) => x !== 5);
      if (firstPartial >= 0) expect(s.slice(firstPartial).every((x) => x !== 5)).toBe(true);
    }
  });

  it("has no Album for 0 or 1 media", () => {
    expect(partitionAlbum(0)).toEqual([]);
    expect(partitionAlbum(1)).toEqual([]);
  });

  it("keeps the family order: contiguous slices, media i never after media i+1", () => {
    for (const n of [7, 10, 11, 20, 40, 41, 43]) {
      const g = partitionAlbum(n);
      let next = 0;
      for (const x of g) {
        expect(x.start).toBe(next);
        next += x.size;
      }
      expect(next).toBe(n);
    }
  });

  it("phases full groups with the non-periodic popcount rule (A B B A B A A B)", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(phaseOf).join("")).toBe("ABBABAAB");
    expect(popcount(0b1011)).toBe(3);
    expect(partitionAlbum(40).map((g) => g.grammar).join("")).toBe("ABBABAAB");
    // not a simple alternation
    expect(partitionAlbum(40).map((g) => g.grammar).join("")).not.toBe("ABABABAB");
  });

  it("gives every remainder its dedicated closure grammar", () => {
    expect(partitionAlbum(7).map((g) => g.grammar)).toEqual(["A", "C2"]);
    expect(partitionAlbum(8).map((g) => g.grammar)).toEqual(["A", "C3"]);
    expect(partitionAlbum(9).map((g) => g.grammar)).toEqual(["A", "C4"]);
    expect(partitionAlbum(11).map((g) => g.grammar)).toEqual(["A", "C4", "C2"]);
    expect(partitionAlbum(6).map((g) => g.grammar)).toEqual(["C4", "C2"]);
    expect(partitionAlbum(11)[1].phase).toBeNull();
  });
});
