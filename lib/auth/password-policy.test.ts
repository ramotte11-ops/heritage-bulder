import { describe, expect, it } from "vitest";
import { checkPassword, PASSWORD_MIN_LENGTH } from "./password-policy";

describe("checkPassword (QG 003)", () => {
  it("accepts any 8+ character password without composition rules", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(checkPassword("lavandes")).toBeNull();
    expect(checkPassword("les lilas du jardin")).toBeNull();
    expect(checkPassword("ÉTÉ à Séville 1987")).toBeNull();
  });

  it("refuses fewer than 8 characters (counted as characters, not bytes)", () => {
    expect(checkPassword("1234567")).toBe("too_short");
    expect(checkPassword("éééééé")).toBe("too_short");
  });

  it("refuses more than 72 bytes, which Supabase Auth would silently truncate", () => {
    expect(checkPassword("a".repeat(72))).toBeNull();
    expect(checkPassword("a".repeat(73))).toBe("too_long");
    expect(checkPassword("é".repeat(37))).toBe("too_long");
  });

  it("refuses the most common passwords, whatever their case", () => {
    for (const common of ["12345678", "Password1", "AZERTYUIOP", "motdepasse", "contraseña", "Heritage123"]) {
      expect(checkPassword(common)).toBe("too_common");
    }
  });

  it("refuses the address itself or its local part", () => {
    expect(checkPassword("Famille.Martin", "famille.martin@example.com")).toBe("too_common");
    expect(checkPassword("famille.martin@example.com", "famille.martin@example.com")).toBe("too_common");
    expect(checkPassword("souvenirs de mamie", "famille.martin@example.com")).toBeNull();
  });
});
