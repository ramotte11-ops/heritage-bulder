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
    { editorialContext: "announcement", skin: "intemporel", skinVariant: "light", language: "fr", content: fullAnnouncement() },
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
    expect(preview.querySelectorAll("[data-memorial-section]").length).toBe(4);
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
