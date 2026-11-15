// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  HERO_LOCAL_ID,
  TRANSFER_KEY,
  guestAsset,
  transferableDraft,
} from "@/lib/guest-draft/guest-transfer-test-fixtures";
import { MediaActionError } from "@/lib/media/media-error-copy";

const { replace, refresh } = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));

const {
  previewGuestDraftSaveAction,
  beginGuestDraftTransferAction,
  recordGuestTransferPhotoAction,
  commitGuestDraftTransferAction,
} = vi.hoisted(() => ({
  previewGuestDraftSaveAction: vi.fn(),
  beginGuestDraftTransferAction: vi.fn(),
  recordGuestTransferPhotoAction: vi.fn(),
  commitGuestDraftTransferAction: vi.fn(),
}));
vi.mock("@/app/brouillon/reprise/actions", () => ({
  previewGuestDraftSaveAction,
  beginGuestDraftTransferAction,
  recordGuestTransferPhotoAction,
  commitGuestDraftTransferAction,
}));

const { signOutGuestDraftAccountAction } = vi.hoisted(() => ({ signOutGuestDraftAccountAction: vi.fn() }));
vi.mock("@/app/brouillon/reprise/change-account-action", () => ({ signOutGuestDraftAccountAction }));

const { read, readPhoto, clear } = vi.hoisted(() => ({
  read: vi.fn(),
  readPhoto: vi.fn(),
  clear: vi.fn(),
}));
vi.mock("@/lib/guest-draft/guest-draft-v3-store", () => ({
  createIndexedDbGuestDraftV3Store: () => ({ read, readPhoto, clear }),
}));

vi.mock("@/app/builder/[memorialId]/media-actions", () => ({
  reserveHeroPhotoUploadAction: vi.fn(),
  finalizeHeroPhotoUploadAction: vi.fn(),
}));
vi.mock("@/app/builder/[memorialId]/gallery-media-actions", () => ({
  reserveGalleryPhotoUploadAction: vi.fn(),
  finalizeGalleryPhotoUploadAction: vi.fn(),
}));
const { uploadAuthenticatedGalleryPhoto } = vi.hoisted(() => ({ uploadAuthenticatedGalleryPhoto: vi.fn() }));
vi.mock("@/lib/media/authenticated-gallery-upload", () => ({ uploadAuthenticatedGalleryPhoto }));

const { GuestDraftTransfer } = await import("./GuestDraftTransfer");

const MEMORIAL_ID = "11111111-1111-4111-8111-111111111111";
const CREATE_PREVIEW = {
  status: "preview" as const,
  outcome: "create" as const,
  activeFreeDrafts: 1,
  maxFreeDrafts: 3,
  memorialId: null,
  freePublishUntil: "2026-11-24T10:00:00Z",
  freeDraftUntil: "2026-12-29T10:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  read.mockResolvedValue({ status: "ready", draft: transferableDraft({ galleryCount: 0 }) });
  readPhoto.mockResolvedValue({ ok: true, asset: guestAsset(HERO_LOCAL_ID) });
  clear.mockResolvedValue(undefined);
  previewGuestDraftSaveAction.mockResolvedValue(CREATE_PREVIEW);
  beginGuestDraftTransferAction.mockResolvedValue({
    status: "ready",
    memorialId: MEMORIAL_ID,
    transferKey: TRANSFER_KEY,
    completed: true,
    created: true,
    pending: [],
  });
  commitGuestDraftTransferAction.mockResolvedValue({
    status: "completed",
    memorialId: MEMORIAL_ID,
    contentWritten: false,
  });
  recordGuestTransferPhotoAction.mockResolvedValue({ status: "recorded" });
  signOutGuestDraftAccountAction.mockResolvedValue({ ok: true });
  uploadAuthenticatedGalleryPhoto.mockResolvedValue({ id: "media-1" });
});

afterEach(cleanup);

