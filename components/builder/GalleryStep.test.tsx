// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { MemorialContent } from "@/types/memorial";
import { MAX_MEDIA_BYTES } from "@/config/media";

/**
 * A13 — "Vos souvenirs en images": the real Builder screen, rendered
 * through the real BuilderScreen / useAutosave / GalleryWorkshop tree.
 * STATE and RENDER contracts (which controls exist, what they write and
 * in which order) — never computed pixel layout. `next/navigation`,
 * `next/font` and the browser Supabase client are mocked exactly like
 * HeroPhotoStep.test.tsx; the Gallery actions and `persist` are plain
 * props.
 */

const { useRouter, routerRefresh } = vi.hoisted(() => {
  const refresh = vi.fn();
  return { routerRefresh: refresh, useRouter: vi.fn(() => ({ refresh })) };
});
vi.mock("next/navigation", () => ({ useRouter }));
vi.mock("next/font/google", () => ({
  Playfair_Display: () => ({ variable: "--font-heritage-serif-mock", className: "" }),
  Inter: () => ({ variable: "--font-heritage-sans-mock", className: "" }),
  Cormorant_Garamond: () => ({ variable: "--font-heritage-hero-serif-mock", className: "" }),
  La_Belle_Aurore: () => ({ variable: "--font-heritage-hero-script-mock", className: "" }),
  EB_Garamond: () => ({ variable: "--font-heritage-ceremony-serif-mock", className: "" }),
}));
const { uploadToSignedUrl, getBrowserSupabaseClient } = vi.hoisted(() => {
  const upload = vi.fn().mockResolvedValue({ data: {}, error: null });
  return { uploadToSignedUrl: upload, getBrowserSupabaseClient: vi.fn(() => ({ storage: { from: () => ({ uploadToSignedUrl: upload }) } })) };
});
vi.mock("@/lib/supabase/browser-client", () => ({ getBrowserSupabaseClient }));
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

const { GalleryStep } = await import("./GalleryStep");
const { BuilderPreviewHost } = await import("./preview/BuilderPreviewHost");

const m = (n: number) => `dddddddd-dddd-4ddd-8ddd-${String(n).padStart(12, "0")}`;
const signed = (id: string) => `https://storage.test/signed/${id}`;

function contentWith(n: number, captions: Record<number, string> = {}): MemorialContent {
  return { gallery: { items: Array.from({ length: n }, (_, i) => ({ mediaId: m(i + 1), caption: captions[i + 1] ?? null })) } } as unknown as MemorialContent;
}
function thumbsFor(n: number) {
  return Object.fromEntries(Array.from({ length: n }, (_, i) => [m(i + 1), signed(m(i + 1))]));
}
const galleryOf = (content: MemorialContent) => (content as unknown as { gallery: { items: { mediaId: string; caption: string | null }[] } }).gallery.items;
const lastPersisted = (persist: ReturnType<typeof vi.fn>) => persist.mock.calls.at(-1)![0] as MemorialContent;

let nextMedia = 100;
function reserved(declared: string) {
  const id = m((nextMedia += 1));
  return { ok: true, value: { mediaId: id, storagePath: `memorial/${id}/original.jpg`, uploadToken: "token", declared } };
}
const finalized = (mediaId: string) => ({ ok: true, value: { id: mediaId, purpose: "gallery", status: "ready" } });

function props(overrides: Partial<Parameters<typeof GalleryStep>[0]> = {}) {
  return {
    language: "fr" as const,
    editorialContext: "announcement" as const,
    content: contentWith(0),
    thumbnails: {},
    persist: vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" }),
    reserveUpload: vi.fn(async (type: string) => reserved(type)),
    finalizeUpload: vi.fn(async (id: string) => finalized(id)),
    retirePhoto: vi.fn().mockResolvedValue({ ok: true, value: { removed: true } }),
    ...overrides,
  } as Parameters<typeof GalleryStep>[0] & {
    persist: ReturnType<typeof vi.fn>;
    reserveUpload: ReturnType<typeof vi.fn>;
    finalizeUpload: ReturnType<typeof vi.fn>;
    retirePhoto: ReturnType<typeof vi.fn>;
  };
}

