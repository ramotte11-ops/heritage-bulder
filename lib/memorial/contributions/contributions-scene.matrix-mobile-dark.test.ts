import { describe, it } from "vitest";
import { checkMatrix } from "@/lib/memorial/contributions/contributions-scene-matrix";

describe("M4.1 Contributions — matrice des 120 compositions, mobile dark", () => {
  it("chaque composition est résolue avec ses invariants, ou STOP explicite attendu", () => {
    checkMatrix("mobile", "dark");
  }, 600_000);
});
