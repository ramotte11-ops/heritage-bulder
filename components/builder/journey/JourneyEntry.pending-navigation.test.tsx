// @vitest-environment jsdom
/**
 * Mission 04-D — « Un instant… » lasts until the destination is ready.
 *
 * SIMULATED navigation (jsdom): `router.push` / `router.replace` behave
 * like the App Router — the navigation is a React transition that
 * suspends until the server payload arrives (`arrive()`), the current
 * tree staying on screen meanwhile. The draining of the screen's
 * autosave is controlled separately (`releaseDrain()` / `failDrain()`),
 * so that the end of the drain is never mistaken for the end of the
 * navigation.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Suspense, startTransition, use, useEffect, useState, type ReactNode } from "react";
import type { MemorialContent } from "@/types/memorial";
import { resolveJourney } from "@/lib/builder/guided-flow/journey";
import { commitA00 } from "@/lib/builder/guided-flow/announcement-choice-step";
import { fullAnnouncement, throughA02, throughA03 } from "@/lib/memorial/assembly/test-fixtures";
import { createPreviewFlushRegistry, PreviewFlushRegistryContext } from "@/lib/builder/preview-flush-registry";

const route: { navigate: ((href: string) => void) | null } = { navigate: null };
const routerPush = vi.fn((href: string) => route.navigate?.(href));
const routerReplace = vi.fn((href: string) => route.navigate?.(href));
const routerRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: routerReplace, refresh: routerRefresh }),
}));

vi.mock("next/font/google", () => ({
  Allura: () => ({ variable: "", className: "" }),
  Playfair_Display: () => ({ variable: "", className: "" }),
  Inter: () => ({ variable: "", className: "" }),
  Cormorant_Garamond: () => ({ variable: "", className: "" }),
  La_Belle_Aurore: () => ({ variable: "", className: "" }),
  EB_Garamond: () => ({ variable: "", className: "" }),
}));

const { BuilderScreenNav } = await import("./BuilderScreenNav");
const { ChangeAmbianceLink, FullReviewEntry } = await import("./JourneyEntry");
const { RouteJourneyProvider } = await import("./journey-context");
const { GuestJourneyProvider } = await import("@/components/builder/guest/GuestJourneyProvider");

afterEach(() => {
  cleanup();
  routerPush.mockClear();
  routerReplace.mockClear();
  routerRefresh.mockClear();
  route.navigate = null;
  document.body.style.overflow = "";
});

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Suspends while the server payload has not arrived. */
function Destination({ payload, href }: { payload: Promise<void>; href: string }) {
  use(payload);
  return <p data-destination={href}>NEW SCREEN</p>;
}

/** The App Router stand-in. The Builder chrome stays mounted on arrival
 * (the strictest case: nothing but the guard itself may close the panel),
 * outside the boundary the destination suspends in — like the real
 * router, it keeps answering urgent interactions meanwhile (verified in
 * Chromium on Next 16.4.6). */
function FakeRoute({ payload, children }: { payload: Promise<void>; children: ReactNode }) {
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => {
    route.navigate = (next) => startTransition(() => setHref(next));
  }, []);
  return (
    <>
      <Suspense fallback={<p>ROUTE FALLBACK</p>}>
        {href === null ? <p data-old-screen="">OLD SCREEN</p> : <Destination payload={payload} href={href} />}
      </Suspense>
      {children}
    </>
  );
}

interface Harness {
  releaseDrain: () => Promise<void>;
  failDrain: () => Promise<void>;
  arrive: () => Promise<void>;
}

