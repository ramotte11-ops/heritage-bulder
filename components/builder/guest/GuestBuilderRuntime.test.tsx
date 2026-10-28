// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  createGuestDraftV3,
  updateGuestDraftV3,
  type GuestDraftPhotoAsset,
  type GuestDraftV3,
} from "@/lib/guest-draft/guest-draft-v3";
import type {
  GuestDraftV3PhotoWriteResult,
  GuestDraftV3ReadResult,
  GuestDraftV3WriteResult,
} from "@/lib/guest-draft/guest-draft-v3-store";
import type { GuestBuilderDraftStore } from "@/lib/guest-draft/guest-builder-runtime";
import { guestHeroStepProgress } from "@/lib/guest-draft/guest-hero-media";
import { translate } from "@/lib/i18n/translate";
import type { CeremonyContent } from "@/types/ceremony";
import type { MemorialContent } from "@/types/memorial";

type GuestFlowContent = {
  guidedFlow: Record<string, { status: string; answer?: string }>;
  hero: { photo: unknown };
};

function localContent(draft: GuestDraftV3): GuestFlowContent {
  return draft.content as unknown as GuestFlowContent;
}

const { useRouter } = vi.hoisted(() => ({
  useRouter: vi.fn(() => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() })),
}));
vi.mock("next/navigation", () => ({ useRouter }));

vi.mock("next/font/google", () => ({
  Playfair_Display: () => ({ variable: "--font-heritage-serif-mock", className: "" }),
  Inter: () => ({ variable: "--font-heritage-sans-mock", className: "" }),
  Cormorant_Garamond: () => ({ variable: "--font-heritage-hero-serif-mock", className: "" }),
  La_Belle_Aurore: () => ({ variable: "--font-heritage-hero-script-mock", className: "" }),
  EB_Garamond: () => ({ variable: "--font-heritage-ceremony-serif-mock", className: "" }),
}));

const { GuestBuilderRuntime } = await import("./GuestBuilderRuntime");

class MemoryStore implements GuestBuilderDraftStore {
  value: GuestDraftV3 | null;
  assets = new Map<string, GuestDraftPhotoAsset>();

  constructor(value: GuestDraftV3 | null) {
    this.value = value;
  }

  async read(): Promise<GuestDraftV3ReadResult> {
    return this.value === null
      ? { status: "empty" }
      : { status: "ready", draft: structuredClone(this.value) };
  }

  async save(draft: GuestDraftV3, expectedRevision: number | null): Promise<GuestDraftV3WriteResult> {
    if (
      (expectedRevision === null && this.value !== null)
      || (expectedRevision !== null && this.value?.revision !== expectedRevision)
    ) {
      return { ok: false, reason: "revision_conflict" };
    }
    this.value = structuredClone(draft);
    return { ok: true };
  }

  async readPhoto(localId: string) {
    const asset = this.assets.get(localId);
    return asset === undefined
      ? { ok: false as const, reason: "photo_not_found" as const }
      : { ok: true as const, asset: structuredClone(asset) };
  }
  async addPhoto(): Promise<GuestDraftV3PhotoWriteResult> { return { ok: false, reason: "photo_not_found" }; }
  async replacePhoto(): Promise<GuestDraftV3PhotoWriteResult> { return { ok: false, reason: "photo_not_found" }; }
  async updatePhotoPlacement(): Promise<GuestDraftV3PhotoWriteResult> { return { ok: false, reason: "photo_not_found" }; }
}

function newDraft(): GuestDraftV3 {
  const created = createGuestDraftV3({
    draftId: "guest-ui-draft",
    transferKey: "guest-ui-transfer",
    now: "2026-10-26T09:00:00.000Z",
  });
  if (!created.ok) throw new Error(created.reason);
  return created.draft;
}

