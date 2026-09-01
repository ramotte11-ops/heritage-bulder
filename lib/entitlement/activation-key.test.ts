import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  activationKeyHashEquals,
  canonicalHashInput,
  formatActivationKey,
  generateActivationKey,
  hashActivationKey,
  parseActivationKey,
} from "./activation-key";

const VALID = "HH1-ABCDEFGH-JKMNPQRS-TVWXYZ01-23456789";
const PAYLOAD = "ABCDEFGHJKMNPQRSTVWXYZ0123456789";

describe("generateActivationKey", () => {
  it("produces the canonical HH1 shape", () => {
    const { rawKey } = generateActivationKey();

    expect(rawKey).toMatch(/^HH1-[0-9A-HJKMNP-TV-Z]{8}-[0-9A-HJKMNP-TV-Z]{8}-[0-9A-HJKMNP-TV-Z]{8}-[0-9A-HJKMNP-TV-Z]{8}$/);
  });

  it("carries exactly 32 Crockford characters, i.e. 160 bits", () => {
    const { key } = generateActivationKey();

    expect(key.payload).toHaveLength(32);
    expect(key.version).toBe("HH1");
    // 32 symbols x 5 bits = 160 bits, the full randomBytes(20).
    expect(key.payload.length * 5).toBe(160);
  });

  it("never emits the excluded Crockford letters I, L, O or U", () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      expect(generateActivationKey().key.payload).not.toMatch(/[ILOU]/);
    }
  });

  it("does not repeat itself", () => {
    const seen = new Set<string>();
    for (let attempt = 0; attempt < 500; attempt += 1) seen.add(generateActivationKey().rawKey);

    expect(seen.size).toBe(500);
  });

  it("returns a hash that matches the key it returns", () => {
    const { key, hash } = generateActivationKey();

    expect(hash).toBe(hashActivationKey(key));
  });

  it("round-trips through the parser", () => {
    const { rawKey, key } = generateActivationKey();
    const parsed = parseActivationKey(rawKey);

    expect(parsed).toEqual({ ok: true, key });
  });
});

describe("parseActivationKey — what it forgives", () => {
  it("accepts the canonical form", () => {
    expect(parseActivationKey(VALID)).toEqual({ ok: true, key: { version: "HH1", payload: PAYLOAD } });
  });

  it("is case-insensitive", () => {
    expect(parseActivationKey(VALID.toLowerCase())).toEqual({
      ok: true,
      key: { version: "HH1", payload: PAYLOAD },
    });
  });

  it("trims surrounding whitespace", () => {
    expect(parseActivationKey(`\n\t  ${VALID}  \n`)).toEqual({
      ok: true,
      key: { version: "HH1", payload: PAYLOAD },
    });
  });

  it("accepts any regrouping of the dashes, including none", () => {
    const noDashes = `HH1-${PAYLOAD}`;
    const regrouped = `HH1-ABCD-EFGH-JKMN-PQRS-TVWX-YZ01-2345-6789`;

    expect(parseActivationKey(noDashes)).toEqual({ ok: true, key: { version: "HH1", payload: PAYLOAD } });
    expect(parseActivationKey(regrouped)).toEqual({ ok: true, key: { version: "HH1", payload: PAYLOAD } });
  });

  it.each([
    ["I -> 1", "HH1-IBCDEFGH-JKMNPQRS-TVWXYZ01-2345678I", "1BCDEFGHJKMNPQRSTVWXYZ0123456781"],
    ["L -> 1", "HH1-LBCDEFGH-JKMNPQRS-TVWXYZ01-2345678L", "1BCDEFGHJKMNPQRSTVWXYZ0123456781"],
    ["O -> 0", "HH1-OBCDEFGH-JKMNPQRS-TVWXYZ01-2345678O", "0BCDEFGHJKMNPQRSTVWXYZ0123456780"],
    ["lowercase i/l/o too", "HH1-ibcdefgh-jkmnpqrs-tvwxyz01-2345678o", "1BCDEFGHJKMNPQRSTVWXYZ0123456780"],
  ])("applies Crockford's transcription mapping: %s", (_label, input, expected) => {
    expect(parseActivationKey(input)).toEqual({ ok: true, key: { version: "HH1", payload: expected } });
  });
});