const file = (name: string, type = "image/jpeg", size = 2048) => new File([new Uint8Array(size)], name, { type });
const addInput = () => document.querySelector<HTMLInputElement>("input[type=file][multiple]")!;
const rows = () => screen.queryAllByRole("listitem").filter((li) => li.closest("ol"));
const numbers = () => rows().map((li) => li.querySelector("[aria-hidden=true]")!.textContent);
const continueButton = () => screen.getByRole("button", { name: /continuer/i });

beforeEach(() => {
  routerRefresh.mockClear();
  uploadToSignedUrl.mockClear();
  uploadToSignedUrl.mockResolvedValue({ data: {}, error: null });
  let blob = 0;
  URL.createObjectURL = vi.fn(() => `blob:local-${(blob += 1)}`);
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

describe("states 0 / 1 / 2–6 / 7+", () => {
  it("0 photo: heading, a calm add zone (multiple, JPEG/PNG/WebP), no register, no ghost slot; Continue and Skip available", () => {
    render(<GalleryStep {...props()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Vos souvenirs en images" })).toBeTruthy();
    expect(screen.getByText("Ajoutez les photos qui racontent sa vie. HERITAGE se chargera de les mettre en scène avec délicatesse.")).toBeTruthy();
    expect(screen.getByText("Ajouter des photos")).toBeTruthy();
    expect(addInput().multiple).toBe(true);
    expect(addInput().accept).toBe("image/jpeg,image/png,image/webp");
    expect(document.querySelector("ol")).toBeNull();
    expect(document.querySelectorAll("img")).toHaveLength(0);
    expect(continueButton()).toHaveProperty("disabled", false);
    expect(screen.getByRole("button", { name: "Passer cette étape" })).toHaveProperty("disabled", false);
  });

  it("1 photo: the gentle hint that a second photo brings the Gallery", () => {
    render(<GalleryStep {...props({ content: contentWith(1), thumbnails: thumbsFor(1) })} />);
    expect(screen.getByText("Ajoutez au moins une autre photo pour faire apparaître la Galerie dans votre hommage.")).toBeTruthy();
    expect(continueButton()).toHaveProperty("disabled", false);
  });

  it("2 and 6 photos: a plain register, no extra message", () => {
    for (const n of [2, 6]) {
      render(<GalleryStep {...props({ content: contentWith(n), thumbnails: thumbsFor(n) })} />);
      expect(rows()).toHaveLength(n);
      expect(numbers()).toEqual(Array.from({ length: n }, (_, i) => String(i + 1).padStart(2, "0")));
      expect(screen.queryByText(/Ajoutez au moins une autre photo/)).toBeNull();
      expect(screen.queryByText(/HERITAGE compose une sélection/)).toBeNull();
      cleanup();
    }
  });

  it("7+ photos: the Album message — never that only six photos will be shown", () => {
    render(<GalleryStep {...props({ content: contentWith(9), thumbnails: thumbsFor(9) })} />);
    expect(screen.getByText("HERITAGE compose une sélection sur la page principale et réunit tous vos souvenirs dans l'Album.")).toBeTruthy();
    expect(rows()).toHaveLength(9);
    expect(document.body.textContent).not.toMatch(/six|6 photos|seules/i);
  });

  it("a corrupted stored Gallery shows the calm notice instead of an editor", () => {
    const corrupted = { gallery: { items: [{ mediaId: "https://x/original.jpg", caption: null }] } } as unknown as MemorialContent;
    render(<GalleryStep {...props({ content: corrupted })} />);
    expect(screen.getByRole("alert").textContent).toBeTruthy();
    expect(document.querySelector("input[type=file]")).toBeNull();
  });
});

describe("the register — neutral thumbnails, order, captions", () => {
  it("shows the photographs in content order with their read URL, whole (contain, never a crop)", () => {
    render(<GalleryStep {...props({ content: contentWith(3), thumbnails: thumbsFor(3) })} />);
    const images = rows().map((li) => li.querySelector("img")!);
    expect(images.map((img) => img.getAttribute("src"))).toEqual([signed(m(1)), signed(m(2)), signed(m(3))]);
    expect(images.map((img) => img.getAttribute("alt"))).toEqual(["Photo 1", "Photo 2", "Photo 3"]);
    const css = readFileSync(path.join(import.meta.dirname, "GalleryWorkshop.module.css"), "utf8");
    expect(css).toMatch(/\.thumbnailImage\s*\{[^}]*object-fit:\s*contain/);
    expect(css).not.toMatch(/object-fit:\s*cover/);
    expect(css).not.toMatch(/box-shadow|#[0-9a-f]{3,6}\b|rgba?\(/i); // tokens only, no decorative shadow
  });

  it("a photograph that cannot be read right now stays listed, removable, with a calm note", () => {
    render(<GalleryStep {...props({ content: contentWith(2), thumbnails: { [m(1)]: signed(m(1)), [m(2)]: null } })} />);
    const second = rows()[1];
    expect(second.querySelector("img")).toBeNull();
    expect(within(second).getByText("Cette photo ne peut pas être affichée pour le moment.")).toBeTruthy();
    expect(within(second).getByRole("button", { name: "Retirer" })).toBeTruthy();
  });

  it("the caption counter appears only near the limit; a long paste stops at 32; the field keeps what was typed", async () => {
    const p = props({ content: contentWith(1, { 1: "x".repeat(23) }), thumbnails: thumbsFor(1) });
    render(<GalleryStep {...p} />);
    const field = screen.getByLabelText("Légende (facultative)") as HTMLInputElement;
    expect(screen.queryByText(/\/ 32/)).toBeNull();
    fireEvent.change(field, { target: { value: "x".repeat(24) } });
    expect(screen.getByText("24 / 32")).toBeTruthy();
    fireEvent.change(field, { target: { value: "Le village de ma grand-mère, été 1966" } });
    expect([...field.value.trim()]).toHaveLength(32); // a trailing space does not count once stored
    expect(screen.getByText("32 / 32")).toBeTruthy();
    fireEvent.change(field, { target: { value: "Tous les deux " } });
    expect(field.value).toBe("Tous les deux "); // no jump: the trailing space the family is typing stays
    expect(screen.queryByText(/\/ 32/)).toBeNull();
    fireEvent.click(continueButton());
    await waitFor(() => expect(routerRefresh).toHaveBeenCalled());
    expect(galleryOf(lastPersisted(p.persist))[0].caption).toBe("Tous les deux"); // stored normalized by the domain
  });

  it("Monter / Descendre: ends disabled, order and numbers follow, the caption travels, aria-live announces, focus stays", async () => {
    const p = props({ content: contentWith(3, { 1: "Maman" }), thumbnails: thumbsFor(3) });
    render(<GalleryStep {...p} />);
    const up = () => screen.getAllByRole("button", { name: "Monter" });
    const down = () => screen.getAllByRole("button", { name: "Descendre" });
    expect(up()[0]).toHaveProperty("disabled", true);
    expect(down()[2]).toHaveProperty("disabled", true);
    expect(up()[1]).toHaveProperty("disabled", false);

    fireEvent.click(down()[0]);
    expect(rows().map((li) => li.querySelector("img")!.getAttribute("src"))).toEqual([signed(m(2)), signed(m(1)), signed(m(3))]);
    expect(numbers()).toEqual(["01", "02", "03"]);
    expect((within(rows()[1]).getByLabelText("Légende (facultative)") as HTMLInputElement).value).toBe("Maman");
    const live = [...document.querySelectorAll("[aria-live=polite]")].find((el) => el.textContent === "Photo déplacée en position 2 sur 3.");
    expect(live?.getAttribute("role")).toBe("status");
    await waitFor(() => expect(document.activeElement).toBe(down()[1]));

    fireEvent.click(down()[1]); // to the end: Descendre becomes unavailable, focus falls back on Monter
    await waitFor(() => expect(document.activeElement).toBe(up()[2]));

    fireEvent.click(continueButton());
    await waitFor(() => expect(routerRefresh).toHaveBeenCalled());
    expect(galleryOf(lastPersisted(p.persist))).toEqual([
      { mediaId: m(2), caption: null },
      { mediaId: m(3), caption: null },
      { mediaId: m(1), caption: "Maman" },
    ]);
  });
});

describe("Retirer — inline confirmation, persist before retire", () => {
  it("first click only asks (locally), focus on Annuler; Annuler restores", async () => {
    const p = props({ content: contentWith(2), thumbnails: thumbsFor(2) });
    render(<GalleryStep {...p} />);
    fireEvent.click(within(rows()[0]).getByRole("button", { name: "Retirer" }));
    expect(within(rows()[0]).getByText("Retirer cette photo de vos souvenirs ?")).toBeTruthy();
    expect(within(rows()[1]).queryByText("Retirer cette photo de vos souvenirs ?")).toBeNull();
    expect(document.querySelector("[role=dialog]")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(within(rows()[0]).getByRole("button", { name: "Annuler" })));
    expect(p.persist).not.toHaveBeenCalled();
    expect(p.retirePhoto).not.toHaveBeenCalled();
    fireEvent.click(within(rows()[0]).getByRole("button", { name: "Annuler" }));
    await waitFor(() => expect(document.activeElement).toBe(within(rows()[0]).getByRole("button", { name: "Retirer" })));
    expect(rows()).toHaveLength(2);
  });

  it("Confirmer: the draft without the reference is saved FIRST, only then is the photograph retired", async () => {
    const p = props({ content: contentWith(3, { 3: "Le village" }), thumbnails: thumbsFor(3) });
    render(<GalleryStep {...p} />);
    fireEvent.click(within(rows()[1]).getByRole("button", { name: "Retirer" }));
    fireEvent.click(within(rows()[1]).getByRole("button", { name: "Confirmer" }));
    await waitFor(() => expect(p.retirePhoto).toHaveBeenCalledWith(m(2)));
    expect(galleryOf(p.persist.mock.calls[0][0])).toEqual([{ mediaId: m(1), caption: null }, { mediaId: m(3), caption: "Le village" }]);
    expect(p.persist.mock.invocationCallOrder[0]).toBeLessThan(p.retirePhoto.mock.invocationCallOrder[0]);
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(numbers()).toEqual(["01", "02"]);
    expect(document.body.textContent).toContain("Photo retirée.");
  });

  it("a failed save retires nothing: the photograph stays, a sober message says so", async () => {
    const p = props({ content: contentWith(2), thumbnails: thumbsFor(2), persist: vi.fn().mockRejectedValue(new Error("offline")) });
    render(<GalleryStep {...p} />);
    fireEvent.click(within(rows()[0]).getByRole("button", { name: "Retirer" }));
    fireEvent.click(within(rows()[0]).getByRole("button", { name: "Confirmer" }));
    await waitFor(() => expect(screen.getByText("Nous n'avons pas pu retirer la photo pour le moment. Vous pouvez réessayer.")).toBeTruthy());
    expect(p.retirePhoto).not.toHaveBeenCalled();
    expect(rows()).toHaveLength(2);
  });
});

describe("Remplacer — same place, same caption, persist before retire", () => {
  it("uploads the new photograph, saves it in place, then retires the previous one", async () => {
    const p = props({ content: contentWith(3, { 2: "Tous les deux" }), thumbnails: thumbsFor(3) });
    render(<GalleryStep {...p} />);
    const input = rows()[1].querySelector<HTMLInputElement>("input[type=file]")!;
    expect(input.multiple).toBe(false);
    fireEvent.change(input, { target: { files: [file("nouvelle.png", "image/png")] } });
    await waitFor(() => expect(p.retirePhoto).toHaveBeenCalledWith(m(2)));
    expect(p.reserveUpload).toHaveBeenCalledWith("image/png");
    const saved = galleryOf(p.persist.mock.calls[0][0]);
    expect(saved.map((item) => item.mediaId)).toEqual([m(1), p.finalizeUpload.mock.calls[0][0], m(3)]);
    expect(saved[1].caption).toBe("Tous les deux");
    expect(p.persist.mock.invocationCallOrder[0]).toBeLessThan(p.retirePhoto.mock.invocationCallOrder[0]);
    await waitFor(() => expect(rows()[1].querySelector("img")!.getAttribute("src")).toMatch(/^blob:/));
    expect((within(rows()[1]).getByLabelText("Légende (facultative)") as HTMLInputElement).value).toBe("Tous les deux");
    expect(document.body.textContent).toContain("Photo remplacée.");
  });

  it("a failed save keeps the previous photograph referenced and never retires it", async () => {
    const p = props({ content: contentWith(2), thumbnails: thumbsFor(2), persist: vi.fn().mockRejectedValue(new Error("offline")) });
    render(<GalleryStep {...p} />);
    fireEvent.change(rows()[0].querySelector<HTMLInputElement>("input[type=file]")!, { target: { files: [file("x.jpg")] } });
    await waitFor(() => expect(within(rows()[0]).getByRole("alert")).toBeTruthy());
    expect(p.retirePhoto).not.toHaveBeenCalled();
    expect(rows()[0].querySelector("img")!.getAttribute("src")).toBe(signed(m(1)));
  });

  it("a refused file (format) never reaches the server", async () => {
    const p = props({ content: contentWith(2), thumbnails: thumbsFor(2) });
    render(<GalleryStep {...p} />);
    fireEvent.change(rows()[0].querySelector<HTMLInputElement>("input[type=file]")!, { target: { files: [file("x.heic", "image/heic")] } });
    expect(within(rows()[0]).getByRole("alert").textContent).toContain("JPEG, PNG ou WebP");
    expect(p.reserveUpload).not.toHaveBeenCalled();
  });
});

describe("Ajouter des photos — several files, one after another, each with its own state", () => {
  it("processes valid files in order, refuses a wrong type immediately, appends each success to the saved draft", async () => {
    const p = props({ content: contentWith(1), thumbnails: thumbsFor(1) });
    render(<GalleryStep {...p} />);
    fireEvent.change(addInput(), { target: { files: [file("a.jpg"), file("b.heic", "image/heic"), file("c.webp", "image/webp")] } });
    expect(screen.getByText("b.heic")).toBeTruthy();
    expect(continueButton()).toHaveProperty("disabled", true); // uploads in progress
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(p.reserveUpload.mock.calls).toEqual([["image/jpeg"], ["image/webp"]]); // the purpose is never the browser's to pass
    const [first, second] = p.finalizeUpload.mock.calls.map((call) => call[0]);
    expect(galleryOf(p.persist.mock.calls[0][0]).map((item) => item.mediaId)).toEqual([m(1), first]);
    expect(galleryOf(p.persist.mock.calls[1][0]).map((item) => item.mediaId)).toEqual([m(1), first, second]);
    expect(screen.getByRole("alert").textContent).toContain("JPEG, PNG ou WebP");
    await waitFor(() => expect(continueButton()).toHaveProperty("disabled", false));
    fireEvent.click(screen.getByRole("button", { name: "Ignorer" }));
    expect(screen.queryByText("b.heic")).toBeNull();
  });

  it("a failure on one file never undoes the ones already added, and the next file still goes through", async () => {
    const finalizeUpload = vi.fn(async (id: string) => (finalizeUpload.mock.calls.length === 2 ? { ok: false, code: "invalid_file" } : finalized(id)));
    const p = props({ finalizeUpload: finalizeUpload as unknown as Parameters<typeof GalleryStep>[0]["finalizeUpload"] });
    render(<GalleryStep {...p} />);
    fireEvent.change(addInput(), { target: { files: [file("a.jpg"), file("b.jpg"), file("c.jpg")] } });
    await waitFor(() => expect(finalizeUpload).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(rows()).toHaveLength(2));
    const ids = finalizeUpload.mock.calls.map((call) => call[0]);
    expect(galleryOf(lastPersisted(p.persist)).map((item) => item.mediaId)).toEqual([ids[0], ids[2]]);
    expect(screen.getByText("b.jpg")).toBeTruthy();
    expect(screen.getByText("Nous n'avons pas pu utiliser cette photo. Essayez-en une autre.")).toBeTruthy();
  });

  it("a too-large file and a failed storage upload each stay on their own line", async () => {
    uploadToSignedUrl.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const p = props();
    render(<GalleryStep {...p} />);
    fireEvent.change(addInput(), { target: { files: [file("grande.jpg", "image/jpeg", MAX_MEDIA_BYTES + 1), file("reseau.jpg"), file("ok.jpg")] } });
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(screen.getByText("Cette photo est trop volumineuse. Essayez-en une autre.")).toBeTruthy();
    expect(screen.getByText("Nous n'avons pas pu ajouter la photo pour le moment. Vous pouvez réessayer.")).toBeTruthy();
    expect(p.reserveUpload).toHaveBeenCalledTimes(2);
  });

  it("content.gallery only ever holds { mediaId, caption } — no URL, no blob:, no path", async () => {
    const p = props();
    render(<GalleryStep {...p} />);
    fireEvent.change(addInput(), { target: { files: [file("a.jpg")] } });
    await waitFor(() => expect(rows()).toHaveLength(1));
    const items = galleryOf(lastPersisted(p.persist));
    expect(Object.keys(items[0]).sort()).toEqual(["caption", "mediaId"]);
    expect(JSON.stringify(lastPersisted(p.persist))).not.toMatch(/blob:|https?:|original\./);
  });
});

describe("Continuer / Passer", () => {
  it("Continue with photographs writes A13 completed — photographs and order untouched — then refreshes", async () => {
    const p = props({ content: contentWith(3), thumbnails: thumbsFor(3) });
    render(<GalleryStep {...p} />);
    fireEvent.click(continueButton());
    await waitFor(() => expect(routerRefresh).toHaveBeenCalled());
    const saved = lastPersisted(p.persist) as unknown as { guidedFlow: Record<string, unknown> };
    expect(saved.guidedFlow.A13).toEqual({ status: "completed" });
    expect(galleryOf(saved as unknown as MemorialContent)).toEqual(galleryOf(contentWith(3)));
    expect(p.retirePhoto).not.toHaveBeenCalled();
  });

  it("Continue with no photograph resolves the step (skipped) — never blocked", async () => {
    const p = props();
    render(<GalleryStep {...p} />);
    fireEvent.click(continueButton());
    await waitFor(() => expect(routerRefresh).toHaveBeenCalled());
    expect((lastPersisted(p.persist) as unknown as { guidedFlow: Record<string, unknown> }).guidedFlow.A13).toEqual({ status: "skipped" });
  });

  it("Skip keeps every photograph and retires nothing", async () => {
    const p = props({ content: contentWith(2), thumbnails: thumbsFor(2) });
    render(<GalleryStep {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Passer cette étape" }));
    await waitFor(() => expect(routerRefresh).toHaveBeenCalled());
    const saved = lastPersisted(p.persist);
    expect((saved as unknown as { guidedFlow: Record<string, unknown> }).guidedFlow.A13).toEqual({ status: "skipped" });
    expect(galleryOf(saved)).toHaveLength(2);
    expect(p.retirePhoto).not.toHaveBeenCalled();
  });

  it("a failed save keeps the family on the step with a message", async () => {
    const p = props({ persist: vi.fn().mockRejectedValue(new Error("offline")) });
    render(<GalleryStep {...p} />);
    fireEvent.click(continueButton());
    await waitFor(() => expect(screen.getByText("Une erreur est survenue.")).toBeTruthy());
    expect(routerRefresh).not.toHaveBeenCalled();
  });
});

describe("FR / EN / ES and the Preview", () => {
  it("every system text comes from the dictionaries; family captions are never translated", () => {
    for (const [language, title, add, remove, up] of [
      ["en", "Your memories in pictures", "Add photos", "Remove", "Move up"],
      ["es", "Sus recuerdos en imágenes", "Añadir fotos", "Quitar", "Subir"],
    ] as const) {
      render(<GalleryStep {...props({ language, content: contentWith(2, { 1: "Maman" }), thumbnails: thumbsFor(2) })} />);
      expect(screen.getByRole("heading", { level: 1, name: title })).toBeTruthy();
      expect(screen.getByText(add)).toBeTruthy();
      expect(screen.getAllByRole("button", { name: remove })).toHaveLength(2);
      expect(screen.getAllByRole("button", { name: up })).toHaveLength(2);
      expect((screen.getAllByRole("textbox")[0] as HTMLInputElement).value).toBe("Maman");
      cleanup();
    }
  });

  it("opening the Preview first drains the step's autosave (a caption typed a moment ago is saved before the read)", async () => {
    const p = props({ content: contentWith(2), thumbnails: thumbsFor(2) });
    const loadPreview = vi.fn().mockResolvedValue({ status: "unavailable" });
    render(
      <BuilderPreviewHost available language="fr" loadPreview={loadPreview}>
        <GalleryStep {...p} />
      </BuilderPreviewHost>,
    );
    fireEvent.change(screen.getAllByLabelText("Légende (facultative)")[0], { target: { value: "Maman" } });
    fireEvent.click(screen.getByRole("button", { name: "Voir l'aperçu" }));
    await waitFor(() => expect(loadPreview).toHaveBeenCalled());
    expect(galleryOf(p.persist.mock.calls[0][0])[0].caption).toBe("Maman");
    expect(p.persist.mock.invocationCallOrder[0]).toBeLessThan(loadPreview.mock.invocationCallOrder[0]);
  });
});
