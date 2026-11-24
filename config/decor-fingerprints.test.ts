import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DECOR_FINGERPRINTS } from "./decor-fingerprints";

const ROOT = process.cwd();
const PUBLIC_ROOT = path.join(ROOT, "public");
const FINGERPRINT_ROOT = path.join(PUBLIC_ROOT, "assets", "fingerprinted");
const ENTRIES = Object.values(DECOR_FINGERPRINTS);

function publicFile(src: string): string {
  return path.join(PUBLIC_ROOT, ...src.replace(/^\//, "").split("/"));
}

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return /\.(?:css|js|jsx|mjs|ts|tsx)$/.test(entry.name) ? [absolute] : [];
  });
}

describe("Mission 06-D — immutable decor fingerprints", () => {
  it("contains exactly the twelve audited resources and no untracked immutable file", () => {
    expect(ENTRIES).toHaveLength(12);
    expect(new Set(ENTRIES.map((entry) => entry.src)).size).toBe(12);
    expect(new Set(ENTRIES.map((entry) => entry.sha256)).size).toBe(12);

    const files = readdirSync(FINGERPRINT_ROOT).sort();
    const declared = ENTRIES.map((entry) => path.basename(entry.src)).sort();
    expect(files).toEqual(declared);
  });

  it.each(Object.entries(DECOR_FINGERPRINTS))(
    "%s keeps its original bytes and binds its URL to their complete SHA-256",
    (_key, entry) => {
      const original = readFileSync(publicFile(entry.originalSrc));
      const fingerprinted = readFileSync(publicFile(entry.src));
      const digest = createHash("sha256").update(fingerprinted).digest("hex");

      expect(fingerprinted.equals(original)).toBe(true);
      expect(fingerprinted.byteLength).toBe(entry.bytes);
      expect(digest).toBe(entry.sha256);
      expect(path.basename(entry.src)).toBe(`${entry.sha256}-${path.basename(entry.originalSrc)}`);
    },
  );

  it("leaves no runtime reference able to bypass the fingerprinted URLs", () => {
    const roots = ["app", "components", "config", "styles"].map((dir) => path.join(ROOT, dir));
    const manifest = path.join(ROOT, "config", "decor-fingerprints.ts");

    for (const file of roots.flatMap(sourceFiles)) {
      if (file === manifest) continue;
      const source = readFileSync(file, "utf8");
      for (const entry of ENTRIES) {
        expect(source, `${path.relative(ROOT, file)} still references ${entry.originalSrc}`).not.toContain(
          entry.originalSrc,
        );
      }
    }
  });

  it("scopes the one-year immutable header to the fingerprint directory only", () => {
    const netlify = readFileSync(path.join(ROOT, "netlify.toml"), "utf8");
    expect(netlify).toContain('for = "/assets/fingerprinted/*"');
    expect(netlify).toContain('Cache-Control = "public, max-age=31536000, immutable"');
    expect(netlify).not.toMatch(/for\s*=\s*["']\/assets\/\*["']/);
    expect(netlify.match(/max-age=31536000, immutable/g)).toHaveLength(1);
  });
});
