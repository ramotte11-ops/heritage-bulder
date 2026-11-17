import { describe, it } from "vitest";
import { checkMatrix } from "@/lib/memorial/contributions/contributions-scene-matrix";

describe("M4.1 Contributions — matrice des 120 compositions, mobile light", () => {
  it("chaque composition est résolue avec ses invariants, ou STOP explicite attendu", () => {
    checkMatrix("mobile", "light");
  }, 600_000);
});
