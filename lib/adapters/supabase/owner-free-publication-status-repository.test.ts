import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

import { SupabaseOwnerFreePublicationStatusRepository } from "./owner-free-publication-status-repository";

const WINDOW_UNTIL = "2026-11-25T09:00:00+00:00";
const RENEWS_AT = "2027-11-15T09:00:00+00:00";

function row(overrides: Record<string, unknown> = {}) {
  return {
    free_status: "window_open",
    window_status: "inherit",
    window_until: WINDOW_UNTIL,
    renewal: "not_applicable",
    renews_at: null,
    active_free_drafts: 2,
    max_free_drafts: 3,
    ...overrides,
  };
}

function repository(response: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(response);
  return {
    rpc,
    repository: new SupabaseOwnerFreePublicationStatusRepository(
      { rpc } as unknown as SupabaseClient,
    ),
  };
}

describe("SupabaseOwnerFreePublicationStatusRepository", () => {
  it.each(["inherit", "waiver_inherit"])(
    "maps an open initial or waiver window (%s), using the database date",
    async (window_status) => {
      const { repository: subject, rpc } = repository({
        data: [row({ window_status })],
        error: null,
      });

      await expect(subject.read("owner-1")).resolves.toEqual({
        status: "window_open",
        windowUntil: WINDOW_UNTIL,
        activeFreeDrafts: 2,
        maxFreeDrafts: 3,
      });
      expect(rpc).toHaveBeenCalledWith("owner_free_publication_status_v1", {
        p_owner_id: "owner-1",
      });
    },
  );

  it.each(["open_new", "waiver_new"])(
    "maps a renewed or waived right that opens on the next save (%s)",
    async (window_status) => {
      const { repository: subject } = repository({
        data: [row({
          free_status: "opens_on_next_save",
          window_status,
          window_until: null,
          active_free_drafts: 0,
        })],
        error: null,
      });

      await expect(subject.read("owner-1")).resolves.toEqual({
        status: "opens_on_next_save",
        activeFreeDrafts: 0,
        maxFreeDrafts: 3,
      });
    },
  );

  it("maps a used right with its exact scheduled renewal", async () => {
    const { repository: subject } = repository({
      data: [row({
        free_status: "used",
        window_status: "unavailable",
        window_until: null,
        renewal: "scheduled",
        renews_at: RENEWS_AT,
        active_free_drafts: 1,
      })],
      error: null,
    });

    await expect(subject.read("owner-1")).resolves.toEqual({
      status: "used",
      renewsAt: RENEWS_AT,
      activeFreeDrafts: 1,
      maxFreeDrafts: 3,
    });
  });

  it("maps an expired window with an undetermined renewal and invents no date", async () => {
    const { repository: subject } = repository({
      data: [row({
        free_status: "expired",
        window_status: "unavailable",
        window_until: null,
        renewal: "undetermined",
        renews_at: null,
      })],
      error: null,
    });

    await expect(subject.read("owner-1")).resolves.toEqual({
      status: "expired",
      renewsAt: null,
      activeFreeDrafts: 2,
      maxFreeDrafts: 3,
    });
  });

  it.each([
    ["no row", { data: [], error: null }],
    ["more than one row", { data: [row(), row()], error: null }],
    ["RPC error", { data: null, error: { message: "permission denied" } }],
    ["refused owner", { data: [row({ free_status: "refused" })], error: null }],
    ["unexpected status", { data: [row({ free_status: "maybe" })], error: null }],
    ["open window without a date", { data: [row({ window_until: null })], error: null }],
    ["scheduled renewal without a date", { data: [row({ free_status: "used", window_status: "unavailable", renewal: "scheduled", renews_at: null })], error: null }],
    ["malformed counters", { data: [row({ active_free_drafts: "2" })], error: null }],
  ])("fails closed to unknown for %s", async (_label, response) => {
    const { repository: subject } = repository(response);
    await expect(subject.read("owner-1")).resolves.toEqual({ status: "unknown" });
  });

  it("fails closed when the RPC itself throws", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("network"));
    const subject = new SupabaseOwnerFreePublicationStatusRepository(
      { rpc } as unknown as SupabaseClient,
    );
    await expect(subject.read("owner-1")).resolves.toEqual({ status: "unknown" });
  });
});
