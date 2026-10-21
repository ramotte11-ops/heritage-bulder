// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { useEffect, useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { MemorialContent } from "@/types/memorial";
import { assembleMemorial } from "@/lib/memorial/assembly/assemble-memorial";
import {
  FIXTURE_DISPLAY_NAME,
  FIXTURE_READ_URL,
  fullAnnouncement,
  recordingResolver,
} from "@/lib/memorial/assembly/test-fixtures";

/**
 * Étape 3 — the Preview host around a real Builder screen (`BuilderScreen`
 * + a step using the real `useAutosave`), opening the REAL assembled
 * Memorial through `MemorialAssembly` and the real renderers. Only the
 * server action is a test double (`loadPreview`).
 */

vi.mock("next/font/google", () => ({
  Cormorant_Garamond: () => ({ variable: "--font-heritage-hero-serif-mock", className: "" }),
  La_Belle_Aurore: () => ({ variable: "--font-heritage-hero-script-mock", className: "" }),
  EB_Garamond: () => ({ variable: "--font-heritage-ceremony-serif-mock", className: "" }),
  Playfair_Display: () => ({ variable: "--font-heritage-serif-mock", className: "" }),
  Inter: () => ({ variable: "--font-heritage-sans-mock", className: "" }),
}));

// « Changer l'ambiance » (correction Light / Dark) navigates through the
// journey provider, never through the host itself.
const { routerPush, useRouter } = vi.hoisted(() => {
  const push = vi.fn();
  return { routerPush: push, useRouter: vi.fn(() => ({ push, replace: vi.fn(), refresh: vi.fn() })) };
});
vi.mock("next/navigation", () => ({ useRouter }));

class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", StubResizeObserver);

const { BuilderPreviewHost } = await import("./BuilderPreviewHost");
type HostResult = Awaited<ReturnType<React.ComponentProps<typeof BuilderPreviewHost>["loadPreview"]>>;
const { BuilderScreen } = await import("@/components/builder/BuilderScreen");
const { useAutosave } = await import("@/lib/builder/use-autosave");
const { resolveJourney } = await import("@/lib/builder/guided-flow/journey");

const OPEN = "Voir l'aperçu";
const BACK = "Revenir à la création";
const UNAVAILABLE = "L’aperçu n’est pas disponible pour le moment. Réessayez dans un instant.";

let events: string[];
let mounts: number;
const scrollTo = vi.fn();

beforeEach(() => {
  events = [];
  mounts = 0;
  scrollTo.mockReset();
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
  Object.defineProperty(window, "scrollY", { configurable: true, value: 420 });
});
afterEach(cleanup);

/** A Guided Flow screen as the real ones are built: local content
 * state, the real autosave, the shared BuilderScreen chrome. */
function Step({ persist }: { persist: (content: MemorialContent) => Promise<{ updatedAt: string }> }) {
  const [content, setContent] = useState<MemorialContent>({});
  useAutosave({ content, persist });
  useEffect(() => {
    mounts += 1;
  }, []);
  return (
    <BuilderScreen progress={0.5}>
      <h1>Écran courant</h1>
      <input
        aria-label="champ"
        onChange={(event) => setContent({ hero: { displayName: event.target.value } } as unknown as MemorialContent)}
      />
    </BuilderScreen>
  );
}

const okPersist = (content: MemorialContent) => {
  events.push(`persist:${JSON.stringify(content)}`);
  return Promise.resolve({ updatedAt: "2026-09-24T00:00:00.000Z" });
};

async function readyResult(): Promise<HostResult> {
  const assembled = await assembleMemorial(
    { skin: "intemporel", skinVariant: "light", language: "fr", content: fullAnnouncement() },
    { resolveMedia: recordingResolver().resolve },
  );
  return { status: "ready", assembled };
}

function renderHost(options: {
  available?: boolean;
  load?: () => Promise<HostResult>;
  persist?: (content: MemorialContent) => Promise<{ updatedAt: string }>;
}) {
  const load = vi.fn(async () => {
    events.push("load");
    return options.load ? options.load() : readyResult();
  });
  const props = { available: options.available ?? true, language: "fr" as const, loadPreview: load };
  const view = render(
    <BuilderPreviewHost {...props}>
      <Step persist={options.persist ?? okPersist} />
    </BuilderPreviewHost>,
  );
  return { ...view, load, props };
}

function builderWrapper(container: HTMLElement) {
  return container.querySelector("[data-builder-screen]") as HTMLElement;
}

async function openPreview() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: OPEN }));
  });
}

// ---------------------------------------------------------------------

