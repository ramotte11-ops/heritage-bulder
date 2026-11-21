import { describe, expect, it, vi } from "vitest";

const { prepareChosenPhoto, uploadToSignedUrl } = vi.hoisted(() => ({
  prepareChosenPhoto: vi.fn(async (f: File) => new File([f], "prepared.webp", { type: "image/webp" })),
  uploadToSignedUrl: vi.fn(async () => ({ error: null })),
}));
vi.mock("@/lib/media/prepare-chosen-photo", () => ({ prepareChosenPhoto }));
vi.mock("@/lib/supabase/browser-client", () => ({ getBrowserSupabaseClient: () => ({ storage: { from: () => ({ uploadToSignedUrl }) } }) }));

const { createContributionDepositTransport } = await import("./deposit-transport");

/** M8-E4 — le transport réel, sur des Server Actions simulées. */
const SLUG = "a1b2c3d4e5f6";
function actions(over: Record<string, unknown> = {}) {
  return {
    openContributionWindow: vi.fn(async () => ({ status: "ready", formToken: "tok" })),
    depositContributionText: vi.fn(async () => ({ status: "published" })),
    beginContributionPhoto: vi.fn(async () => ({
      status: "ready",
      mediaId: "m1",
      uploadToken: "up",
      photoTicket: "ticket",
      uploadUrl: "https://x.supabase.co/storage/v1/object/upload/sign/memorial-media/mem/m1/original.webp?token=up",
    })),
    completeContributionPhoto: vi.fn(async () => ({ status: "pending" })),
    ...over,
  };
}

describe("M8-E4 — transport de dépôt", () => {
  it("passe le slug, et ne transmet jamais un statut inconnu tel quel", async () => {
    const a = actions({ depositContributionText: vi.fn(async () => ({ status: "weird" })) });
    const t = createContributionDepositTransport(SLUG, a as never);
    expect(await t.open()).toEqual({ status: "ready", formToken: "tok" });
    expect(await t.depositText({ type: "condolence", authorName: "A", text: "B", formToken: "tok", website: "" })).toEqual({ status: "unavailable" });
    expect(a.depositContributionText).toHaveBeenCalledWith({ slug: SLUG, type: "condolence", authorName: "A", text: "B", formToken: "tok", website: "" });
  });

  it("photo : préparée dans le navigateur, envoyée sur le seul chemin réservé, puis finalisée avec le ticket", async () => {
    const a = actions();
    const t = createContributionDepositTransport(SLUG, a as never);
    const r = await t.depositPhoto({ file: new File(["x"], "p.jpg", { type: "image/jpeg" }), authorName: "M", caption: "", formToken: "tok", website: "" });
    expect(r).toEqual({ status: "pending" });
    expect(a.beginContributionPhoto).toHaveBeenCalledWith({ slug: SLUG, declaredMimeType: "image/webp", formToken: "tok", website: "" });
    expect(uploadToSignedUrl).toHaveBeenCalledWith("mem/m1/original.webp", "up", expect.any(File), { contentType: "image/webp" });
    expect(a.completeContributionPhoto).toHaveBeenCalledWith(expect.objectContaining({ mediaId: "m1", photoTicket: "ticket" }));
  });

  it("une photo illisible dans le navigateur est refusée sans réservation", async () => {
    prepareChosenPhoto.mockRejectedValueOnce(new Error("decode"));
    const a = actions();
    const r = await createContributionDepositTransport(SLUG, a as never).depositPhoto({ file: new File(["x"], "p.heic"), authorName: "M", caption: "", formToken: "tok", website: "" });
    expect(r).toEqual({ status: "invalid", field: "photo" });
    expect(a.beginContributionPhoto).not.toHaveBeenCalled();
  });

  it("plafond à la réservation : busy, aucun envoi", async () => {
    uploadToSignedUrl.mockClear();
    const a = actions({ beginContributionPhoto: vi.fn(async () => ({ status: "busy" })) });
    const r = await createContributionDepositTransport(SLUG, a as never).depositPhoto({ file: new File(["x"], "p.jpg"), authorName: "M", caption: "", formToken: "tok", website: "" });
    expect(r).toEqual({ status: "busy" });
    expect(uploadToSignedUrl).not.toHaveBeenCalled();
  });
});
