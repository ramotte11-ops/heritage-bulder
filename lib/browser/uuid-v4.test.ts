import { describe, expect, it, vi } from "vitest";
import { createUuidV4 } from "./uuid-v4";

describe("createUuidV4", () => {
  it("uses crypto.randomUUID when the secure-context API is available", () => {
    const native = "00000000-0000-4000-8000-000000000001" as `${string}-${string}-${string}-${string}-${string}`;
    const randomUUID = vi.fn(() => native);
    const getRandomValues = vi.fn();

    expect(createUuidV4({ randomUUID, getRandomValues } as unknown as Crypto)).toBe(native);
    expect(randomUUID).toHaveBeenCalledOnce();
    expect(getRandomValues).not.toHaveBeenCalled();
  });

  it("creates a conforming UUID v4 with getRandomValues when randomUUID is unavailable", () => {
    const getRandomValues = vi.fn(<T extends ArrayBufferView | null>(array: T): T => {
      const bytes = array as Uint8Array;
      for (let index = 0; index < bytes.length; index += 1) bytes[index] = index * 0x11;
      return array;
    });
    const random = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("Math.random must not be used");
    });

    expect(createUuidV4({ getRandomValues } as unknown as Crypto)).toBe("00112233-4455-4677-8899-aabbccddeeff");
    expect(getRandomValues).toHaveBeenCalledOnce();
    expect(random).not.toHaveBeenCalled();
  });
});