function revealDraft(): { draft: GuestDraftV3; asset: GuestDraftPhotoAsset } {
  const created = createGuestDraftV3({
    draftId: "guest-reveal-draft",
    transferKey: "guest-reveal-transfer",
    now: "2026-10-26T10:00:00.000Z",
    language: "fr",
    content: {
      hero: {
        displayName: "Jeanne",
        birth: null,
        death: null,
        shortPhrase: "Toujours dans nos cœurs",
        photo: null,
      },
      guidedFlow: {
        T04: { status: "skipped" },
        A00: { status: "completed", answer: "no" },
        T05: { status: "completed" },
        T06: { status: "completed" },
        T07: { status: "completed" },
      },
    } as never,
  });
  if (!created.ok) throw new Error(created.reason);
  const crop = { focalX: 0.3, focalY: 0.7, zoom: 1.4 };
  const updated = updateGuestDraftV3(created.draft, {
    now: "2026-10-26T10:01:00.000Z",
    photos: [{ localId: "local-hero", placement: { purpose: "hero", crop } }],
  });
  if (!updated.ok) throw new Error(updated.reason);
  return {
    draft: updated.draft,
    asset: {
      localId: "local-hero",
      source: {
        blobRole: "prepared_high_quality",
        mimeType: "image/webp",
        sizeBytes: 3,
        dimensions: { status: "known", width: 1800, height: 1200 },
        originalFilename: "portrait.webp",
        lastModified: 123,
      },
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: "image/webp" }),
    },
  };
}

function postRevealDraft(answer: "yes" | "no" | "later", skinVariant: "light" | "dark" = "light") {
  const fixture = revealDraft();
  const content = localContent(fixture.draft);
  const updated = updateGuestDraftV3(fixture.draft, {
    now: "2026-10-26T10:02:00.000Z",
    skinVariant,
    content: {
      ...content,
      guidedFlow: {
        ...content.guidedFlow,
        A00: { status: "completed", answer },
        T08: { status: "completed" },
      },
    } as never,
  });
  if (!updated.ok) throw new Error(updated.reason);
  return { draft: updated.draft, asset: fixture.asset };
}

const EMPTY_CEREMONY: CeremonyContent = {
  date: null,
  time: null,
  venueName: null,
  address: null,
  access: null,
  note: null,
};

