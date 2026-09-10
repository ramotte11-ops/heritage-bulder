// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Mission 033 — contract tests for PAGE C (T06, the Hero photo). Same
 * discipline as BuilderPreviewLayout.test.tsx: STATE and RENDER
 * CONTRACTS — which controls exist for a given state, what they're
 * labelled, whether Continue is really disabled — never computed
 * CSS/pixel layout.
 *
 * `next/navigation` and `@/lib/supabase/browser-client` are mocked so
 * this file needs neither a real router nor a real Supabase project;
 * `reserveUpload`/`finalizeUpload`/`replaceUpload`/`persist` are plain
 * props, mocked per test exactly like every other Guided Flow screen's
 * `persist` would be if it had its own DOM test.
 */

const { useRouter, routerRefresh } = vi.hoisted(() => {
  const refresh = vi.fn();
  return { routerRefresh: refresh, useRouter: vi.fn(() => ({ refresh })) };
});
vi.mock("next/navigation", () => ({ useRouter }));

// `next/font/google` needs the real Next.js compiler's special handling
// (an SWC/webpack loader) to self-host a font — calling it directly under
// plain Vitest throws. This is the standard test-environment stub for
// it (mirrors Next.js's own testing guidance): every Guided Flow screen
// reaches it transitively through BuilderScreen.tsx, so this is what
// makes rendering the REAL component tree possible here at all, rather
// than mocking BuilderScreen/HeroPhotoStep itself away.
vi.mock("next/font/google", () => ({
  Playfair_Display: () => ({ variable: "--font-heritage-serif-mock", className: "" }),
  Inter: () => ({ variable: "--font-heritage-sans-mock", className: "" }),
}));

const { uploadToSignedUrl, getBrowserSupabaseClient } = vi.hoisted(() => {
  const upload = vi.fn().mockResolvedValue({ data: {}, error: null });
  return {
    uploadToSignedUrl: upload,
    getBrowserSupabaseClient: vi.fn(() => ({
      storage: { from: () => ({ uploadToSignedUrl: upload }) },
    })),
  };
});
vi.mock("@/lib/supabase/browser-client", () => ({ getBrowserSupabaseClient }));

const { HeroPhotoStep } = await import("./HeroPhotoStep");

afterEach(cleanup);

const CONTENT = {
  hero: { displayName: "Jean Dupont", birth: null, death: null, shortPhrase: null, photo: null },
};

const READY_MEDIA_ID = "cccccccc-cccc-4ccc-8ccc-000000000001";

/** The shape `resolveHeroPhotoStepData` actually hands PAGE C: `content`
 * already carries the linked photo, consistent with `initialPhoto` —
 * exactly what a real server render produces. */
const CONTENT_WITH_PHOTO = {
  hero: {
    displayName: "Jean Dupont",
    birth: null,
    death: null,
    shortPhrase: null,
    photo: { mediaId: READY_MEDIA_ID, crop: null },
  },
};