describe("GuestDraftTransfer — QG 017 preflight", () => {
  it("shows the account and real create preview, and sends nothing before Continue", async () => {
    render(<GuestDraftTransfer accountEmail="famille@example.test" />);

    expect(await screen.findByText(/Compte connecté : famille@example\.test/)).toBeTruthy();
    expect(screen.getByText(/Cet hommage sera conservé jusqu'au 29 décembre 2026/)).toBeTruthy();
    expect(screen.getByText(/publier gratuitement un de vos hommages jusqu'au 24 novembre 2026/)).toBeTruthy();
    expect(screen.getByText("Hommages en préparation : 2 / 3")).toBeTruthy();
    expect(beginGuestDraftTransferAction).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    await waitFor(() => expect(beginGuestDraftTransferAction).toHaveBeenCalledOnce());
    await waitFor(() => expect(clear).toHaveBeenCalledOnce());
    expect(replace).toHaveBeenCalledWith(`/builder/${MEMORIAL_ID}?sauvegarde=1`);
  });

  it.each([
    [0, "Hommages en préparation : 1 / 3"],
    [1, "Hommages en préparation : 2 / 3"],
    [2, "Hommages en préparation : 3 / 3"],
  ])("previews the first, second and third draft (%i already active)", async (activeFreeDrafts, expected) => {
    previewGuestDraftSaveAction.mockResolvedValue({ ...CREATE_PREVIEW, activeFreeDrafts });
    render(<GuestDraftTransfer accountEmail="famille@example.test" />);

    expect(await screen.findByText(expected)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continuer" })).toBeTruthy();
    expect(beginGuestDraftTransferAction).not.toHaveBeenCalled();
  });

  it("blocks the fourth draft, links to the family space and never clears the local copy", async () => {
    previewGuestDraftSaveAction.mockResolvedValue({
      ...CREATE_PREVIEW,
      outcome: "limit_reached",
      activeFreeDrafts: 3,
      memorialId: MEMORIAL_ID,
      freePublishUntil: null,
      freeDraftUntil: null,
    });
    render(<GuestDraftTransfer accountEmail="famille@example.test" />);

    expect(await screen.findByText(/déjà 3 hommages en préparation/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Continuer" })).toBeNull();
    expect(screen.getByRole("link", { name: "Ouvrir l'hommage enregistré" }).getAttribute("href")).toBe("/owner?langue=fr");
    expect(beginGuestDraftTransferAction).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });

  it("keeps a refused preview local and offers a retry", async () => {
    previewGuestDraftSaveAction.mockResolvedValue({ status: "refused" });
    render(<GuestDraftTransfer accountEmail="famille@example.test" />);

    expect(await screen.findByText(/conservé uniquement dans ce navigateur/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeTruthy();
    expect(beginGuestDraftTransferAction).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });

  it("resumes an interrupted transfer directly, with the same local transfer key", async () => {
    previewGuestDraftSaveAction.mockResolvedValue({
      ...CREATE_PREVIEW,
      outcome: "resume",
      activeFreeDrafts: 1,
      memorialId: MEMORIAL_ID,
    });
    beginGuestDraftTransferAction.mockResolvedValue({
      status: "ready",
      memorialId: MEMORIAL_ID,
      transferKey: TRANSFER_KEY,
      completed: true,
      created: false,
      pending: [],
    });
    render(<GuestDraftTransfer accountEmail="famille@example.test" />);

    await waitFor(() => expect(beginGuestDraftTransferAction).toHaveBeenCalledOnce());
    expect(screen.queryByRole("button", { name: "Continuer" })).toBeNull();
    await waitFor(() => expect(clear).toHaveBeenCalledOnce());
  });

  it("changes account with a local sign-out and never clears the guest draft", async () => {
    render(<GuestDraftTransfer accountEmail="famille@example.test" />);
    await screen.findByRole("button", { name: "Changer de compte" });

    fireEvent.click(screen.getByRole("button", { name: "Changer de compte" }));
    await waitFor(() => expect(signOutGuestDraftAccountAction).toHaveBeenCalledOnce());
    expect(replace).toHaveBeenCalledWith("/brouillon/sauvegarder?langue=fr");
    expect(refresh).toHaveBeenCalledOnce();
    expect(clear).not.toHaveBeenCalled();
  });

  it("renders the same preview messages in Spanish", async () => {
    read.mockResolvedValue({
      status: "ready",
      draft: transferableDraft({ galleryCount: 0, language: "es" }),
    });
    render(<GuestDraftTransfer accountEmail="familia@example.test" />);

    expect(await screen.findByText(/Cuenta conectada: familia@example\.test/)).toBeTruthy();
    expect(screen.getByText("Homenajes en preparación: 2 / 3")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cambiar de cuenta" })).toBeTruthy();
  });

  it("keeps the local draft when the transfer fails", async () => {
    beginGuestDraftTransferAction.mockRejectedValue(new Error("network"));
    render(<GuestDraftTransfer accountEmail="famille@example.test" />);
    fireEvent.click(await screen.findByRole("button", { name: "Continuer" }));

    expect(await screen.findByText(/toujours conservé sur ce navigateur/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeTruthy();
    expect(clear).not.toHaveBeenCalled();
  });

  it("explains a full free photo space without exposing HD507 and keeps the local draft", async () => {
    beginGuestDraftTransferAction.mockResolvedValue({
      status: "ready",
      memorialId: MEMORIAL_ID,
      transferKey: TRANSFER_KEY,
      completed: false,
      created: true,
      pending: [{ localId: HERO_LOCAL_ID, purpose: "hero" }],
    });
    uploadAuthenticatedGalleryPhoto.mockRejectedValue(new MediaActionError("storage_budget_reached"));
    render(<GuestDraftTransfer accountEmail="famille@example.test" />);
    fireEvent.click(await screen.findByRole("button", { name: "Continuer" }));

    expect(await screen.findByText(/L'espace photos de l'offre gratuite de votre compte est plein/)).toBeTruthy();
    expect(document.body.textContent).not.toContain("HD507");
    expect(clear).not.toHaveBeenCalled();
  });
});