function mount(
  ui: ReactNode,
  {
    snapshot,
    language = "fr",
    returnToPreview = false,
  }: {
    snapshot: ReturnType<typeof resolveJourney>;
    language?: "fr" | "en" | "es";
    returnToPreview?: boolean;
  },
): Harness {
  const payload = deferred();
  let drain = deferred();
  const registry = createPreviewFlushRegistry();
  registry.register(() => drain.promise);
  render(
    <PreviewFlushRegistryContext.Provider value={registry}>
      <RouteJourneyProvider
        language={language}
        snapshot={snapshot}
        skinVariant="light"
        builderPath="/builder/m-1"
        returnToPreview={returnToPreview}
      >
        <FakeRoute payload={payload.promise}>{ui}</FakeRoute>
      </RouteJourneyProvider>
    </PreviewFlushRegistryContext.Provider>,
  );
  return {
    async releaseDrain() {
      await act(async () => drain.resolve());
    },
    async failDrain() {
      const failing = drain;
      drain = deferred(); // a later attempt gets a fresh drain
      await act(async () => failing.reject(new Error("save failed")));
    },
    async arrive() {
      await act(async () => payload.resolve());
    },
  };
}

const PARTIAL: MemorialContent = throughA02();
const DONE: MemorialContent = fullAnnouncement();
function withA00No(content: MemorialContent): MemorialContent {
  const committed = commitA00(content, "no");
  if (!committed.ok) throw new Error("fixture");
  return committed.content;
}

const entryButton = (name: RegExp = /^Mon parcours$/) => screen.getByRole("button", { name });
const openPanel = () => fireEvent.click(entryButton());
const openBlock = (title: string) =>
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) }));
const dialog = () => screen.queryByRole("dialog");
const navigations = () => routerPush.mock.calls.length + routerReplace.mock.calls.length;

interface Command {
  name: string;
  /** Renders the screen and returns the control the family activates. */
  start: () => { harness: Harness; control: () => HTMLElement };
  /** The command lives in « Mon parcours »'s panel (which must close with the new screen). */
  inPanel: boolean;
  url: string;
}

const COMMANDS: Command[] = [
  {
    name: "Revoir",
    inPanel: true,
    url: "/builder/m-1?etape=identity&rubrique=person",
    start() {
      const harness = mount(<BuilderScreenNav />, { snapshot: resolveJourney(PARTIAL) });
      openPanel();
      openBlock("Votre proche");
      return { harness, control: () => screen.getByRole("button", { name: "Revoir — Nom et dates" }) };
    },
  },
  {
    name: "Modifier mon choix",
    inPanel: true,
    url: "/builder/m-1?etape=announcementChoice&rubrique=deathNotice",
    start() {
      const harness = mount(<BuilderScreenNav />, { snapshot: resolveJourney(withA00No(throughA03())) });
      openPanel();
      openBlock("L'annonce de décès");
      return {
        harness,
        control: () => screen.getByRole("button", { name: "Modifier mon choix — L'annonce de décès" }),
      };
    },
  },
  {
    name: "Continuer ici",
    inPanel: true,
    url: "/builder/m-1",
    start() {
      const harness = mount(<BuilderScreenNav />, { snapshot: resolveJourney(PARTIAL, "identity") });
      openPanel();
      openBlock("L'annonce de décès");
      return { harness, control: () => screen.getByRole("button", { name: "Continuer ici" }) };
    },
  },
  {
    name: "Reprendre (panneau)",
    inPanel: true,
    url: "/builder/m-1",
    start() {
      // A revision outside any rubrique review: the panel offers « Reprendre où j'en étais ».
      const harness = mount(<BuilderScreenNav />, { snapshot: resolveJourney(PARTIAL, "identity", null) });
      openPanel();
      return {
        harness,
        control: () => within(screen.getByRole("dialog")).getByRole("button", { name: "Reprendre où j'en étais" }),
      };
    },
  },
  {
    name: "Terminer les modifications",
    inPanel: true,
    url: "/builder/m-1",
    start() {
      const harness = mount(<BuilderScreenNav />, { snapshot: resolveJourney(PARTIAL, null, "person") });
      return { harness, control: () => screen.getByRole("button", { name: "Terminer les modifications" }) };
    },
  },
  {
    name: "Retour à mon parcours (bandeau de révision)",
    inPanel: false,
    url: "/builder/m-1",
    start() {
      const harness = mount(<BuilderScreenNav />, { snapshot: resolveJourney(PARTIAL, "identity") });
      return { harness, control: () => screen.getByRole("button", { name: "Reprendre où j'en étais" }) };
    },
  },
  {
    name: "Retour à l'aperçu",
    inPanel: false,
    url: "/builder/m-1?apercu=1",
    start() {
      const harness = mount(<BuilderScreenNav />, { snapshot: resolveJourney(PARTIAL, "reveal"), returnToPreview: true });
      return { harness, control: () => screen.getByRole("button", { name: "Revenir à l'aperçu sans changer" }) };
    },
  },
  {
    name: "Terminer la relecture",
    inPanel: false,
    url: "/builder/m-1",
    start() {
      const harness = mount(<BuilderScreenNav />, { snapshot: { ...resolveJourney(DONE, "phrase", null), review: true } });
      return { harness, control: () => screen.getByRole("button", { name: "Terminer la relecture" }) };
    },
  },
  {
    name: "Reprendre mon parcours depuis le début",
    inPanel: false,
    url: "/builder/m-1?parcours=revue",
    start() {
      const harness = mount(<FullReviewEntry />, { snapshot: resolveJourney(DONE) });
      return { harness, control: () => screen.getByRole("button", { name: "Reprendre mon parcours depuis le début" }) };
    },
  },
  {
    name: "Changer l'ambiance (référence)",
    inPanel: false,
    url: "/builder/m-1?etape=reveal&rubrique=person&apercu=1",
    start() {
      const harness = mount(<ChangeAmbianceLink />, { snapshot: resolveJourney(PARTIAL) });
      return { harness, control: () => screen.getByRole("button", { name: "Changer l'ambiance" }) };
    },
  },
];

