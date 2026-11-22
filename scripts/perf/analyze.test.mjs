import { describe, expect, it } from "vitest";
import { groupByAction, sequentialDepth } from "./analyze.mjs";

const call = (t0, t1) => ({ t0, t1, method: "GET", path: "/x" });

describe("perf bench — sequential depth", () => {
  it("counts a strict chain call by call", () => {
    expect(sequentialDepth([call(0, 100), call(101, 200), call(201, 300)])).toBe(3);
  });

  it("counts calls in flight together as one level", () => {
    expect(sequentialDepth([call(0, 100), call(101, 200), call(101, 200), call(101, 200)])).toBe(2);
  });

  it("follows the longest chain when branches differ", () => {
    // A → (B ∥ C→D): depth 3.
    expect(sequentialDepth([call(0, 100), call(101, 200), call(101, 150), call(151, 250)])).toBe(3);
  });

  it("is 0 without calls", () => {
    expect(sequentialDepth([])).toBe(0);
  });
});

describe("perf bench — grouping by marked action", () => {
  it("assigns each call to the action whose marks surround it", () => {
    const groups = groupByAction([
      { mark: "BEGIN a", t: 0 },
      { t0: 1, t1: 2 },
      { mark: "END a", t: 3 },
      { t0: 4, t1: 5 },
      { mark: "BEGIN b", t: 6 },
      { t0: 7, t1: 8 },
      { t0: 7, t1: 9 },
      { mark: "END b", t: 10 },
    ]);
    expect(groups.get("a").calls).toHaveLength(1);
    expect(groups.get("b").calls).toHaveLength(2);
  });
});