describe("availability — nothing before T08, on a Reveal, or without a Hero renderer", () => {
  it("not available → no control, no Preview DOM, nothing reserved", () => {
    const { container } = renderHost({ available: false });
    expect(screen.queryByRole("button", { name: OPEN })).toBeNull();
    expect(container.querySelector("[data-memorial-preview]")).toBeNull();
    expect(builderWrapper(container).hidden).toBe(false);
  });

  it("BuilderScreen outside any host shows no control at all", () => {
    render(
      <BuilderScreen progress={0.5}>
        <p>Écran</p>
      </BuilderScreen>,
    );
    expect(screen.queryByRole("button", { name: OPEN })).toBeNull();
  });

  it("available → the control sits inside BuilderScreen, with its locked label", () => {
    const { container } = renderHost({});
    const button = screen.getByRole("button", { name: OPEN });
    expect(container.querySelector("main")?.contains(button)).toBe(true);
  });

  it("the wrapper never changes with availability — the screen is never remounted", () => {
    const { rerender, props } = renderHost({ available: false });
    fireEvent.change(screen.getByLabelText("champ"), { target: { value: "garde-moi" } });
    rerender(
      <BuilderPreviewHost {...props} available>
        <Step persist={okPersist} />
      </BuilderPreviewHost>,
    );
    expect(mounts).toBe(1);
    expect((screen.getByLabelText("champ") as HTMLInputElement).value).toBe("garde-moi");
  });
});

describe("opening — flush, then a fresh server read, then full screen", () => {
  it("drains the autosave BEFORE reading the draft", async () => {
    renderHost({});
    fireEvent.change(screen.getByLabelText("champ"), { target: { value: "Éléonore" } });
    await openPreview();
    expect(events).toEqual([`persist:${JSON.stringify({ hero: { displayName: "Éléonore" } })}`, "load"]);
  });

  it("a failed flush → no read, no Preview, the Builder stays", async () => {
    const { container, load } = renderHost({ persist: () => Promise.reject(new Error("offline")) });
    fireEvent.change(screen.getByLabelText("champ"), { target: { value: "x" } });
    await openPreview();
    expect(load).not.toHaveBeenCalled();
    expect(container.querySelector("[data-memorial-preview]")).toBeNull();
    expect(builderWrapper(container).hidden).toBe(false);
    // The step's own AutosaveIndicator is not part of this fake step;
    // the host adds no second message of its own for a failed save.
    expect(screen.queryByText(UNAVAILABLE)).toBeNull();
  });

  it("aria-busy while loading", async () => {
    let release: (value: HostResult) => void = () => {};
    renderHost({ load: () => new Promise<HostResult>((resolve) => (release = resolve)) });
    await openPreview();
    expect(screen.getByRole("button", { name: OPEN }).getAttribute("aria-busy")).toBe("true");
    await act(async () => release({ status: "unavailable" }));
    expect(screen.getByRole("button", { name: OPEN }).getAttribute("aria-busy")).toBe("false");
  });

  it("ready → the real Memorial full screen, the Builder hidden (not unmounted)", async () => {
    const { container } = renderHost({});
    fireEvent.change(screen.getByLabelText("champ"), { target: { value: "garde-moi" } });
    await openPreview();

    const preview = container.querySelector("[data-memorial-preview]") as HTMLElement;
    expect(preview).toBeTruthy();
    expect(preview.tagName).toBe("MAIN");
    expect(preview.querySelectorAll("[data-memorial-section]").length).toBe(5);
    // M3 — the Preview is the one host of the Offrandes: drawn, with the
    // simulated-response notice.
    const offerings = preview.querySelector('[data-memorial-section="symbolicOfferings"]') as HTMLElement;
    expect(offerings.querySelector("[data-offerings-preview] [role=note]")?.textContent).toMatch(/simulée/);
    expect(preview.querySelector(`img[src="${FIXTURE_READ_URL}"]`)).toBeTruthy();

    expect(builderWrapper(container).hidden).toBe(true);
    expect(mounts).toBe(1);
    expect((screen.getByLabelText("champ", { selector: "input" }) as HTMLInputElement).value).toBe("garde-moi");
  });

  it("only the Memorial's own <h1> is exposed while the Builder is hidden", async () => {
    const { container } = renderHost({});
    await openPreview();
    const exposed = Array.from(container.querySelectorAll("h1")).filter((h) => h.closest("[hidden]") === null);
    expect(exposed.map((h) => h.textContent)).toEqual([FIXTURE_DISPLAY_NAME]);
  });

  it("focus moves to « Revenir à la création », at the top of the page", async () => {
    renderHost({});
    await openPreview();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: BACK }));
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
  });
});