const READY_MEDIA = {
  id: "cccccccc-cccc-4ccc-8ccc-000000000001",
  memorialId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  ownerId: "11111111-1111-4111-8111-111111111111",
  storagePath: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/cccccccc-cccc-4ccc-8ccc-000000000001/original.jpg",
  mediaType: "photo" as const,
  purpose: "hero" as const,
  status: "ready" as const,
  mimeType: "image/jpeg",
  originalFilename: null,
  sizeBytes: 12345,
  width: null,
  height: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function jpegFile(name = "photo.jpg", size = 1024) {
  const file = new File([new Uint8Array(size)], name, { type: "image/jpeg" });
  return file;
}

function baseProps(overrides: Partial<Parameters<typeof HeroPhotoStep>[0]> = {}) {
  return {
    language: "fr" as const,
    editorialContext: "remembrance" as const,
    content: CONTENT,
    initialPhoto: null,
    persist: vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" }),
    reserveUpload: vi.fn(),
    finalizeUpload: vi.fn(),
    replaceUpload: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  routerRefresh.mockClear();
  uploadToSignedUrl.mockClear();
  uploadToSignedUrl.mockResolvedValue({ data: {}, error: null });
  getBrowserSupabaseClient.mockClear();
});

describe("HeroPhotoStep — empty state", () => {
  it("shows the add-photo control and the cropping note is NOT shown yet", () => {
    render(<HeroPhotoStep {...baseProps()} />);

    expect(screen.getByText("Ajouter une photo")).toBeTruthy();
    expect(screen.queryByText(/cadrage/i)).toBeNull();
    expect(screen.queryByText("Changer la photo")).toBeNull();
  });

  it("Continue is disabled until a photo is ready", () => {
    render(<HeroPhotoStep {...baseProps()} />);

    const button = screen.getByRole("button", { name: /continuer/i });
    expect(button).toHaveProperty("disabled", true);
  });

  it("the file input only accepts the three supported image types", () => {
    render(<HeroPhotoStep {...baseProps()} />);

    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    expect(input.accept).toBe("image/jpeg,image/png,image/webp");
  });

  it("never renders any Hero preview, crop, or Light/Dark control", () => {
    render(<HeroPhotoStep {...baseProps()} />);

    expect(screen.queryByText(/crop/i)).toBeNull();
    expect(screen.queryByText(/clair|sombre|dark|light/i)).toBeNull();
  });
});

describe("HeroPhotoStep — a photo already ready (resumed from the server)", () => {
  it("shows the photo simply, the exact QG-validated cropping note, and 'Changer la photo'", () => {
    render(
      <HeroPhotoStep
        {...baseProps({
          content: CONTENT_WITH_PHOTO,
          initialPhoto: { media: READY_MEDIA, readUrl: "https://storage.test/signed/x" },
        })}
      />,
    );

    const img = screen.getByAltText("Photo choisie pour l'hommage") as HTMLImageElement;
    expect(img.src).toContain("https://storage.test/signed/x");
    expect(
      screen.getByText("Ne vous inquiétez pas du cadrage pour l'instant : vous pourrez l'ajuster juste après."),
    ).toBeTruthy();
    expect(screen.getByText("Changer la photo")).toBeTruthy();
    expect(screen.queryByText("Ajouter une photo")).toBeNull();
  });

  it("Continue is enabled once a photo is ready", () => {
    render(
      <HeroPhotoStep
        {...baseProps({
          content: CONTENT_WITH_PHOTO,
          initialPhoto: { media: READY_MEDIA, readUrl: "https://storage.test/signed/x" },
        })}
      />,
    );

    const button = screen.getByRole("button", { name: /continuer/i });
    expect(button).toHaveProperty("disabled", false);
  });

  it("clicking Continue commits T06 and persists, then refreshes the route", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    render(
      <HeroPhotoStep
        {...baseProps({
          content: CONTENT_WITH_PHOTO,
          initialPhoto: { media: READY_MEDIA, readUrl: "https://storage.test/signed/x" },
          persist,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /continuer/i }));

    await waitFor(() => expect(persist).toHaveBeenCalled());
    const persisted = persist.mock.calls[0][0];
    expect(persisted.guidedFlow.T06).toEqual({ status: "completed" });
    expect(persisted.hero.photo).toEqual({ mediaId: READY_MEDIA.id, crop: null });
    await waitFor(() => expect(routerRefresh).toHaveBeenCalled());
  });
});

describe("HeroPhotoStep — a fresh upload, start to finish", () => {
  it("reserves, uploads directly to Storage, finalizes, then enables Continue", async () => {
    const reserveUpload = vi.fn().mockResolvedValue({
      ok: true,
      value: {
        mediaId: READY_MEDIA.id,
        storagePath: READY_MEDIA.storagePath,
        uploadUrl: "https://storage.test/upload/x",
        uploadToken: "token-x",
      },
    });
    const finalizeUpload = vi.fn().mockResolvedValue({ ok: true, value: READY_MEDIA });

    render(<HeroPhotoStep {...baseProps({ reserveUpload, finalizeUpload })} />);

    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [jpegFile()] } });

    await waitFor(() => expect(reserveUpload).toHaveBeenCalledWith("image/jpeg"));
    await waitFor(() => expect(uploadToSignedUrl).toHaveBeenCalledWith(
      READY_MEDIA.storagePath,
      "token-x",
      expect.any(File),
      expect.objectContaining({ contentType: "image/jpeg" }),
    ));
    await waitFor(() => expect(finalizeUpload).toHaveBeenCalledWith(READY_MEDIA.id));

    await waitFor(() => {
      const button = screen.getByRole("button", { name: /continuer/i });
      expect(button).toHaveProperty("disabled", false);
    });
    expect(screen.getByText("Changer la photo")).toBeTruthy();
  });

  it("shows the in-flight status text while uploading/finalizing — no invented percentage", async () => {
    let resolveFinalize: (value: { ok: true; value: typeof READY_MEDIA }) => void = () => {};
    const reserveUpload = vi.fn().mockResolvedValue({
      ok: true,
      value: {
        mediaId: READY_MEDIA.id,
        storagePath: READY_MEDIA.storagePath,
        uploadUrl: "https://storage.test/upload/x",
        uploadToken: "token-x",
      },
    });
    const finalizeUpload = vi.fn(
      () => new Promise((resolve: typeof resolveFinalize) => { resolveFinalize = resolve; }),
    );

    render(<HeroPhotoStep {...baseProps({ reserveUpload, finalizeUpload })} />);

    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [jpegFile()] } });

    await waitFor(() => expect(screen.getByText("Ajout de la photo…")).toBeTruthy());
    expect(screen.queryByText(/%/)).toBeNull();

    resolveFinalize({ ok: true, value: READY_MEDIA });
  });
});

