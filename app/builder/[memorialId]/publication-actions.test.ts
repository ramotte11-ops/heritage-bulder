import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * QG 008 Lot 3 — the confirmation of « Publier ». The server entry point
 * is mocked; what is tested here is what the action accepts from the
 * browser (primitives only) and what it answers (a plain outcome).
 */

const { publishFromPreviewForCurrentOwner } = vi.hoisted(() => ({ publishFromPreviewForCurrentOwner: vi.fn() }));
vi.mock("@/lib/memorial/server-publication", () => ({ publishFromPreviewForCurrentOwner }));

const { publishFromPreviewAction } = await import("./publication-actions");

const DIGEST = "a".repeat(64);
beforeEach(() => {
  vi.clearAllMocks();
  publishFromPreviewForCurrentOwner.mockResolvedValue({ ok: true, outcome: "published", publishedAt: "p", firstPublishedAt: "f", revision: 3 });
});

describe("publishFromPreviewAction", () => {
  it("forwards only the memorial id, the revision, the fingerprint and the gallery choice", async () => {
    await expect(publishFromPreviewAction("memorial-a", 3, DIGEST, ["m1"])).resolves.toBe("published");
    expect(publishFromPreviewForCurrentOwner).toHaveBeenCalledExactlyOnceWith("memorial-a", 3, DIGEST, ["m1"]);
  });

  it("answers already_published only when the server proved it", async () => {
    publishFromPreviewForCurrentOwner.mockResolvedValue({ ok: true, outcome: "already_published", publishedAt: "p", firstPublishedAt: "f", revision: 3 });
    await expect(publishFromPreviewAction("memorial-a", 3, DIGEST)).resolves.toBe("already_published");
  });

  it.each([
    ["a non-integer revision", ["memorial-a", 1.5, DIGEST]],
    ["a negative revision", ["memorial-a", -1, DIGEST]],
    ["a malformed fingerprint", ["memorial-a", 3, "not-a-digest"]],
    ["a non-list gallery choice", ["memorial-a", 3, DIGEST, "all"]],
    ["a non-string gallery id", ["memorial-a", 3, DIGEST, [1]]],
    ["a non-string memorial id", [42, 3, DIGEST]],
  ])("refuses %s without calling the server", async (_label, args) => {
    await expect((publishFromPreviewAction as (...a: unknown[]) => Promise<string>)(...(args as unknown[]))).resolves.toBe("failed");
    expect(publishFromPreviewForCurrentOwner).not.toHaveBeenCalled();
  });

  it.each([
    [{ ok: false, code: "hero_photo_required" }, "hero_photo_required"],
    [{ ok: false, code: "preview_outdated" }, "preview_outdated"],
    [{ ok: false, code: "publication_conflict" }, "preview_outdated"],
    [{ ok: false, code: "free_window_closed" }, "free_window_closed"],
    [{ ok: false, code: "free_quota_reached" }, "free_quota_reached"],
    [{ ok: false, code: "not_found_or_forbidden" }, "signed_out"],
  ])("maps %j to %s", async (result, outcome) => {
    publishFromPreviewForCurrentOwner.mockResolvedValue(result);
    await expect(publishFromPreviewAction("memorial-a", 3, DIGEST)).resolves.toBe(outcome);
  });

  it("an unexpected server error answers « failed », never a technical message", async () => {
    publishFromPreviewForCurrentOwner.mockRejectedValue(new Error("network down"));
    await expect(publishFromPreviewAction("memorial-a", 3, DIGEST)).resolves.toBe("failed");
  });

  it("is a Server Action that takes no identity or content parameter", () => {
    const code = readFileSync(path.resolve(import.meta.dirname, "publication-actions.ts"), "utf8");
    expect(code.startsWith('"use server";')).toBe(true);
    expect(code).not.toMatch(/ownerId|accessLevel|content\s*:/);
  });
});