describe("parseActivationKey — what it refuses", () => {
  it.each([
    ["an empty string", "", "empty"],
    ["only whitespace", "   ", "empty"],
    ["no prefix at all", PAYLOAD, "missingPrefix"],
    ["a foreign prefix", `XY1-${PAYLOAD}`, "missingPrefix"],
    ["a future version", `HH2-${PAYLOAD}`, "unsupportedVersion"],
    ["another future version", `HH99-${PAYLOAD}`, "unsupportedVersion"],
    ["internal whitespace", `HH1-ABCDEFGH JKMNPQRS-TVWXYZ01-23456789`, "internalWhitespace"],
    ["the excluded letter U", `HH1-UBCDEFGH-JKMNPQRS-TVWXYZ01-23456789`, "invalidCharacter"],
    ["a non-alphabet symbol", `HH1-@BCDEFGH-JKMNPQRS-TVWXYZ01-23456789`, "invalidCharacter"],
    ["a payload that is too short", `HH1-${PAYLOAD.slice(0, 31)}`, "invalidLength"],
    ["a payload that is too long", `HH1-${PAYLOAD}A`, "invalidLength"],
    ["an empty payload", "HH1-", "invalidLength"],
  ])("refuses %s", (_label, input, reason) => {
    expect(parseActivationKey(input)).toEqual({ ok: false, reason });
  });

  it("refuses an arbitrary string of the right length — normalisation is not a licence", () => {
    expect(parseActivationKey("a".repeat(40)).ok).toBe(false);
    expect(parseActivationKey(`HH1-${"!".repeat(32)}`).ok).toBe(false);
  });
});

describe("hashActivationKey — the version is part of what is hashed", () => {
  it("is sha256 of `VERSION:PAYLOAD`, lowercase hex", () => {
    const key = { version: "HH1", payload: PAYLOAD };

    expect(canonicalHashInput(key)).toBe(`HH1:${PAYLOAD}`);
    expect(hashActivationKey(key)).toBe(
      createHash("sha256").update(`HH1:${PAYLOAD}`, "utf8").digest("hex"),
    );
    expect(hashActivationKey(key)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable across calls", () => {
    const key = { version: "HH1", payload: PAYLOAD };

    expect(hashActivationKey(key)).toBe(hashActivationKey(key));
  });

  it("gives the SAME payload a DIFFERENT hash under a different version", () => {
    // The property the whole canonical-input design exists for: a format
    // migration must never make an HH1 key and an HH2 key with the same
    // characters open the same right.
    const asV1 = hashActivationKey({ version: "HH1", payload: PAYLOAD });
    const asV2 = hashActivationKey({ version: "HH2", payload: PAYLOAD });

    expect(asV2).not.toBe(asV1);
    // And neither is simply the hash of the bare payload.
    const bare = createHash("sha256").update(PAYLOAD, "utf8").digest("hex");
    expect(asV1).not.toBe(bare);
  });

  it("distinguishes two keys differing by a single character", () => {
    const a = hashActivationKey({ version: "HH1", payload: PAYLOAD });
    const b = hashActivationKey({ version: "HH1", payload: `${PAYLOAD.slice(0, 31)}A` });

    expect(a).not.toBe(b);
  });
});

describe("formatActivationKey", () => {
  it("renders groups of eight", () => {
    expect(formatActivationKey({ version: "HH1", payload: PAYLOAD })).toBe(VALID);
  });
});

describe("activationKeyHashEquals", () => {
  it("compares equal and unequal hashes correctly", () => {
    const a = hashActivationKey({ version: "HH1", payload: PAYLOAD });

    expect(activationKeyHashEquals(a, a)).toBe(true);
    expect(activationKeyHashEquals(a, hashActivationKey({ version: "HH1", payload: `${PAYLOAD.slice(0, 31)}A` }))).toBe(false);
    expect(activationKeyHashEquals(a, "short")).toBe(false);
  });
});