describe("HeroPhotoStep — human errors, never technical ones", () => {
  it("shows the exact 'too large' message and never calls reserveUpload for an oversized file", async () => {
    const reserveUpload = vi.fn();
    render(<HeroPhotoStep {...baseProps({ reserveUpload })} />);

    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    const bigFile = jpegFile("big.jpg", 16 * 1024 * 1024);
    fireEvent.change(input, { target: { files: [bigFile] } });

    await waitFor(() =>
      expect(screen.getByText("Cette photo est trop volumineuse. Essayez-en une autre.")).toBeTruthy(),
    );
    expect(reserveUpload).not.toHaveBeenCalled();
  });

  it("shows the human 'unsupported format' message for a PDF, never calling reserveUpload", async () => {
    const reserveUpload = vi.fn();
    render(<HeroPhotoStep {...baseProps({ reserveUpload })} />);

    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    const pdf = new File([new Uint8Array(10)], "doc.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [pdf] } });

    await waitFor(() =>
      expect(
        screen.getByText(
          "Ce format de photo n'est pas encore pris en charge. Choisissez une photo JPEG, PNG ou WebP.",
        ),
      ).toBeTruthy(),
    );
    expect(reserveUpload).not.toHaveBeenCalled();
  });

  it("maps a server refusal (e.g. invalid_file) to its human message, never the raw code", async () => {
    const reserveUpload = vi.fn().mockResolvedValue({ ok: false, code: "invalid_file" });

    render(<HeroPhotoStep {...baseProps({ reserveUpload })} />);

    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [jpegFile()] } });

    await waitFor(() =>
      expect(screen.getByText("Nous n'avons pas pu utiliser cette photo. Essayez-en une autre.")).toBeTruthy(),
    );
    expect(screen.queryByText(/invalid_file/)).toBeNull();
  });

  it("on a failed replacement, the OLD photo stays visible — never a hole with no photo", async () => {
    const reserveUpload = vi.fn().mockResolvedValue({
      ok: true,
      value: {
        mediaId: "cccccccc-cccc-4ccc-8ccc-000000000002",
        storagePath: "x/y/original.jpg",
        uploadUrl: "https://storage.test/upload/y",
        uploadToken: "token-y",
      },
    });
    const replaceUpload = vi.fn().mockResolvedValue({ ok: false, code: "storage_unavailable" });

    render(
      <HeroPhotoStep
        {...baseProps({
          content: CONTENT_WITH_PHOTO,
          initialPhoto: { media: READY_MEDIA, readUrl: "https://storage.test/signed/original" },
          reserveUpload,
          replaceUpload,
        })}
      />,
    );

    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [jpegFile("new.jpg")] } });

    await waitFor(() =>
      expect(
        screen.getByText("Nous n'avons pas pu ajouter la photo pour le moment. Vous pouvez réessayer."),
      ).toBeTruthy(),
    );
    // The original photo is still there, and Continue is still enabled.
    const img = screen.getByAltText("Photo choisie pour l'hommage") as HTMLImageElement;
    expect(img.src).toContain("https://storage.test/signed/original");
    const button = screen.getByRole("button", { name: /continuer/i });
    expect(button).toHaveProperty("disabled", false);
  });

  it("errors are announced via role=alert for basic accessibility", async () => {
    const reserveUpload = vi.fn();
    render(<HeroPhotoStep {...baseProps({ reserveUpload })} />);

    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    const pdf = new File([new Uint8Array(10)], "doc.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [pdf] } });

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  });
});

describe("HeroPhotoStep — corrupted stored Hero", () => {
  it("shows the shared data-unavailable notice, never a form", () => {
    render(
      <HeroPhotoStep {...baseProps({ content: { hero: "garbage" } as never })} />,
    );

    expect(
      screen.getByText(
        "Nous n'avons pas pu charger ces informations pour le moment. Merci de réessayer dans quelques instants.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /continuer/i })).toBeNull();
  });
});

describe("HeroPhotoStep — EN/FR/ES", () => {
  it("renders the English copy", () => {
    render(<HeroPhotoStep {...baseProps({ language: "en" })} />);
    expect(screen.getByText("Choose the main photo")).toBeTruthy();
    expect(screen.getByText("Add a photo")).toBeTruthy();
  });

  it("renders the Spanish copy", () => {
    render(<HeroPhotoStep {...baseProps({ language: "es" })} />);
    expect(screen.getByText("Elija la foto principal")).toBeTruthy();
    expect(screen.getByText("Añadir una foto")).toBeTruthy();
  });

  it("renders the French copy (default)", () => {
    render(<HeroPhotoStep {...baseProps({ language: "fr" })} />);
    expect(screen.getByText("Choisissez la photo principale")).toBeTruthy();
    expect(screen.getByText("Ajouter une photo")).toBeTruthy();
  });
});