function expectBusy(control: HTMLElement) {
  expect(control.textContent).toBe("Un instant…");
  expect(control.getAttribute("aria-busy")).toBe("true");
  expect(control).toHaveProperty("disabled", true);
  expect(within(control).getByRole("status").textContent).toBe("Un instant…");
}

describe("Mission 04-D — the wait is announced until the destination is ready (simulated navigation)", () => {
  it.each(COMMANDS)("$name: « Un instant… » through the drain AND the pending navigation", async (command) => {
    const { harness, control: find } = command.start();
    // Found once: while busy, a control's accessible name IS « Un instant… ».
    const button = find();
    const control = () => button;
    fireEvent.click(button);

    // 1. Autosave drain in flight.
    expectBusy(button);
    expect(navigations()).toBe(0);

    // 2. Drain over, navigation requested, destination NOT ready yet.
    await harness.releaseDrain();
    expect(navigations()).toBe(1);
    expect([...routerPush.mock.calls, ...routerReplace.mock.calls][0][0]).toBe(command.url);
    expect(screen.getByText("OLD SCREEN")).toBeTruthy();
    expectBusy(control());
    if (command.inPanel) {
      // The panel never lets the old screen reappear without a signal.
      expect(dialog()).not.toBeNull();
      expect(dialog()!.getAttribute("aria-busy")).toBe("true");
    }

    // 3. The destination is ready: one commit brings it, the wait ends.
    await harness.arrive();
    expect(screen.getByText("NEW SCREEN")).toBeTruthy();
    expect(screen.queryByText("OLD SCREEN")).toBeNull();
    expect(screen.queryAllByRole("status")).toEqual([]);
    if (command.inPanel) expect(dialog()).toBeNull();
    expect(navigations()).toBe(1);
  });

  it.each(COMMANDS)("$name: a second activation, or another command, starts no second navigation", async (command) => {
    const { harness, control: find } = command.start();
    const button = find();
    const control = () => button;
    fireEvent.click(control());
    fireEvent.click(control());
    await harness.releaseDrain();
    fireEvent.click(control());
    for (const other of screen.queryAllByRole("button")) fireEvent.click(other);
    await harness.releaseDrain();
    expect(navigations()).toBe(1);
    await harness.arrive();
    expect(navigations()).toBe(1);
  });

  it.each(COMMANDS)("$name: a failed drain navigates nowhere and gives the controls back", async (command) => {
    const { harness, control: find } = command.start();
    const button = find();
    const control = () => button;
    const label = control().textContent;
    fireEvent.click(control());
    await harness.failDrain();

    expect(navigations()).toBe(0);
    expect(control().textContent).toBe(label);
    expect(control()).toHaveProperty("disabled", false);
    expect(control().getAttribute("aria-busy")).toBeNull();
    expect(screen.getByRole("alert").textContent).toMatch(/pas encore enregistrées/);
    if (command.inPanel) expect(dialog()).not.toBeNull();

    // Usable again: a new attempt goes through.
    fireEvent.click(control());
    await harness.releaseDrain();
    expect(navigations()).toBe(1);
    expectBusy(control());
  });
});