describe("loading — the keepsake album, for exactly as long as the real work lasts", () => {
  const LOADING = "Nous préparons votre hommage…";
  const loader = (container: HTMLElement) => container.querySelector("[data-preview-loading]");

  it("appears at once on the click, before the autosave drain or the read resolve", async () => {
    let release: (value: HostResult) => void = () => {};
    const { container } = renderHost({ load: () => new Promise<HostResult>((resolve) => (release = resolve)) });
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: OPEN }));
    });
    expect(loader(container)).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe(LOADING);
    await act(async () => release(await readyResult()));
  });

  it("stays while the read is pending, then gives way to the Preview the moment it is ready", async () => {
    let release: (value: HostResult) => void = () => {};
    const { container } = renderHost({ load: () => new Promise<HostResult>((resolve) => (release = resolve)) });
    await openPreview();
    expect(loader(container)).toBeTruthy();
    expect(container.querySelector("[data-memorial-preview]")).toBeNull();
    await act(async () => release(await readyResult()));
    expect(loader(container)).toBeNull();
    expect(container.querySelector("[data-memorial-preview]")).toBeTruthy();
  });

  it("a fast answer is never held back — no minimum duration", async () => {
    const { container } = renderHost({});
    await openPreview();
    expect(loader(container)).toBeNull();
    expect(container.querySelector("[data-memorial-preview]")).toBeTruthy();
  });

  it("repeated clicks while loading start a single attempt", async () => {
    let release: (value: HostResult) => void = () => {};
    const { load } = renderHost({ load: () => new Promise<HostResult>((resolve) => (release = resolve)) });
    await openPreview();
    await openPreview();
    await openPreview();
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => release(await readyResult()));
  });

  it("an unavailable Preview removes the album, shows the message, and permits another attempt", async () => {
    let answer: HostResult = { status: "unavailable" };
    const { container, load } = renderHost({ load: async () => answer });
    await openPreview();
    expect(loader(container)).toBeNull();
    expect(screen.getByRole("alert").textContent).toBe(UNAVAILABLE);

    answer = await readyResult();
    await openPreview();
    expect(load).toHaveBeenCalledTimes(2);
    expect(container.querySelector("[data-memorial-preview]")).toBeTruthy();
  });

  it("a failed autosave drain removes the album and keeps the Builder", async () => {
    const { container } = renderHost({ persist: () => Promise.reject(new Error("offline")) });
    fireEvent.change(screen.getByLabelText("champ"), { target: { value: "x" } });
    await openPreview();
    expect(loader(container)).toBeNull();
    expect(builderWrapper(container).hidden).toBe(false);
  });

  it.each([
    ["en", "We are preparing your tribute…"],
    ["es", "Estamos preparando su homenaje…"],
  ] as const)("speaks the Builder's language (%s)", async (language, text) => {
    let release: (value: HostResult) => void = () => {};
    render(
      <BuilderPreviewHost
        available
        language={language}
        loadPreview={() => new Promise<HostResult>((resolve) => (release = resolve))}
      >
        <Step persist={okPersist} />
      </BuilderPreviewHost>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: language === "en" ? "View preview" : "Ver vista previa" }));
    });
    expect(screen.getByRole("status").textContent).toBe(text);
    await act(async () => release({ status: "unavailable" }));
  });

  it("uses pure CSS and honours prefers-reduced-motion", () => {
    const css = readFileSync(path.resolve(import.meta.dirname, "PreviewLoading.module.css"), "utf8");
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toMatch(/\.veil,\s*\.cover,\s*\.leaf\s*\{\s*animation: none;/);
    const tsx = readFileSync(path.resolve(import.meta.dirname, "PreviewLoading.tsx"), "utf8");
    expect(tsx).not.toMatch(/from "(framer-motion|motion|lottie[^"]*|gsap)"/);
    expect(tsx).not.toMatch(/setTimeout|setInterval/);
  });
});

describe("unavailable — never a false or empty Memorial", () => {
  it.each<[string, () => Promise<HostResult>]>([
    ["unavailable", () => Promise.resolve({ status: "unavailable" })],
    ["locked", () => Promise.resolve({ status: "locked" })],
    ["a refused/failed action", () => Promise.reject(new Error("Preview refused."))],
  ])("%s → stays in the Builder with preview.unavailable", async (_label, load) => {
    const { container } = renderHost({ load });
    await openPreview();
    expect(container.querySelector("[data-memorial-preview]")).toBeNull();
    expect(builderWrapper(container).hidden).toBe(false);
    expect(screen.getByRole("alert").textContent).toBe(UNAVAILABLE);
  });

  it("the alert clears on the next attempt", async () => {
    let answer: HostResult = { status: "unavailable" };
    renderHost({ load: async () => answer });
    await openPreview();
    expect(screen.queryByText(UNAVAILABLE)).toBeTruthy();
    answer = await readyResult();
    await openPreview();
    expect(screen.queryByText(UNAVAILABLE)).toBeNull();
  });
});