function ceremonyDraft({
  records = {},
  ceremony = {},
}: {
  records?: Record<string, { status: "completed" | "skipped"; answer?: string }>;
  ceremony?: Partial<CeremonyContent>;
} = {}) {
  const fixture = postRevealDraft("no");
  const content = localContent(fixture.draft);
  fixture.draft = {
    ...fixture.draft,
    content: {
      ...fixture.draft.content,
      ceremony: { ...EMPTY_CEREMONY, ...ceremony },
      guidedFlow: {
        ...content.guidedFlow,
        A04: { status: "completed", answer: "yes" },
        ...records,
      },
    } as MemorialContent,
  };
  return fixture;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("GuestBuilderRuntime", () => {
  it.each([
    ["yes", "ceremony.momentYes", "no"],
    ["no", "ceremony.momentNo", "later"],
    ["undecided", "ceremony.momentUndecided", "no"],
  ] as const)(
    "persists A04=%s locally, keeps hidden ceremony data and stops before later screens",
    async (answer, labelKey, announcementAnswer) => {
      const fixture = postRevealDraft(announcementAnswer);
      const preservedCeremony = {
        date: "2027-04-12",
        time: "14:30",
        venueName: "Lieu conservé",
        address: "Adresse conservée",
        access: "Accès conservé",
        note: "Note conservée",
      };
      fixture.draft = {
        ...fixture.draft,
        content: { ...fixture.draft.content, ceremony: preservedCeremony } as MemorialContent,
      };
      const store = new MemoryStore(fixture.draft);
      store.assets.set(fixture.asset.localId, fixture.asset);
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);

      const view = render(
        <GuestBuilderRuntime
          createStore={() => store}
          createId={() => "unused"}
          now={() => "2026-10-26T10:03:00.000Z"}
        />,
      );

      await screen.findByRole("heading", { name: translate("fr", "ceremony.momentTitle") });
      const expectedProgress = `${guestHeroStepProgress(fixture.draft) * 100}%`;
      expect(view.container.querySelector('[aria-hidden="true"] > div')?.getAttribute("style")).toContain(expectedProgress);
      expect(screen.queryByText(translate("fr", "deathNotice.announcementTitle"))).toBeNull();
      fireEvent.click(screen.getByRole("radio", { name: translate("fr", labelKey) }));
      fireEvent.click(screen.getByRole("button", { name: translate("fr", "common.continue") }));

      if (answer === "yes") {
        await screen.findByRole("heading", { name: translate("fr", "ceremony.dateTimeTitle") });
      } else {
        await vi.waitFor(() => expect(view.container.querySelector('[data-guest-builder-pending="post-reveal"]')).toBeTruthy());
        expect(screen.queryByRole("heading", { name: translate("fr", "ceremony.dateTimeTitle") })).toBeNull();
        expect(screen.queryByRole("heading", { name: translate("fr", "personSheet.title") })).toBeNull();
      }
      expect(localContent(store.value!).guidedFlow.A04).toEqual({ status: "completed", answer });
      expect(localContent(store.value!).guidedFlow.A00).toEqual({ status: "completed", answer: announcementAnswer });
      expect((store.value!.content as MemorialContent).ceremony).toEqual(preservedCeremony);
      expect(JSON.stringify(store.value)).not.toMatch(/mediaId|memorialId/);
      expect(fetchSpy).not.toHaveBeenCalled();

      view.unmount();
      const reloaded = render(
        <GuestBuilderRuntime
          createStore={() => store}
          createId={() => "unused"}
          now={() => "2026-10-26T10:04:00.000Z"}
        />,
      );
      if (answer === "yes") {
        await screen.findByRole("heading", { name: translate("fr", "ceremony.dateTimeTitle") });
      } else {
        await vi.waitFor(() => expect(reloaded.container.querySelector('[data-guest-builder-pending="post-reveal"]')).toBeTruthy());
      }
      expect(screen.queryByRole("heading", { name: translate("fr", "ceremony.momentTitle") })).toBeNull();
    },
  );

  it("runs A05-A07 with partial values, reloads between screens, reaches A14 and stops before A08", async () => {
    const fixture = ceremonyDraft();
    const store = new MemoryStore(fixture.draft);
    store.assets.set(fixture.asset.localId, fixture.asset);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const props = {
      createStore: () => store,
      createId: () => "unused",
      now: () => "2026-10-26T10:03:00.000Z",
    };

    const first = render(<GuestBuilderRuntime {...props} />);
    await screen.findByRole("heading", { name: translate("fr", "ceremony.dateTimeTitle") });
    expect(first.container.querySelector('[aria-hidden="true"] > div')?.getAttribute("style"))
      .toContain(`${guestHeroStepProgress(fixture.draft) * 100}%`);
    fireEvent.change(screen.getByLabelText(translate("fr", "ceremony.timeLabel")), {
      target: { value: "09:15" },
    });
    fireEvent.click(screen.getByRole("button", { name: translate("fr", "common.continue") }));

    await screen.findByRole("heading", { name: translate("fr", "ceremony.venueTitle") });
    expect(first.container.querySelector('[aria-hidden="true"] > div')?.getAttribute("style"))
      .toContain(`${guestHeroStepProgress(store.value!) * 100}%`);
    expect((store.value!.content as MemorialContent).ceremony).toMatchObject({ date: null, time: "09:15" });
    expect(localContent(store.value!).guidedFlow.A05).toEqual({ status: "completed" });

    first.unmount();
    const second = render(<GuestBuilderRuntime {...props} />);
    await screen.findByRole("heading", { name: translate("fr", "ceremony.venueTitle") });
    fireEvent.change(screen.getByLabelText(translate("fr", "ceremony.venueLabel")), {
      target: { value: "Maison des familles" },
    });
    fireEvent.click(screen.getByRole("button", { name: translate("fr", "common.continue") }));

    await screen.findByRole("heading", { name: translate("fr", "ceremony.addressTitle") });
    expect(second.container.querySelector('[aria-hidden="true"] > div')?.getAttribute("style"))
      .toContain(`${guestHeroStepProgress(store.value!) * 100}%`);
    expect((store.value!.content as MemorialContent).ceremony).toMatchObject({ venueName: "Maison des familles" });
    expect(localContent(store.value!).guidedFlow.A06).toEqual({ status: "completed" });

    second.unmount();
    const third = render(<GuestBuilderRuntime {...props} />);
    await screen.findByRole("heading", { name: translate("fr", "ceremony.addressTitle") });
    fireEvent.change(screen.getByLabelText(translate("fr", "ceremony.accessLabel")), {
      target: { value: "Entrée par la cour" },
    });
    fireEvent.click(screen.getByRole("button", { name: translate("fr", "common.continue") }));

    await screen.findByRole("heading", { name: translate("fr", "ceremony.programmeTitle") });
    expect(third.container.querySelector('[aria-hidden="true"] > div')?.getAttribute("style"))
      .toContain(`${guestHeroStepProgress(store.value!) * 100}%`);
    expect((store.value!.content as MemorialContent).ceremony).toMatchObject({
      date: null,
      time: "09:15",
      venueName: "Maison des familles",
      address: null,
      access: "Entrée par la cour",
    });
    expect(localContent(store.value!).guidedFlow).toMatchObject({
      A05: { status: "completed" },
      A06: { status: "completed" },
      A07: { status: "completed" },
    });
    expect(screen.queryByRole("heading", { name: translate("fr", "ceremony.noteTitle") })).toBeNull();
    expect(screen.queryByRole("heading", { name: translate("fr", "traditions.title") })).toBeNull();
    expect(JSON.stringify(store.value)).not.toMatch(/mediaId|memorialId/);
    expect(fetchSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: translate("fr", "ceremony.skip") }));
    await vi.waitFor(() => expect(third.container.querySelector('[data-guest-builder-pending="post-reveal"]')).toBeTruthy());
    expect(localContent(store.value!).guidedFlow.A14).toEqual({ status: "skipped" });
    expect(screen.queryByRole("heading", { name: translate("fr", "ceremony.noteTitle") })).toBeNull();
  });

  it.each([
    ["A05", "ceremony.dateTimeTitle", {}, "ceremony.venueTitle"],
    ["A06", "ceremony.venueTitle", { A05: { status: "skipped" as const } }, "ceremony.addressTitle"],
    ["A07", "ceremony.addressTitle", {
      A05: { status: "skipped" as const },
      A06: { status: "skipped" as const },
    }, "ceremony.programmeTitle"],
  ] as const)("skips %s durably without deleting ceremony fields", async (step, titleKey, records, nextTitleKey) => {
    const preservedCeremony = {
      date: "2027-04-12",
      time: "14:30",
      venueName: "Lieu conservé",
      address: "Adresse conservée",
      access: "Accès conservé",
      note: "Note conservée",
    };
    const fixture = ceremonyDraft({ records, ceremony: preservedCeremony });
    const store = new MemoryStore(fixture.draft);
    store.assets.set(fixture.asset.localId, fixture.asset);
    const view = render(
      <GuestBuilderRuntime
        createStore={() => store}
        createId={() => "unused"}
        now={() => "2026-10-26T10:03:00.000Z"}
      />,
    );

    await screen.findByRole("heading", { name: translate("fr", titleKey) });
    fireEvent.click(screen.getByRole("button", { name: translate("fr", "ceremony.skip") }));

    if (nextTitleKey === null) {
      await vi.waitFor(() => expect(view.container.querySelector('[data-guest-builder-pending="post-reveal"]')).toBeTruthy());
    } else {
      await screen.findByRole("heading", { name: translate("fr", nextTitleKey) });
    }
    expect(localContent(store.value!).guidedFlow[step]).toEqual({ status: "skipped" });
    expect((store.value!.content as MemorialContent).ceremony).toEqual(preservedCeremony);
  });

  it("persists A14 add, edit, remove and order operations, reloads them, then stops before A08", async () => {
    const fixture = ceremonyDraft({
      records: {
        A05: { status: "skipped" },
        A06: { status: "skipped" },
        A07: { status: "skipped" },
      },
    });
    const store = new MemoryStore(fixture.draft);
    store.assets.set(fixture.asset.localId, fixture.asset);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const props = {
      createStore: () => store,
      createId: () => "unused",
      now: () => "2026-10-26T10:03:00.000Z",
    };

    const first = render(<GuestBuilderRuntime {...props} />);
    await screen.findByRole("heading", { name: translate("fr", "ceremony.programmeTitle") });
    expect(first.container.querySelector('[aria-hidden="true"] > div')?.getAttribute("style"))
      .toContain(`${guestHeroStepProgress(fixture.draft) * 100}%`);

    fireEvent.click(screen.getByRole("button", { name: translate("fr", "ceremony.programmeAddAction") }));
    fireEvent.change(screen.getByLabelText(translate("fr", "ceremony.programmeLabelLabel")), {
      target: { value: "Accueil" },
    });
    fireEvent.click(screen.getByRole("button", { name: translate("fr", "ceremony.programmeConfirmAdd") }));

    fireEvent.click(screen.getByRole("button", { name: translate("fr", "ceremony.programmeAddAction") }));
    fireEvent.change(screen.getByLabelText(translate("fr", "ceremony.programmeLabelLabel")), {
      target: { value: "Hommage" },
    });
    fireEvent.click(screen.getByRole("button", { name: translate("fr", "ceremony.programmeConfirmAdd") }));

    fireEvent.click(screen.getByRole("button", { name: "Monter « Hommage »" }));

    fireEvent.click(screen.getByRole("button", { name: "Modifier « Accueil »" }));
    fireEvent.change(screen.getByLabelText(translate("fr", "ceremony.programmeDetailLabel")), {
      target: { value: "Parvis" },
    });
    fireEvent.click(screen.getByRole("button", { name: translate("fr", "common.save") }));

    fireEvent.click(screen.getByRole("button", { name: "Supprimer « Hommage »" }));
    await vi.waitFor(() => expect(
      ((store.value!.content as MemorialContent).ceremony as CeremonyContent).programme?.map((moment) => moment.label),
    ).toEqual(["Accueil"]), { timeout: 3_000 });
    expect(((store.value!.content as MemorialContent).ceremony as CeremonyContent).programme?.[0]?.detail).toBe("Parvis");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(JSON.stringify(store.value)).not.toMatch(/mediaId|memorialId/);

    first.unmount();
    const reloaded = render(<GuestBuilderRuntime {...props} />);
    await screen.findByText("Accueil");
    expect(screen.getByText("Parvis")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: translate("fr", "common.continue") }));

    await vi.waitFor(() => expect(reloaded.container.querySelector('[data-guest-builder-pending="post-reveal"]')).toBeTruthy());
    expect(localContent(store.value!).guidedFlow.A14).toEqual({ status: "completed" });
    expect(screen.queryByRole("heading", { name: translate("fr", "ceremony.noteTitle") })).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("preserves an A14 programme through the A04 yes → no → yes cycle", async () => {
    const moment = { id: "moment-stable", time: "14:00", label: "Accueil", detail: null };
    const fixture = ceremonyDraft({
      records: {
        A05: { status: "skipped" },
        A06: { status: "skipped" },
        A07: { status: "skipped" },
      },
      ceremony: { programme: [moment] },
    });
    const store = new MemoryStore(fixture.draft);
    store.assets.set(fixture.asset.localId, fixture.asset);

    const hiddenContent = structuredClone(store.value!.content) as MemorialContent;
    (hiddenContent as unknown as GuestFlowContent).guidedFlow.A04 = { status: "completed", answer: "no" };
    const hidden = updateGuestDraftV3(store.value!, { content: hiddenContent, now: "2026-10-26T10:03:00.000Z" });
    if (!hidden.ok) throw new Error(hidden.reason);
    store.value = hidden.draft;

    const hiddenView = render(<GuestBuilderRuntime createStore={() => store} createId={() => "unused"} />);
    await vi.waitFor(() => expect(hiddenView.container.querySelector('[data-guest-builder-pending="post-reveal"]')).toBeTruthy());
    expect(((store.value.content as MemorialContent).ceremony as CeremonyContent).programme).toEqual([moment]);
    expect(screen.queryByRole("heading", { name: translate("fr", "ceremony.programmeTitle") })).toBeNull();
    hiddenView.unmount();

    const visibleContent = structuredClone(store.value.content) as MemorialContent;
    (visibleContent as unknown as GuestFlowContent).guidedFlow.A04 = { status: "completed", answer: "yes" };
    const visible = updateGuestDraftV3(store.value, { content: visibleContent, now: "2026-10-26T10:04:00.000Z" });
    if (!visible.ok) throw new Error(visible.reason);
    store.value = visible.draft;

    render(<GuestBuilderRuntime createStore={() => store} createId={() => "unused"} />);
    await screen.findByRole("heading", { name: translate("fr", "ceremony.programmeTitle") });
    expect(screen.getByText("Accueil")).toBeTruthy();
    expect(((store.value.content as MemorialContent).ceremony as CeremonyContent).programme).toEqual([moment]);
  });

  it("blocks a stale A14 write and preserves the newer draft from another tab", async () => {
    const fixture = ceremonyDraft({
      records: {
        A05: { status: "skipped" },
        A06: { status: "skipped" },
        A07: { status: "skipped" },
      },
    });
    const store = new MemoryStore(fixture.draft);
    store.assets.set(fixture.asset.localId, fixture.asset);
    render(<GuestBuilderRuntime createStore={() => store} createId={() => "unused"} />);
    await screen.findByRole("heading", { name: translate("fr", "ceremony.programmeTitle") });

    const concurrent = updateGuestDraftV3(store.value!, { now: "2026-10-26T10:04:00.000Z" });
    if (!concurrent.ok) throw new Error(concurrent.reason);
    store.value = concurrent.draft;
    fireEvent.click(screen.getByRole("button", { name: translate("fr", "ceremony.skip") }));

    await screen.findByText(translate("fr", "autosave.conflictTitle"));
    expect(store.value).toEqual(concurrent.draft);
    expect(localContent(store.value!).guidedFlow.A14).toBeUndefined();
    expect(screen.getByRole("heading", { name: translate("fr", "ceremony.programmeTitle") })).toBeTruthy();
  });

  it("repairs a damaged local programme only after the explicit family action", async () => {
    const storedProgramme = [
      { id: "valid", time: null, label: "Accueil", detail: null },
      { id: "damaged", time: "25:99", label: "Illisible", detail: null },
    ];
    const fixture = ceremonyDraft({
      records: {
        A05: { status: "skipped" },
        A06: { status: "skipped" },
        A07: { status: "skipped" },
      },
      ceremony: { programme: storedProgramme as unknown as CeremonyContent["programme"] },
    });
    const store = new MemoryStore(fixture.draft);
    store.assets.set(fixture.asset.localId, fixture.asset);
    render(<GuestBuilderRuntime createStore={() => store} createId={() => "unused"} />);

    await screen.findByRole("button", { name: translate("fr", "ceremony.programmeRepairAction") });
    expect(((store.value!.content as MemorialContent).ceremony as Record<string, unknown>).programme).toEqual(storedProgramme);
    fireEvent.click(screen.getByRole("button", { name: translate("fr", "ceremony.programmeRepairAction") }));

    await vi.waitFor(() => expect(
      ((store.value!.content as MemorialContent).ceremony as CeremonyContent).programme,
    ).toEqual([{ id: "valid", time: null, label: "Accueil", detail: null }]), { timeout: 3_000 });
    expect(screen.queryByRole("button", { name: translate("fr", "ceremony.programmeRepairAction") })).toBeNull();
  });

  it("blocks a stale A05 write and preserves the newer draft from another tab", async () => {
    const fixture = ceremonyDraft();
    const store = new MemoryStore(fixture.draft);
    store.assets.set(fixture.asset.localId, fixture.asset);
    render(
      <GuestBuilderRuntime
        createStore={() => store}
        createId={() => "unused"}
        now={() => "2026-10-26T10:03:00.000Z"}
      />,
    );
    await screen.findByRole("heading", { name: translate("fr", "ceremony.dateTimeTitle") });
    const concurrent = updateGuestDraftV3(store.value!, { now: "2026-10-26T10:04:00.000Z" });
    if (!concurrent.ok) throw new Error(concurrent.reason);
    store.value = concurrent.draft;

    fireEvent.click(screen.getByRole("button", { name: translate("fr", "ceremony.skip") }));

    await screen.findByText(translate("fr", "autosave.conflictTitle"));
    expect(store.value).toEqual(concurrent.draft);
    expect(localContent(store.value!).guidedFlow.A05).toBeUndefined();
    expect(screen.getByRole("heading", { name: translate("fr", "ceremony.dateTimeTitle") })).toBeTruthy();
  });

  it("runs the canonical A01-A03 branch locally, reloads without stale data, then reaches A04", async () => {
    const fixture = postRevealDraft("yes", "dark");
    const store = new MemoryStore(fixture.draft);
    store.assets.set(fixture.asset.localId, fixture.asset);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const props = {
      createStore: () => store,
      createId: () => "unused",
      now: () => "2026-10-26T10:03:00.000Z",
    };

    const first = render(<GuestBuilderRuntime {...props} />);
    const announcement = await screen.findByLabelText(translate("fr", "deathNotice.announcementTitle"));
    const expectedProgress = `${guestHeroStepProgress(fixture.draft) * 100}%`;
    expect(first.container.querySelector('[aria-hidden="true"] > div')?.getAttribute("style")).toContain(expectedProgress);
    fireEvent.change(announcement, { target: { value: "Elle restera dans nos mémoires." } });
    fireEvent.click(screen.getByRole("button", { name: translate("fr", "common.continue") }));

    await screen.findByRole("heading", { name: translate("fr", "deathNotice.precisionsTitle") });
    fireEvent.click(screen.getByRole("button", { name: translate("fr", "deathNotice.precisionsSkip") }));

    await screen.findByText("Elle restera dans nos mémoires.");
    expect(first.container.querySelector('[data-testid="death-notice-v2"]')?.closest("[data-variant]")?.getAttribute("data-variant")).toBe("dark");
    expect(localContent(store.value!).guidedFlow).toMatchObject({
      A01: { status: "completed" },
      A02: { status: "skipped" },
    });

    first.unmount();
    render(<GuestBuilderRuntime {...props} />);
    await screen.findByText("Elle restera dans nos mémoires.");
    fireEvent.click(screen.getByRole("button", { name: translate("fr", "deathNotice.editAnnouncement") }));

    const reopened = await screen.findByLabelText(translate("fr", "deathNotice.announcementTitle"));
    expect((reopened as HTMLTextAreaElement).value).toBe("Elle restera dans nos mémoires.");
    fireEvent.click(screen.getByRole("button", { name: translate("fr", "common.continue") }));
    // A02 remains resolved as skipped: the canonical resolver returns to A03.
    await screen.findByText("Elle restera dans nos mémoires.");
    fireEvent.click(screen.getByRole("button", { name: translate("fr", "common.continue") }));

    await screen.findByRole("heading", { name: translate("fr", "ceremony.momentTitle") });
    expect(localContent(store.value!).guidedFlow.A03?.status).toBe("completed");
    expect(store.value?.skinVariant).toBe("dark");
    expect(localContent(store.value!).hero.photo).toBeNull();
    expect(JSON.stringify(store.value)).not.toMatch(/mediaId|memorialId/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("blocks a stale A04 write and preserves the newer draft from another tab", async () => {
    const fixture = postRevealDraft("later");
    const store = new MemoryStore(fixture.draft);
    store.assets.set(fixture.asset.localId, fixture.asset);
    render(
      <GuestBuilderRuntime
        createStore={() => store}
        createId={() => "unused"}
        now={() => "2026-10-26T10:03:00.000Z"}
      />,
    );
    await screen.findByRole("heading", { name: translate("fr", "ceremony.momentTitle") });
    const concurrent = updateGuestDraftV3(store.value!, { now: "2026-10-26T10:04:00.000Z" });
    if (!concurrent.ok) throw new Error(concurrent.reason);
    store.value = concurrent.draft;

    fireEvent.click(screen.getByRole("radio", { name: translate("fr", "ceremony.momentYes") }));
    fireEvent.click(screen.getByRole("button", { name: translate("fr", "common.continue") }));

    await screen.findByText(translate("fr", "autosave.conflictTitle"));
    expect(store.value).toEqual(concurrent.draft);
    expect(localContent(store.value!).guidedFlow.A04).toBeUndefined();
    expect(screen.getByRole("heading", { name: translate("fr", "ceremony.momentTitle") })).toBeTruthy();
  });

  it("blocks a stale A01 write and preserves the newer draft from another tab", async () => {
    const fixture = postRevealDraft("yes");
    const store = new MemoryStore(fixture.draft);
    store.assets.set(fixture.asset.localId, fixture.asset);
    render(
      <GuestBuilderRuntime
        createStore={() => store}
        createId={() => "unused"}
        now={() => "2026-10-26T10:03:00.000Z"}
      />,
    );
    const announcement = await screen.findByLabelText(translate("fr", "deathNotice.announcementTitle"));
    const concurrent = updateGuestDraftV3(store.value!, { now: "2026-10-26T10:04:00.000Z" });
    if (!concurrent.ok) throw new Error(concurrent.reason);
    store.value = concurrent.draft;

    fireEvent.change(announcement, { target: { value: "Écriture devenue périmée" } });
    fireEvent.click(screen.getByRole("button", { name: translate("fr", "common.continue") }));

    await screen.findByText(translate("fr", "autosave.conflictTitle"));
    expect(store.value).toEqual(concurrent.draft);
    expect(screen.getByLabelText(translate("fr", "deathNotice.announcementTitle"))).toBeTruthy();
  });

  it("reuses T08 locally, revokes its object URL, persists ambiance plus progress, and reloads after it", async () => {
    const fixture = revealDraft();
    const store = new MemoryStore(fixture.draft);
    store.assets.set(fixture.asset.localId, fixture.asset);
    const fetchSpy = vi.fn();
    const createObjectUrl = vi.fn(() => "blob:guest-reveal");
    const revokeObjectUrl = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const first = render(
      <GuestBuilderRuntime
        createStore={() => store}
        createId={() => "unused"}
        now={() => "2026-10-26T10:02:00.000Z"}
        createObjectUrl={createObjectUrl}
        revokeObjectUrl={revokeObjectUrl}
      />,
    );
    await screen.findByRole("button", { name: "Continuer avec cette ambiance" });
    expect(first.container.querySelectorAll('img[src="blob:guest-reveal"]')).toHaveLength(3);
    fireEvent.click(screen.getByRole("radio", { name: "Sombre" }));
    fireEvent.click(screen.getByRole("button", { name: "Continuer avec cette ambiance" }));

    await screen.findByRole("heading", { name: translate("fr", "ceremony.momentTitle") });
    expect(store.value?.skinVariant).toBe("dark");
    expect(store.value?.content).toMatchObject({ guidedFlow: { T08: { status: "completed" } } });
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:guest-reveal");
    expect(fetchSpy).not.toHaveBeenCalled();

    first.unmount();
    render(
      <GuestBuilderRuntime
        createStore={() => store}
        createId={() => "unused"}
        now={() => "2026-10-26T10:03:00.000Z"}
        createObjectUrl={createObjectUrl}
        revokeObjectUrl={revokeObjectUrl}
      />,
    );
    await screen.findByRole("heading", { name: translate("fr", "ceremony.momentTitle") });
    expect(screen.queryByRole("button", { name: "Continuer avec cette ambiance" })).toBeNull();
    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("persists T01 and Welcome locally, advancing and resuming the same screens after reload", async () => {
    const store = new MemoryStore(newDraft());
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const createStore = () => store;
    const now = () => "2026-10-26T09:01:00.000Z";

    const first = render(
      <GuestBuilderRuntime createStore={createStore} createId={() => "unused"} now={now} />,
    );
    await screen.findByRole("radio", { name: "Français" });
    fireEvent.click(screen.getByRole("radio", { name: "Français" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await screen.findByRole("heading", { name: translate("fr", "welcome.title") });
    expect(store.value).toMatchObject({
      language: "fr",
      revision: 1,
      draftId: "guest-ui-draft",
      transferKey: "guest-ui-transfer",
    });
    expect(fetchSpy).not.toHaveBeenCalled();

    first.unmount();
    const reloaded = render(<GuestBuilderRuntime createStore={createStore} createId={() => "unused"} now={now} />);
    await screen.findByRole("heading", { name: translate("fr", "welcome.title") });
    expect(screen.queryByRole("radio", { name: "Français" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: translate("fr", "welcome.cta") }));
    await screen.findByRole("heading", { name: translate("fr", "hero.identityTitle") });
    expect(store.value?.content).toMatchObject({ welcome: { status: "completed" } });
    expect(store.value?.revision).toBe(2);
    expect(fetchSpy).not.toHaveBeenCalled();

    reloaded.unmount();
    render(<GuestBuilderRuntime createStore={createStore} createId={() => "unused"} now={now} />);
    await screen.findByRole("heading", { name: translate("fr", "hero.identityTitle") });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("surfaces an unavailable local store with existing generic copy", async () => {
    const createStore = () => ({
      read: async (): Promise<GuestDraftV3ReadResult> => ({
        status: "error",
        error: Object.assign(new Error("unavailable"), { code: "unavailable" as const }),
      }),
      save: async (): Promise<GuestDraftV3WriteResult> => ({ ok: false, reason: "unavailable" }),
      readPhoto: async () => ({ ok: false as const, reason: "photo_not_found" as const }),
      addPhoto: async () => ({ ok: false as const, reason: "unavailable" as const }),
      replacePhoto: async () => ({ ok: false as const, reason: "unavailable" as const }),
      updatePhotoPlacement: async () => ({ ok: false as const, reason: "unavailable" as const }),
    });

    render(
      <GuestBuilderRuntime
        createStore={createStore}
        createId={() => "unused"}
        now={() => "2026-10-26T09:01:00.000Z"}
      />,
    );

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(translate("en", "errors.generic"));
    expect(alert.getAttribute("data-guest-builder-error")).toBe("unavailable");
  });
});
