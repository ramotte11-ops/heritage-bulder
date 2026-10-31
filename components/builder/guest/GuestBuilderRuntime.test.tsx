// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
import { commitA03 } from "@/lib/builder/guided-flow/death-notice-step";
import { translate } from "@/lib/i18n/translate";
import { EMPTY_DEATH_NOTICE_CONTENT } from "@/types/death-notice";
import type { CeremonyContent } from "@/types/ceremony";
import type { MemorialContent } from "@/types/memorial";
import type { TraditionsContent } from "@/types/traditions";

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
  async removePhoto(localId: string, expectedRevision: number, now: string): Promise<GuestDraftV3PhotoWriteResult> {
    if (this.value === null || this.value.revision !== expectedRevision) {
      return { ok: false, reason: "revision_conflict" };
    }
    if (!this.value.photos.some((photo) => photo.localId === localId)) {
      return { ok: false, reason: "photo_not_found" };
    }
    const updated = updateGuestDraftV3(this.value, {
      now,
      photos: this.value.photos.filter((photo) => photo.localId !== localId),
    });
    if (!updated.ok) return { ok: false, reason: updated.reason };
    this.value = structuredClone(updated.draft);
    return { ok: true, draft: structuredClone(updated.draft) };
  }
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
  announcementAnswer = "no",
}: {
  records?: Record<string, { status: "completed" | "skipped"; answer?: string }>;
  ceremony?: Partial<CeremonyContent>;
  announcementAnswer?: "yes" | "no" | "later";
} = {}) {
  const fixture = postRevealDraft(announcementAnswer);
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

function announcementCeremonyDraft({
  records = {},
  ceremony = {},
  traditions = { entries: [] },
}: {
  records?: Record<string, { status: "completed" | "skipped"; answer?: string }>;
  ceremony?: Partial<CeremonyContent>;
  traditions?: TraditionsContent;
} = {}) {
  const fixture = ceremonyDraft({
    announcementAnswer: "yes",
    records: {
      A01: { status: "completed" },
      A02: { status: "skipped" },
      ...records,
    },
    ceremony,
  });
  const verified = commitA03({
    ...fixture.draft.content,
    deathNotice: {
      ...EMPTY_DEATH_NOTICE_CONTENT,
      announcementText: "Elle restera dans nos mémoires.",
    },
    traditions,
  });
  if (!verified.ok) throw new Error(verified.reason);
  fixture.draft = { ...fixture.draft, content: verified.content };
  return fixture;
}

function personSheetDraft() {
  return announcementCeremonyDraft({
    records: {
      A04: { status: "completed", answer: "no" },
      A09: { status: "skipped" },
    },
  });
}

function galleryDraft(count = 0) {
  const fixture = personSheetDraft();
  const flow = localContent(fixture.draft).guidedFlow;
  const photos = Array.from({ length: count }, (_, index) => ({
    localId: `gallery-${index + 1}`,
    placement: { purpose: "gallery" as const, caption: index === 0 ? "Souvenir initial" : null },
  }));
  const updated = updateGuestDraftV3(fixture.draft, {
    now: "2026-10-26T10:11:00.000Z",
    content: {
      ...fixture.draft.content,
      guidedFlow: {
        ...flow,
        A10: { status: "skipped" },
        A11: { status: "skipped" },
        A12: { status: "skipped" },
      },
    } as MemorialContent,
    photos: [...fixture.draft.photos, ...photos],
  });
  if (!updated.ok) throw new Error(updated.reason);
  const galleryAssets: GuestDraftPhotoAsset[] = photos.map(({ localId }, index) => ({
    localId,
    source: {
      blobRole: "prepared_high_quality",
      mimeType: "image/webp",
      sizeBytes: 1,
      dimensions: { status: "known", width: 1600, height: 1067 },
      originalFilename: `souvenir-${index + 1}.webp`,
      lastModified: index + 1,
    },
    blob: new Blob([new Uint8Array([index + 1])], { type: "image/webp" }),
  }));
  return { draft: updated.draft, asset: fixture.asset, galleryAssets };
}

function completedDraft() {
  const fixture = galleryDraft(0);
  const flow = localContent(fixture.draft).guidedFlow;
  const updated = updateGuestDraftV3(fixture.draft, {
    now: "2026-10-26T10:12:00.000Z",
    content: { ...fixture.draft.content, guidedFlow: { ...flow, A13: { status: "skipped" } } } as MemorialContent,
  });
  if (!updated.ok) throw new Error(updated.reason);
  return { draft: updated.draft, asset: fixture.asset };
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
    "persists A04=%s locally, keeps hidden ceremony data and continues canonically",
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
        await screen.findByRole("heading", { name: translate("fr", "personSheet.title") });
        expect(screen.queryByRole("heading", { name: translate("fr", "ceremony.dateTimeTitle") })).toBeNull();
      }
      expect(localContent(store.value!).guidedFlow.A04).toEqual({ status: "completed", answer });
      expect(localContent(store.value!).guidedFlow.A00).toEqual({ status: "completed", answer: announcementAnswer });
      expect((store.value!.content as MemorialContent).ceremony).toEqual(preservedCeremony);
      expect(JSON.stringify(store.value)).not.toMatch(/mediaId|memorialId/);
      expect(fetchSpy).not.toHaveBeenCalled();

      view.unmount();
      render(
        <GuestBuilderRuntime
          createStore={() => store}
          createId={() => "unused"}
          now={() => "2026-10-26T10:04:00.000Z"}
        />,
      );
      if (answer === "yes") {
        await screen.findByRole("heading", { name: translate("fr", "ceremony.dateTimeTitle") });
      } else {
        await screen.findByRole("heading", { name: translate("fr", "personSheet.title") });
      }
      expect(screen.queryByRole("heading", { name: translate("fr", "ceremony.momentTitle") })).toBeNull();
    },
  );

  it("runs A05-A08 with partial values, reloads between screens, and continues to the person sheet", async () => {
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
    await screen.findByRole("heading", { name: translate("fr", "ceremony.noteTitle") });
    expect(localContent(store.value!).guidedFlow.A14).toEqual({ status: "skipped" });
    expect(third.container.querySelector('[aria-hidden="true"] > div')?.getAttribute("style"))
      .toContain(`${guestHeroStepProgress(store.value!) * 100}%`);
    fireEvent.click(screen.getByRole("button", { name: translate("fr", "ceremony.skip") }));
    await screen.findByRole("heading", { name: translate("fr", "personSheet.title") });
    expect(localContent(store.value!).guidedFlow.A08).toEqual({ status: "skipped" });
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
    render(
      <GuestBuilderRuntime
        createStore={() => store}
        createId={() => "unused"}
        now={() => "2026-10-26T10:03:00.000Z"}
      />,
    );

    await screen.findByRole("heading", { name: translate("fr", titleKey) });
    fireEvent.click(screen.getByRole("button", { name: translate("fr", "ceremony.skip") }));

    if (nextTitleKey === null) {
      await screen.findByRole("heading", { name: translate("fr", "personSheet.title") });
    } else {
      await screen.findByRole("heading", { name: translate("fr", nextTitleKey) });
    }
    expect(localContent(store.value!).guidedFlow[step]).toEqual({ status: "skipped" });
    expect((store.value!.content as MemorialContent).ceremony).toEqual(preservedCeremony);
  });

  it("persists A14 add, edit, remove and order operations, reloads them, then reaches A08", async () => {
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
    render(<GuestBuilderRuntime {...props} />);
    await screen.findByText("Accueil");
    expect(screen.getByText("Parvis")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: translate("fr", "common.continue") }));

    await screen.findByRole("heading", { name: translate("fr", "ceremony.noteTitle") });
    expect(localContent(store.value!).guidedFlow.A14).toEqual({ status: "completed" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("persists and reloads A08 locally, then continues to the person sheet when A09 is not applicable", async () => {
    const fixture = ceremonyDraft({
      records: {
        A05: { status: "skipped" },
        A06: { status: "skipped" },
        A07: { status: "skipped" },
        A14: { status: "skipped" },
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
    const input = await screen.findByLabelText(translate("fr", "ceremony.noteLabel"));
    expect(first.container.querySelector('[aria-hidden="true"] > div')?.getAttribute("style"))
      .toContain(`${guestHeroStepProgress(fixture.draft) * 100}%`);
    expect((input as HTMLTextAreaElement).hasAttribute("maxlength")).toBe(false);
    fireEvent.change(input, { target: { value: "  Stationnement derrière la mairie  " } });

    await vi.waitFor(() => expect(
      ((store.value!.content as MemorialContent).ceremony as CeremonyContent).note,
    ).toBe("Stationnement derrière la mairie"), { timeout: 3_000 });

    first.unmount();
    render(<GuestBuilderRuntime {...props} />);
    const restored = await screen.findByLabelText(translate("fr", "ceremony.noteLabel"));
    expect((restored as HTMLTextAreaElement).value).toBe("Stationnement derrière la mairie");
    fireEvent.click(screen.getByRole("button", { name: translate("fr", "common.continue") }));

    await screen.findByRole("heading", { name: translate("fr", "personSheet.title") });
    expect(localContent(store.value!).guidedFlow.A08).toEqual({ status: "completed" });
    expect(((store.value!.content as MemorialContent).ceremony as CeremonyContent).note)
      .toBe("Stationnement derrière la mairie");
    expect(screen.queryByRole("heading", { name: translate("fr", "traditions.title") })).toBeNull();
    expect(JSON.stringify(store.value)).not.toMatch(/mediaId|memorialId/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("preserves the A08 note through the A04 yes → no → yes cycle", async () => {
    const fixture = ceremonyDraft({
      records: {
        A05: { status: "skipped" },
        A06: { status: "skipped" },
        A07: { status: "skipped" },
        A14: { status: "skipped" },
      },
      ceremony: { note: "Note stable" },
    });
    const store = new MemoryStore(fixture.draft);
    store.assets.set(fixture.asset.localId, fixture.asset);

    const hiddenContent = structuredClone(store.value!.content) as MemorialContent;
    (hiddenContent as unknown as GuestFlowContent).guidedFlow.A04 = { status: "completed", answer: "no" };
    const hidden = updateGuestDraftV3(store.value!, { content: hiddenContent, now: "2026-10-26T10:03:00.000Z" });
    if (!hidden.ok) throw new Error(hidden.reason);
    store.value = hidden.draft;

    const hiddenView = render(<GuestBuilderRuntime createStore={() => store} createId={() => "unused"} />);
    await screen.findByRole("heading", { name: translate("fr", "personSheet.title") });
    expect(((store.value.content as MemorialContent).ceremony as CeremonyContent).note).toBe("Note stable");
    expect(screen.queryByRole("heading", { name: translate("fr", "ceremony.noteTitle") })).toBeNull();
    hiddenView.unmount();

    const visibleContent = structuredClone(store.value.content) as MemorialContent;
    (visibleContent as unknown as GuestFlowContent).guidedFlow.A04 = { status: "completed", answer: "yes" };
    const visible = updateGuestDraftV3(store.value, { content: visibleContent, now: "2026-10-26T10:04:00.000Z" });
    if (!visible.ok) throw new Error(visible.reason);
    store.value = visible.draft;

    render(<GuestBuilderRuntime createStore={() => store} createId={() => "unused"} />);
    expect((await screen.findByLabelText(translate("fr", "ceremony.noteLabel")) as HTMLTextAreaElement).value)
      .toBe("Note stable");
  });

  it("blocks a stale A08 write and preserves the newer draft from another tab", async () => {
    const fixture = ceremonyDraft({
      records: {
        A05: { status: "skipped" },
        A06: { status: "skipped" },
        A07: { status: "skipped" },
        A14: { status: "skipped" },
      },
      ceremony: { note: "Note conservée" },
    });
    const store = new MemoryStore(fixture.draft);
    store.assets.set(fixture.asset.localId, fixture.asset);
    render(<GuestBuilderRuntime createStore={() => store} createId={() => "unused"} />);
    await screen.findByRole("heading", { name: translate("fr", "ceremony.noteTitle") });

    const concurrent = updateGuestDraftV3(store.value!, { now: "2026-10-26T10:04:00.000Z" });
    if (!concurrent.ok) throw new Error(concurrent.reason);
    store.value = concurrent.draft;
    fireEvent.click(screen.getByRole("button", { name: translate("fr", "ceremony.skip") }));

    await screen.findByText(translate("fr", "autosave.conflictTitle"));
    expect(store.value).toEqual(concurrent.draft);
    expect(localContent(store.value!).guidedFlow.A08).toBeUndefined();
    expect(((store.value!.content as MemorialContent).ceremony as CeremonyContent).note).toBe("Note conservée");
    expect(screen.getByRole("heading", { name: translate("fr", "ceremony.noteTitle") })).toBeTruthy();
  });

  it("renders A09 after A08 with Intemporel and local Hero progress, then reaches A10-A12", async () => {
    const fixture = announcementCeremonyDraft({
      records: {
        A05: { status: "skipped" },
        A06: { status: "skipped" },
        A07: { status: "skipped" },
        A14: { status: "skipped" },
      },
      ceremony: { note: "Accès côté jardin" },
    });
    const store = new MemoryStore(fixture.draft);
    store.assets.set(fixture.asset.localId, fixture.asset);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const view = render(<GuestBuilderRuntime createStore={() => store} createId={() => "unused"} />);
    await screen.findByRole("heading", { name: translate("fr", "ceremony.noteTitle") });

    fireEvent.click(screen.getByRole("button", { name: translate("fr", "common.continue") }));

    await screen.findByRole("heading", { name: translate("fr", "traditions.title") });
    expect(localContent(store.value!).guidedFlow.A08).toEqual({ status: "completed" });
    expect(view.container.querySelector('[aria-hidden="true"] > div')?.getAttribute("style"))
      .toContain(`${guestHeroStepProgress(store.value!) * 100}%`);
    expect(fetchSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: translate("fr", "traditions.skip") }));
    await screen.findByRole("heading", { name: translate("fr", "personSheet.title") });
    expect(localContent(store.value!).guidedFlow.A09).toEqual({ status: "skipped" });
  });

  it.each(["no", "undecided"] as const)("renders A09 directly after A04=%s when A00=yes", async (answer) => {
    const fixture = announcementCeremonyDraft({ records: { A04: { status: "completed", answer } } });
    const store = new MemoryStore(fixture.draft);
    store.assets.set(fixture.asset.localId, fixture.asset);

    render(<GuestBuilderRuntime createStore={() => store} createId={() => "unused"} />);

    await screen.findByRole("heading", { name: translate("fr", "traditions.title") });
    expect(screen.queryByRole("heading", { name: translate("fr", "ceremony.dateTimeTitle") })).toBeNull();
  });

  it("persists A09 add, edit, remove and order operations, then reloads the confirmed entries", async () => {
    const fixture = announcementCeremonyDraft({
      records: {
        A05: { status: "skipped" },
        A06: { status: "skipped" },
        A07: { status: "skipped" },
        A14: { status: "skipped" },
        A08: { status: "skipped" },
      },
    });
    const store = new MemoryStore(fixture.draft);
    store.assets.set(fixture.asset.localId, fixture.asset);
    const ids = vi.spyOn(globalThis.crypto, "randomUUID")
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000001")
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000002");
    const props = { createStore: () => store, createId: () => "unused" };

    const first = render(<GuestBuilderRuntime {...props} />);
    await screen.findByRole("heading", { name: translate("fr", "traditions.title") });
    fireEvent.click(screen.getByRole("button", { name: translate("fr", "traditions.addCustomAction") }));
    fireEvent.change(screen.getByLabelText(translate("fr", "traditions.textFieldLabel")), {
      target: { value: "Premier repère" },
    });
    fireEvent.click(screen.getByRole("button", { name: translate("fr", "traditions.confirmAdd") }));
    fireEvent.click(screen.getByRole("button", { name: translate("fr", "traditions.addCustomAction") }));
    fireEvent.change(screen.getByLabelText(translate("fr", "traditions.textFieldLabel")), {
      target: { value: "Second repère" },
    });
    fireEvent.click(screen.getByRole("button", { name: translate("fr", "traditions.confirmAdd") }));

    fireEvent.click(screen.getAllByRole("button", { name: translate("fr", "traditions.editAction") })[0]);
    fireEvent.change(screen.getByLabelText(translate("fr", "traditions.textFieldLabel")), {
      target: { value: "Premier repère corrigé" },
    });
    fireEvent.click(screen.getByRole("button", { name: translate("fr", "traditions.saveEdit") }));
    fireEvent.click(screen.getAllByRole("button", { name: translate("fr", "traditions.removeAction") })[1]);

    await vi.waitFor(() => expect(
      ((store.value!.content as MemorialContent).traditions as TraditionsContent).entries.map((entry) => entry.text),
    ).toEqual(["Premier repère corrigé"]), { timeout: 3_000 });
    expect(((store.value!.content as MemorialContent).traditions as TraditionsContent).entries[0].id)
      .toBe("00000000-0000-4000-8000-000000000001");

    first.unmount();
    render(<GuestBuilderRuntime {...props} />);
    await screen.findByText("Premier repère corrigé");
    expect(screen.queryByText("Second repère")).toBeNull();
    ids.mockRestore();
  });

  it("preserves confirmed A09 entries through A00 yes → no → yes", async () => {
    const entry = {
      id: "entry-stable",
      origin: "custom" as const,
      suggestionId: null,
      title: null,
      text: "Repère conservé",
    };
    const fixture = announcementCeremonyDraft({
      records: { A04: { status: "completed", answer: "no" } },
      traditions: { entries: [entry] },
    });
    const store = new MemoryStore(fixture.draft);
    store.assets.set(fixture.asset.localId, fixture.asset);

    const hiddenContent = structuredClone(store.value!.content) as MemorialContent;
    (hiddenContent as unknown as GuestFlowContent).guidedFlow.A00 = { status: "completed", answer: "no" };
    const hidden = updateGuestDraftV3(store.value!, { content: hiddenContent, now: "2026-10-26T10:05:00.000Z" });
    if (!hidden.ok) throw new Error(hidden.reason);
    store.value = hidden.draft;
    const hiddenView = render(<GuestBuilderRuntime createStore={() => store} createId={() => "unused"} />);
    await screen.findByRole("heading", { name: translate("fr", "personSheet.title") });
    expect(((store.value.content as MemorialContent).traditions as TraditionsContent).entries).toEqual([entry]);
    expect(screen.queryByRole("heading", { name: translate("fr", "traditions.title") })).toBeNull();
    hiddenView.unmount();

    const visibleContent = structuredClone(store.value.content) as MemorialContent;
    (visibleContent as unknown as GuestFlowContent).guidedFlow.A00 = { status: "completed", answer: "yes" };
    const visible = updateGuestDraftV3(store.value, { content: visibleContent, now: "2026-10-26T10:06:00.000Z" });
    if (!visible.ok) throw new Error(visible.reason);
    store.value = visible.draft;
    render(<GuestBuilderRuntime createStore={() => store} createId={() => "unused"} />);
    await screen.findByText("Repère conservé");
  });

  it("blocks a stale A09 write and surfaces corrupted traditions without replacement", async () => {
    const fixture = announcementCeremonyDraft({
      records: { A04: { status: "completed", answer: "no" } },
    });
    const store = new MemoryStore(fixture.draft);
    store.assets.set(fixture.asset.localId, fixture.asset);
    const view = render(<GuestBuilderRuntime createStore={() => store} createId={() => "unused"} />);
    await screen.findByRole("heading", { name: translate("fr", "traditions.title") });
    const concurrent = updateGuestDraftV3(store.value!, { now: "2026-10-26T10:07:00.000Z" });
    if (!concurrent.ok) throw new Error(concurrent.reason);
    store.value = concurrent.draft;

    fireEvent.click(screen.getByRole("button", { name: translate("fr", "traditions.skip") }));
    await screen.findByText(translate("fr", "autosave.conflictTitle"));
    expect(store.value).toEqual(concurrent.draft);
    expect(localContent(store.value!).guidedFlow.A09).toBeUndefined();
    view.unmount();

    const damaged = structuredClone(store.value!.content) as MemorialContent;
    damaged.traditions = { entries: "damaged" } as never;
    const damagedDraft = updateGuestDraftV3(store.value!, { content: damaged, now: "2026-10-26T10:08:00.000Z" });
    if (!damagedDraft.ok) throw new Error(damagedDraft.reason);
    store.value = damagedDraft.draft;
    render(<GuestBuilderRuntime createStore={() => store} createId={() => "unused"} />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect((store.value.content as MemorialContent).traditions).toEqual({ entries: "damaged" });
  });

  it("renders the single A10-A12 sheet with local Hero progress, persists it, and stops before A13", async () => {
    const fixture = personSheetDraft();
    const store = new MemoryStore(fixture.draft);
    store.assets.set(fixture.asset.localId, fixture.asset);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const view = render(<GuestBuilderRuntime createStore={() => store} createId={() => "unused"} />);

    await screen.findByRole("heading", { name: translate("fr", "personSheet.title") });
    expect(view.container.querySelector('[aria-hidden="true"] > div')?.getAttribute("style"))
      .toContain(`${guestHeroStepProgress(store.value!) * 100}%`);
    fireEvent.change(screen.getByLabelText(translate("fr", "personSheet.a10Question")), {
      target: { value: "Elle savait accueillir chacun avec douceur." },
    });
    fireEvent.change(screen.getByLabelText(translate("fr", "personSheet.a12Question")), {
      target: { value: "Une attention sincère aux autres." },
    });
    fireEvent.click(screen.getByRole("button", { name: translate("fr", "common.continue") }));

    await screen.findByRole("heading", { name: translate("fr", "galleryStep.title") });
    expect(store.value!.content).toMatchObject({
      personWords: { text: "Elle savait accueillir chacun avec douceur." },
      legacy: { text: "Une attention sincère aux autres." },
      guidedFlow: {
        A10: { status: "completed" },
        A11: { status: "skipped" },
        A12: { status: "completed" },
      },
    });
    fireEvent.click(screen.getByRole("button", { name: translate("fr", "galleryStep.skip") }));
    await vi.waitFor(() => expect(view.container.querySelector('[data-guest-builder-pending="post-reveal"]')).toBeTruthy());
    expect(localContent(store.value!).guidedFlow.A13).toEqual({ status: "skipped" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reloads A10-A12 autosaved text and Skip preserves it while stopping before A13", async () => {
    const fixture = personSheetDraft();
    const store = new MemoryStore(fixture.draft);
    store.assets.set(fixture.asset.localId, fixture.asset);
    const props = { createStore: () => store, createId: () => "unused" };
    const first = render(<GuestBuilderRuntime {...props} />);

    const lovedThings = await screen.findByLabelText(translate("fr", "personSheet.a11Question"));
    fireEvent.change(lovedThings, { target: { value: "Les longues tablées du dimanche." } });
    await vi.waitFor(() => expect((store.value!.content as unknown as { lovedThings?: unknown }).lovedThings)
      .toEqual({ text: "Les longues tablées du dimanche." }), { timeout: 3_000 });
    first.unmount();

    const reloaded = render(<GuestBuilderRuntime {...props} />);
    expect(await screen.findByDisplayValue("Les longues tablées du dimanche.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: translate("fr", "personSheet.skip") }));

    await screen.findByRole("heading", { name: translate("fr", "galleryStep.title") });
    expect(store.value!.content).toMatchObject({
      lovedThings: { text: "Les longues tablées du dimanche." },
      guidedFlow: {
        A10: { status: "skipped" },
        A11: { status: "skipped" },
        A12: { status: "skipped" },
      },
    });
    fireEvent.click(screen.getByRole("button", { name: translate("fr", "galleryStep.skip") }));
    await vi.waitFor(() => expect(reloaded.container.querySelector('[data-guest-builder-pending="post-reveal"]')).toBeTruthy());
  });

  it("loads an uncapped local A13, persists order and captions, reloads blobs, removes safely, then stops", async () => {
    const fixture = galleryDraft(8);
    const store = new MemoryStore(fixture.draft);
    store.assets.set(fixture.asset.localId, fixture.asset);
    fixture.galleryAssets.forEach((asset) => store.assets.set(asset.localId, asset));
    let urlSequence = 0;
    const createObjectURL = vi.fn(() => `blob:gallery-${++urlSequence}`);
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const props = { createStore: () => store, createId: () => "unused", now: () => "2026-10-26T10:12:00.000Z" };

    const first = render(<GuestBuilderRuntime {...props} />);
    await screen.findByRole("heading", { name: translate("fr", "galleryStep.title") });
    let list = screen.getByRole("list", { name: translate("fr", "galleryStep.listLabel") });
    expect(within(list).getAllByRole("listitem")).toHaveLength(8);
    expect(first.container.querySelector('[aria-hidden="true"] > div')?.getAttribute("style"))
      .toContain(`${guestHeroStepProgress(store.value!) * 100}%`);

    let rows = within(list).getAllByRole("listitem");
    fireEvent.click(within(rows[0]).getByRole("button", { name: translate("fr", "galleryStep.moveDown") }));
    rows = within(list).getAllByRole("listitem");
    fireEvent.change(within(rows[1]).getByLabelText(translate("fr", "galleryStep.captionLabel")), {
      target: { value: "  Légende conservée  " },
    });
    await vi.waitFor(() => {
      const gallery = store.value!.photos.filter((photo) => photo.placement.purpose === "gallery");
      expect(gallery.slice(0, 2)).toEqual([
        { localId: "gallery-2", placement: { purpose: "gallery", caption: null } },
        { localId: "gallery-1", placement: { purpose: "gallery", caption: "Légende conservée" } },
      ]);
    }, { timeout: 3_000 });

    first.unmount();
    expect(revokeObjectURL).toHaveBeenCalledTimes(8);
    const reloaded = render(<GuestBuilderRuntime {...props} />);
    await screen.findByDisplayValue("Légende conservée");
    list = screen.getByRole("list", { name: translate("fr", "galleryStep.listLabel") });
    rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(8);

    fireEvent.click(within(rows[0]).getByRole("button", { name: translate("fr", "galleryStep.remove") }));
    fireEvent.click(within(rows[0]).getByRole("button", { name: translate("fr", "galleryStep.removeConfirm") }));
    await vi.waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(7));
    expect(store.assets.has("gallery-2")).toBe(true);
    expect(store.value!.photos.filter((photo) => photo.placement.purpose === "gallery")).toHaveLength(7);

    fireEvent.click(screen.getByRole("button", { name: translate("fr", "common.continue") }));
    await vi.waitFor(() => expect(reloaded.container.querySelector('[data-guest-builder-pending="post-reveal"]')).toBeTruthy());
    expect(localContent(store.value!).guidedFlow.A13).toEqual({ status: "completed" });
    expect((store.value!.content as unknown as { gallery?: unknown }).gallery).toBeUndefined();
    expect(JSON.stringify(store.value!.content)).not.toMatch(/mediaId|memorialId|blob:/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fails closed when an A13 blob is missing and preserves the valid draft", async () => {
    const fixture = galleryDraft(1);
    const store = new MemoryStore(fixture.draft);
    store.assets.set(fixture.asset.localId, fixture.asset);
    const before = structuredClone(store.value);

    render(<GuestBuilderRuntime createStore={() => store} createId={() => "unused"} />);

    const alert = await screen.findByRole("alert");
    expect(alert.getAttribute("data-guest-gallery-error")).toBe("photo_not_found");
    expect(store.value).toEqual(before);
  });

  it("blocks stale A10-A12 writes and never replaces corrupted life-story data", async () => {
    const fixture = personSheetDraft();
    const store = new MemoryStore(fixture.draft);
    store.assets.set(fixture.asset.localId, fixture.asset);
    const first = render(<GuestBuilderRuntime createStore={() => store} createId={() => "unused"} />);
    await screen.findByRole("heading", { name: translate("fr", "personSheet.title") });
    const concurrent = updateGuestDraftV3(store.value!, { now: "2026-10-26T10:09:00.000Z" });
    if (!concurrent.ok) throw new Error(concurrent.reason);
    store.value = concurrent.draft;

    fireEvent.click(screen.getByRole("button", { name: translate("fr", "personSheet.skip") }));
    await screen.findByText(translate("fr", "autosave.conflictTitle"));
    expect(store.value).toEqual(concurrent.draft);
    expect(localContent(store.value!).guidedFlow.A10).toBeUndefined();
    first.unmount();

    const damaged = structuredClone(store.value!.content) as MemorialContent;
    (damaged as unknown as { personWords: unknown }).personWords = { text: "présent", extra: "incompatible" };
    const damagedDraft = updateGuestDraftV3(store.value!, { content: damaged, now: "2026-10-26T10:10:00.000Z" });
    if (!damagedDraft.ok) throw new Error(damagedDraft.reason);
    store.value = damagedDraft.draft;
    render(<GuestBuilderRuntime createStore={() => store} createId={() => "unused"} />);

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect((store.value.content as unknown as { personWords?: unknown }).personWords)
      .toEqual({ text: "présent", extra: "incompatible" });
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
    await screen.findByRole("heading", { name: translate("fr", "personSheet.title") });
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
      removePhoto: async () => ({ ok: false as const, reason: "unavailable" as const }),
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

  describe("QG 003 — the real Preview of the local draft", () => {
    it("rests after A13 on the existing pause, without the owner space, and opens the assembled Memorial", async () => {
      const fixture = completedDraft();
      const store = new MemoryStore(fixture.draft);
      store.assets.set(fixture.asset.localId, fixture.asset);
      const before = structuredClone(store.value);
      let sequence = 0;
      const createObjectURL = vi.fn(() => `blob:preview-${++sequence}`);
      const revokeObjectURL = vi.fn();
      vi.stubGlobal("URL", Object.assign(globalThis.URL, { createObjectURL, revokeObjectURL }));
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);

      const view = render(<GuestBuilderRuntime createStore={() => store} createId={() => "unused"} />);
      await screen.findByRole("heading", { name: translate("fr", "flowPause.title") });
      expect(view.container.querySelector('[data-guest-builder-pending="post-reveal"]')).toBeTruthy();
      expect(screen.queryByText(translate("fr", "flowPause.body"))).toBeNull();
      expect(screen.queryByRole("link", { name: translate("fr", "flowPause.backToSpace") })).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: translate("fr", "preview.view") }));
      const back = await screen.findByRole("button", { name: translate("fr", "preview.backToCreation") });
      const preview = view.container.querySelector("[data-memorial-preview]")!;
      expect([...preview.querySelectorAll("[data-memorial-section]")].map((node) => node.getAttribute("data-memorial-section")))
        .toEqual(["hero", "deathNotice", "story", "symbolicOfferings"]);
      expect(preview.querySelector('[data-memorial-section="hero"]')?.innerHTML).toContain("blob:preview-1");
      expect(view.container.querySelector("[data-builder-screen]")?.hasAttribute("hidden")).toBe(true);

      fireEvent.click(back);
      await vi.waitFor(() => expect(view.container.querySelector("[data-memorial-preview]")).toBeNull());
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:preview-1");
      expect(screen.getByRole("heading", { name: translate("fr", "flowPause.title") })).toBeTruthy();
      expect(store.value).toEqual(before);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("offers « Voir l'aperçu » from T08 on, never on the A03 Reveal, and keeps a missing blob visible", async () => {
      const fixture = personSheetDraft();
      const store = new MemoryStore(fixture.draft);
      store.assets.set(fixture.asset.localId, fixture.asset);
      const before = structuredClone(store.value);
      render(<GuestBuilderRuntime createStore={() => store} createId={() => "unused"} />);
      await screen.findByRole("heading", { name: translate("fr", "personSheet.title") });
      // The local blob disappears after the Builder loaded it.
      store.assets.delete(fixture.asset.localId);

      fireEvent.click(screen.getByRole("button", { name: translate("fr", "preview.view") }));
      const alert = await screen.findByText(translate("fr", "preview.unavailable"));
      expect(alert.getAttribute("role")).toBe("alert");
      expect(document.querySelector("[data-memorial-preview]")).toBeNull();
      expect(store.value).toEqual(before);

      cleanup();
      const announcement = announcementCeremonyDraft();
      const flow = localContent(announcement.draft).guidedFlow;
      delete flow.A03;
      const reveal = new MemoryStore({ ...announcement.draft, content: { ...announcement.draft.content, guidedFlow: flow } as MemorialContent });
      reveal.assets.set(announcement.asset.localId, announcement.asset);
      render(<GuestBuilderRuntime createStore={() => reveal} createId={() => "unused"} />);
      await screen.findByRole("button", { name: translate("fr", "deathNotice.editAnnouncement") });
      expect(screen.queryByRole("button", { name: translate("fr", "preview.view") })).toBeNull();
    });
  });

  describe("QG 005-B — « Mon parcours » in the guest Builder", () => {
    function renderRuntime(store: MemoryStore) {
      let sequence = 0;
      const createObjectUrl = vi.fn(() => `blob:guest-${++sequence}`);
      const revokeObjectUrl = vi.fn();
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);
      const view = render(
        <GuestBuilderRuntime
          createStore={() => store}
          createId={() => "unused"}
          now={() => "2026-10-30T10:00:00.000Z"}
          createObjectUrl={createObjectUrl}
          revokeObjectUrl={revokeObjectUrl}
        />,
      );
      return { view, fetchSpy, revokeObjectUrl };
    }

    function openJourneyRubrique(name: string) {
      fireEvent.click(screen.getByRole("button", { name: translate("fr", "journey.open") }));
      const panel = screen.getByRole("dialog");
      fireEvent.click(within(panel).getByRole("button", { name: new RegExp(name) }));
      return panel;
    }

    function review(label: string) {
      fireEvent.click(screen.getByRole("button", { name: `${translate("fr", "journey.review")} — ${label}` }));
    }

    it("reopens Nom et dates from the resting screen, saves it, and resumes at the notice to re-verify", async () => {
      const fixture = completedDraft();
      const store = new MemoryStore(fixture.draft);
      store.assets.set(fixture.asset.localId, fixture.asset);
      const { view, fetchSpy } = renderRuntime(store);

      await screen.findByRole("heading", { name: translate("fr", "flowPause.title") });
      const panel = openJourneyRubrique(translate("fr", "journey.section.person"));
      // The whole local Hero reads done: every person screen is reopenable.
      expect(within(panel).getAllByRole("button", { name: new RegExp(`^${translate("fr", "journey.review")} — `) }))
        .toHaveLength(6);
      review(translate("fr", "journey.screen.identity"));

      await screen.findByRole("heading", { name: translate("fr", "hero.identityTitle") });
      expect(screen.getByText(translate("fr", "journey.revising"))).toBeTruthy();
      fireEvent.change(view.container.querySelector("#hero-display-name")!, { target: { value: "Jeanne Martin" } });
      fireEvent.click(screen.getByRole("button", { name: translate("fr", "common.continue") }));

      // The notice shows the name: A03 is « à compléter » again and is now
      // where the family stopped — the route's own gates, with the
      // rubrique still open (its `?rubrique=`).
      await screen.findByRole("button", { name: translate("fr", "deathNotice.editAnnouncement") });
      expect((store.value!.content as unknown as { hero: { displayName: string } }).hero.displayName).toBe("Jeanne Martin");
      expect(screen.getByRole("dialog")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: translate("fr", "journey.finishReview") }));
      await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(screen.getByRole("button", { name: translate("fr", "deathNotice.editAnnouncement") })).toBeTruthy();
      expect(store.value!.photos).toEqual(fixture.draft.photos);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("revises an earlier answer mid-flow and comes back to the screen where the family stopped", async () => {
      const fixture = postRevealDraft("no");
      const store = new MemoryStore(fixture.draft);
      store.assets.set(fixture.asset.localId, fixture.asset);
      renderRuntime(store);

      await screen.findByRole("heading", { name: translate("fr", "ceremony.momentTitle") });
      openJourneyRubrique(translate("fr", "journey.section.person"));
      review(translate("fr", "journey.screen.phrase"));
      await screen.findByRole("heading", { name: translate("fr", "hero.phraseTitleRemembrance") });
      fireEvent.change(document.querySelector("textarea")!, { target: { value: "Pour toujours" } });
      fireEvent.click(screen.getByRole("button", { name: translate("fr", "common.continue") }));

      await screen.findByRole("heading", { name: translate("fr", "ceremony.momentTitle") });
      expect((store.value!.content as unknown as { hero: { shortPhrase: string } }).hero.shortPhrase).toBe("Pour toujours");
      expect(store.value!.photos).toEqual(fixture.draft.photos);
    });

    it("keeps « Mon parcours » after the Preview closes and changes the ambiance from it, back to the Preview", async () => {
      const fixture = completedDraft();
      const store = new MemoryStore(fixture.draft);
      store.assets.set(fixture.asset.localId, fixture.asset);
      const { view, fetchSpy } = renderRuntime(store);

      await screen.findByRole("heading", { name: translate("fr", "flowPause.title") });
      fireEvent.click(screen.getByRole("button", { name: translate("fr", "preview.view") }));
      fireEvent.click(await screen.findByRole("button", { name: translate("fr", "preview.backToCreation") }));
      await vi.waitFor(() => expect(view.container.querySelector("[data-memorial-preview]")).toBeNull());
      expect(screen.getByRole("button", { name: translate("fr", "journey.open") })).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: translate("fr", "preview.view") }));
      fireEvent.click(await screen.findByRole("button", { name: translate("fr", "preview.changeAmbiance") }));
      await screen.findByRole("button", { name: translate("fr", "hero.revealConfirm") });
      expect(screen.getByText(translate("fr", "journey.revisingFromPreview"))).toBeTruthy();
      fireEvent.click(screen.getByRole("radio", { name: translate("fr", "hero.ambianceDark") }));
      fireEvent.click(screen.getByRole("button", { name: translate("fr", "hero.revealConfirm") }));

      await vi.waitFor(() => expect(view.container.querySelector("[data-memorial-preview]")).toBeTruthy());
      expect(store.value!.skinVariant).toBe("dark");
      fireEvent.click(screen.getByRole("button", { name: translate("fr", "preview.backToCreation") }));
      await screen.findByRole("heading", { name: translate("fr", "flowPause.title") });
      expect(screen.getByRole("button", { name: translate("fr", "journey.open") })).toBeTruthy();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("leaves a revised screen opened from the Preview without changes, straight back to the Preview", async () => {
      const fixture = completedDraft();
      const store = new MemoryStore(fixture.draft);
      store.assets.set(fixture.asset.localId, fixture.asset);
      const before = structuredClone(store.value);
      const { view } = renderRuntime(store);

      await screen.findByRole("heading", { name: translate("fr", "flowPause.title") });
      fireEvent.click(screen.getByRole("button", { name: translate("fr", "preview.view") }));
      fireEvent.click(await screen.findByRole("button", { name: translate("fr", "preview.changeAmbiance") }));
      fireEvent.click(await screen.findByRole("button", { name: translate("fr", "journey.backToPreview") }));
      await vi.waitFor(() => expect(view.container.querySelector("[data-memorial-preview]")).toBeTruthy());
      expect(store.value).toEqual(before);
    });

    it("QG 008 Lot 2 — offers « Enregistrer mon hommage » under the screen, hidden with it while the Preview is open, with no network", async () => {
      const fixture = completedDraft();
      const store = new MemoryStore(fixture.draft);
      store.assets.set(fixture.asset.localId, fixture.asset);
      const { view, fetchSpy } = renderRuntime(store);

      await screen.findByRole("heading", { name: translate("fr", "flowPause.title") });
      const entry = screen.getByRole("button", { name: translate("fr", "durableSave.entry") });
      const builderScreen = entry.closest("[data-builder-screen]");
      expect(builderScreen).not.toBeNull();

      fireEvent.click(screen.getByRole("button", { name: translate("fr", "preview.view") }));
      await vi.waitFor(() => expect(view.container.querySelector("[data-memorial-preview]")).toBeTruthy());
      expect(builderScreen!.hasAttribute("hidden")).toBe(true);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