describe("return — same screen, same state, same place", () => {
  it("« Revenir à la création » restores the Builder exactly, scroll and focus included", async () => {
    const { container } = renderHost({});
    fireEvent.change(screen.getByLabelText("champ"), { target: { value: "garde-moi" } });
    await openPreview();
    fireEvent.click(screen.getByRole("button", { name: BACK }));

    expect(container.querySelector("[data-memorial-preview]")).toBeNull();
    expect(builderWrapper(container).hidden).toBe(false);
    expect(mounts).toBe(1);
    expect((screen.getByLabelText("champ") as HTMLInputElement).value).toBe("garde-moi");
    expect(scrollTo).toHaveBeenLastCalledWith(0, 420);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: OPEN }));
  });

  it("Escape closes the Preview", async () => {
    const { container } = renderHost({});
    await openPreview();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(container.querySelector("[data-memorial-preview]")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: OPEN }));
  });

  it("re-opening flushes and reads again — a fresh assembly (and signed URL) every time", async () => {
    const { load } = renderHost({});
    await openPreview();
    fireEvent.click(screen.getByRole("button", { name: BACK }));
    fireEvent.change(screen.getByLabelText("champ"), { target: { value: "modifié" } });
    await openPreview();
    expect(load).toHaveBeenCalledTimes(2);
    expect(events.filter((e) => e === "load")).toHaveLength(2);
    expect(events[events.length - 2]).toBe(`persist:${JSON.stringify({ hero: { displayName: "modifié" } })}`);
    await waitFor(() => expect(screen.getByRole("button", { name: BACK })).toBeTruthy());
  });
});

describe("correction Light / Dark — « Changer l'ambiance » in the Preview", () => {
  const CHANGE = "Changer l'ambiance";
  const journey = { snapshot: resolveJourney(fullAnnouncement()), builderPath: "/builder/m-1", skinVariant: "light" as const };

  function RevealScreen() {
    return <h1>Écran T08</h1>;
  }

  beforeEach(() => routerPush.mockClear());

  it("a discreet link in the Preview's bar opens T08 for revision", async () => {
    render(
      <BuilderPreviewHost available language="fr" loadPreview={readyResult} journey={journey}>
        <Step persist={okPersist} />
      </BuilderPreviewHost>,
    );
    await openPreview();
    fireEvent.click(screen.getByRole("button", { name: CHANGE }));
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/builder/m-1?etape=reveal&rubrique=person"));
  });

  it("the Preview closes once the route brings T08 — never left covering it", async () => {
    const view = render(
      <BuilderPreviewHost available language="fr" loadPreview={readyResult} journey={journey}>
        <Step persist={okPersist} />
      </BuilderPreviewHost>,
    );
    await openPreview();
    expect(builderWrapper(view.container).hidden).toBe(true);

    view.rerender(
      <BuilderPreviewHost available={false} language="fr" loadPreview={readyResult} journey={journey}>
        <RevealScreen />
      </BuilderPreviewHost>,
    );
    expect(builderWrapper(view.container).hidden).toBe(false);
    expect(screen.getByRole("heading", { name: "Écran T08" })).toBeTruthy();
    expect(view.container.querySelector("[data-memorial-preview]")).toBeNull();
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
  });

  it("without a journey there is no link (and no navigation)", async () => {
    renderHost({});
    await openPreview();
    expect(screen.getByRole("button", { name: BACK })).toBeTruthy();
    expect(screen.queryByRole("button", { name: CHANGE })).toBeNull();
  });
});

describe("never a navigation, never a second rendering system", () => {
  const CODE = ["BuilderPreviewHost.tsx", "PreviewEntry.tsx"]
    .map((file) => readFileSync(path.resolve(import.meta.dirname, file), "utf8"))
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  it("no router, no refresh, no navigation", () => {
    expect(CODE).not.toMatch(/next\/navigation|useRouter|router\.|refresh\(|location\./);
  });

  it("renders only through MemorialAssembly — never the legacy MemorialPreview or demo data", () => {
    expect(CODE).toMatch(/<MemorialAssembly /);
    expect(CODE).not.toMatch(/\bMemorialPreview\b|demo-memorials|qg-runtime-demo|BuilderPreviewLayout/);
  });
});