describe("Mission 04-D — one move at a time across the journey controls", () => {
  it("while the revision notice's « Reprendre » is in flight, « Revoir » in the panel starts nothing", async () => {
    // Revising within « Votre proche »: the panel opens on that block.
    const harness = mount(<BuilderScreenNav />, { snapshot: resolveJourney(PARTIAL, "identity") });
    const resume = screen.getByRole("button", { name: "Reprendre où j'en étais" });
    fireEvent.click(resume);
    await harness.releaseDrain();
    expect(navigations()).toBe(1);

    openPanel();
    fireEvent.click(screen.getByRole("button", { name: "Revoir — L'ambiance de l'hommage" }));
    await harness.releaseDrain();
    expect(navigations()).toBe(1);
    expectBusy(resume);

    await harness.arrive();
    expect(navigations()).toBe(1);
  });

  it("« Changer l'ambiance » in flight: « Reprendre mon parcours depuis le début » starts nothing", async () => {
    const harness = mount(
      <>
        <ChangeAmbianceLink />
        <FullReviewEntry />
      </>,
      { snapshot: resolveJourney(DONE) },
    );
    const ambiance = screen.getByRole("button", { name: "Changer l'ambiance" });
    fireEvent.click(ambiance);
    fireEvent.click(screen.getByRole("button", { name: "Reprendre mon parcours depuis le début" }));
    await harness.releaseDrain();
    fireEvent.click(screen.getByRole("button", { name: "Reprendre mon parcours depuis le début" }));
    await harness.releaseDrain();
    expect(routerPush).toHaveBeenCalledOnce();
    expect(routerPush).toHaveBeenCalledWith("/builder/m-1?etape=reveal&rubrique=person&apercu=1");
    expectBusy(ambiance);
    await harness.arrive();
    expect(routerPush).toHaveBeenCalledOnce();
  });

  it("once a move has failed, another control can start one", async () => {
    const harness = mount(<BuilderScreenNav />, { snapshot: resolveJourney(PARTIAL, "identity") });
    fireEvent.click(screen.getByRole("button", { name: "Reprendre où j'en étais" }));
    await harness.failDrain();
    openPanel();
    fireEvent.click(screen.getByRole("button", { name: "Revoir — L'ambiance de l'hommage" }));
    await harness.releaseDrain();
    expect(navigations()).toBe(1);
  });
});

