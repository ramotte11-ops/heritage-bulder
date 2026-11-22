import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { getHeritageActor, createServerSupabaseClient, loadOwnerFreePublicationStatus, listOwnedMemorials, listTributeDetails } =
  vi.hoisted(() => ({
    getHeritageActor: vi.fn(),
    createServerSupabaseClient: vi.fn(),
    loadOwnerFreePublicationStatus: vi.fn(),
    listOwnedMemorials: vi.fn(),
    listTributeDetails: vi.fn(),
  }));

vi.mock("@/lib/auth/heritage-session", () => ({ getHeritageActor }));
vi.mock("@/lib/supabase/server-client", () => ({ createServerSupabaseClient }));
vi.mock("@/lib/memorial/load-owner-free-publication-status", () => ({ loadOwnerFreePublicationStatus }));
vi.mock("@/lib/adapters/supabase/owned-memorial-list-repository", () => ({
  SupabaseOwnedMemorialListRepository: class {
    listOwnedMemorials = listOwnedMemorials;
  },
}));
vi.mock("@/lib/adapters/supabase/family-space-repository", () => ({
  SupabaseFamilySpaceRepository: class {
    listTributeDetails = listTributeDetails;
  },
}));

const { loadFamilySpace } = await import("./load-family-space");
const { buildFamilyTributes } = await import("./family-space");

const OWNER = { id: "owner-1", authUserId: "user-1", email: "famille@example.test", createdAt: "", updatedAt: "" };
const OWNER_ACTOR = {
  audience: "owner",
  identity: { id: "user-1", email: "famille@example.test", app_metadata: {} },
  owner: OWNER,
  isHeritageAdmin: false,
};
const PUBLICATION = { status: "available" };
const MEMORIAL = {
  id: "memorial-1",
  displayName: "Jeanne",
  createdAt: "2026-11-01T00:00:00.000Z",
  language: "fr",
  publicSlug: null,
  freeDeadlines: null,
};
const DETAILS = new Map([["memorial-1", { memorialId: "memorial-1", status: "draft", birth: null, death: null, photo: null }]]);

function nominal() {
  getHeritageActor.mockResolvedValue(OWNER_ACTOR);
  createServerSupabaseClient.mockResolvedValue({});
  loadOwnerFreePublicationStatus.mockResolvedValue(PUBLICATION);
  listOwnedMemorials.mockResolvedValue([MEMORIAL]);
  listTributeDetails.mockResolvedValue(DETAILS);
}

afterEach(() => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

describe("loadFamilySpace — access gate (no read before it)", () => {
  it("a visitor gets « visitor » and nothing is read", async () => {
    getHeritageActor.mockResolvedValue({ audience: "visitor" });
    expect(await loadFamilySpace()).toEqual({ status: "visitor" });
    for (const read of [createServerSupabaseClient, loadOwnerFreePublicationStatus, listOwnedMemorials, listTributeDetails]) {
      expect(read).not.toHaveBeenCalled();
    }
  });

  it("a signed-in person who is not an Owner gets « none » and nothing is read", async () => {
    getHeritageActor.mockResolvedValue({ audience: "authenticated", identity: { id: "u", email: "x@example.test", app_metadata: {} }, owner: null, isHeritageAdmin: false });
    const space = await loadFamilySpace();
    expect(space).toMatchObject({ status: "none", isOwner: false });
    for (const read of [createServerSupabaseClient, loadOwnerFreePublicationStatus, listOwnedMemorials, listTributeDetails]) {
      expect(read).not.toHaveBeenCalled();
    }
  });

  it("a failed actor resolution gets « error » and nothing is read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getHeritageActor.mockRejectedValue(new Error("auth down"));
    expect(await loadFamilySpace()).toEqual({ status: "error", email: null });
    expect(listOwnedMemorials).not.toHaveBeenCalled();
  });

  it("every read is scoped to the Owner resolved from the session", async () => {
    nominal();
    await loadFamilySpace();
    expect(loadOwnerFreePublicationStatus).toHaveBeenCalledWith("owner-1");
    expect(listOwnedMemorials).toHaveBeenCalledWith("owner-1");
    expect(listTributeDetails).toHaveBeenCalledWith("owner-1");
  });
});

describe("loadFamilySpace — outcomes (unchanged)", () => {
  it("ready: the tributes, the publication status, the actor and a repository for later reads", async () => {
    nominal();
    const space = await loadFamilySpace();
    expect(space).toMatchObject({ status: "ready", email: "famille@example.test", publication: PUBLICATION, actor: OWNER_ACTOR });
    if (space.status !== "ready") throw new Error("expected ready");
    expect(space.tributes).toHaveLength(1);
    expect(space.tributes).toEqual(buildFamilyTributes([MEMORIAL] as never, DETAILS as never));
    expect(space.repository).toBeDefined();
  });

  it("an Owner with no tribute gets « none » with the publication status", async () => {
    nominal();
    listOwnedMemorials.mockResolvedValue([]);
    expect(await loadFamilySpace()).toEqual({ status: "none", email: "famille@example.test", isOwner: true, publication: PUBLICATION });
  });

  it("a failed tribute list gets « error », even when the other reads succeeded", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    nominal();
    listOwnedMemorials.mockRejectedValue(new Error("list down"));
    expect(await loadFamilySpace()).toEqual({ status: "error", email: "famille@example.test" });
  });

  it("a failed session client gets « error »", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    nominal();
    createServerSupabaseClient.mockRejectedValue(new Error("cookies unavailable"));
    expect(await loadFamilySpace()).toEqual({ status: "error", email: "famille@example.test" });
  });

  it("failed details only drop the enrichment: every tribute is still reached", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    nominal();
    listTributeDetails.mockRejectedValue(new Error("details down"));
    const space = await loadFamilySpace();
    expect(space.status).toBe("ready");
    if (space.status !== "ready") throw new Error("expected ready");
    expect(space.tributes.map((tribute) => tribute.id)).toEqual(["memorial-1"]);
    expect(logged).toHaveBeenCalledWith("Owner space: tribute details failed:", "details down");
  });
});

describe("loadFamilySpace — Mission 04-G / L1.2: the three reads in flight together", () => {
  it("publication status, tribute list and details are all requested before any of them answers", async () => {
    nominal();
    let answerPublication!: (value: unknown) => void;
    loadOwnerFreePublicationStatus.mockImplementation(() => new Promise((resolve) => (answerPublication = resolve)));
    let answerList!: (value: unknown) => void;
    listOwnedMemorials.mockImplementation(() => new Promise((resolve) => (answerList = resolve)));

    const pending = loadFamilySpace();
    for (let i = 0; i < 10; i++) await Promise.resolve();

    expect(loadOwnerFreePublicationStatus).toHaveBeenCalledOnce();
    expect(listOwnedMemorials).toHaveBeenCalledOnce();
    expect(listTributeDetails).toHaveBeenCalledOnce();

    answerPublication(PUBLICATION);
    answerList([MEMORIAL]);
    expect((await pending).status).toBe("ready");
  });
});