describe("Mission 04-D — the panel, the keyboard and the focus", () => {
  function startReview() {
    const harness = mount(<BuilderScreenNav />, { snapshot: resolveJourney(PARTIAL) });
    openPanel();
    openBlock("Votre proche");
    const review = screen.getByRole("button", { name: "Revoir — Nom et dates" });
    return { harness, review };
  }

  it("Escape, the backdrop and « Fermer » do not close the panel while the move is in flight", async () => {
    const { harness, review } = startReview();
    fireEvent.click(review);
    await harness.releaseDrain();

    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(document.querySelector('[role="dialog"]')!.parentElement!);
    const close = within(dialog()!).getByRole("button", { name: "Fermer" });
    expect(close).toHaveProperty("disabled", true);
    fireEvent.click(close);

    expect(dialog()).not.toBeNull();
    expectBusy(screen.getByRole("button", { name: "Revoir — Nom et dates" }));
    await harness.arrive();
    expect(dialog()).toBeNull();
  });

  it("focus stays in the busy panel during the wait, then comes back to « Mon parcours »", async () => {
    const { harness, review } = startReview();
    review.focus();
    fireEvent.click(review);
    await harness.releaseDrain();
    expect(dialog()!.contains(document.activeElement) || document.activeElement === document.body).toBe(true);
    expect(document.activeElement).not.toBe(entryButton());

    await harness.arrive();
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(entryButton());
    expect(entryButton().getAttribute("aria-expanded")).toBe("false");
  });

  it("idle: Escape and « Fermer » still close at once and give focus back (unchanged)", () => {
    mount(<BuilderScreenNav />, { snapshot: resolveJourney(PARTIAL) });
    openPanel();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(entryButton());

    openPanel();
    fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(entryButton());
  });

  it("after a failed drain the panel can be closed again", async () => {
    const { harness, review } = startReview();
    fireEvent.click(review);
    await harness.failDrain();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(entryButton());
  });
});

describe("Mission 04-D — FR / EN / ES", () => {
  it.each([
    ["fr", /^Mon parcours$/, "Votre proche", "Revoir — Nom et dates", "Un instant…"],
    ["en", /^My journey$/, "Your loved one", "Review — Name and dates", "Just a moment…"],
    ["es", /^Mi recorrido$/, "Su ser querido", "Revisar — Nombre y fechas", "Un momento…"],
  ] as const)("%s: the wait is announced in the family's language", async (language, entry, block, review, wait) => {
    const harness = mount(<BuilderScreenNav />, { snapshot: resolveJourney(PARTIAL), language });
    fireEvent.click(entryButton(entry));
    openBlock(block);
    fireEvent.click(screen.getByRole("button", { name: review }));
    await harness.releaseDrain();
    const button = screen.getByRole("button", { name: review });
    expect(button.textContent).toBe(wait);
    expect(within(button).getByRole("status").textContent).toBe(wait);
    expect(dialog()).not.toBeNull();
    await harness.arrive();
    expect(dialog()).toBeNull();
  });
});

describe("Mission 04-D — instant moves keep their behaviour (guest Builder)", () => {
  function mountGuest(snapshot: ReturnType<typeof resolveJourney>) {
    const moves = {
      openScreen: vi.fn(),
      resume: vi.fn(),
      finishReview: vi.fn(),
      startReview: vi.fn(),
      finishStep: vi.fn(),
    };
    render(
      <PreviewFlushRegistryContext.Provider value={createPreviewFlushRegistry()}>
        <GuestJourneyProvider language="fr" snapshot={snapshot} skinVariant="light" returnToPreview={false} moves={moves}>
          <BuilderScreenNav />
        </GuestJourneyProvider>
      </PreviewFlushRegistryContext.Provider>,
    );
    return moves;
  }

  it("« Revoir »: the local move runs and the panel closes as soon as it is done", async () => {
    const moves = mountGuest(resolveJourney(PARTIAL));
    openPanel();
    openBlock("Votre proche");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Revoir — Nom et dates" }));
    });
    expect(moves.openScreen).toHaveBeenCalledOnce();
    expect(moves.openScreen).toHaveBeenCalledWith("identity", false, undefined);
    expect(dialog()).toBeNull();
    expect(screen.queryAllByRole("status")).toEqual([]);
    expect(document.activeElement).toBe(entryButton());
  });

  it("« Reprendre »: a move that ignores the transition still closes the panel right after it", async () => {
    const moves = mountGuest(resolveJourney(PARTIAL, "identity", null));
    openPanel();
    await act(async () => {
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Reprendre où j'en étais" }));
    });
    expect(moves.resume).toHaveBeenCalledOnce();
    expect(dialog()).toBeNull();
    expect(screen.queryAllByRole("status")).toEqual([]);
    expect(document.activeElement).toBe(entryButton());
  });
});
