// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { VideoHommageItem } from "@/lib/memorial/video/video-hommage";

vi.mock("next/font/google", () => ({
  Cormorant_Garamond: () => ({ variable: "--font-heritage-hero-serif-mock", className: "" }),
  La_Belle_Aurore: () => ({ variable: "--font-heritage-hero-script-mock", className: "" }),
  EB_Garamond: () => ({ variable: "--font-heritage-ceremony-serif-mock", className: "" }),
  Playfair_Display: () => ({ variable: "--font-heritage-serif-mock", className: "" }),
  Inter: () => ({ variable: "--font-heritage-sans-mock", className: "" }),
}));

const { VideoHommageV1 } = await import("./VideoHommageV1");
const { VIDEO_HOMMAGE_PRESENTATION_VARIANT, VIDEO_MASTERS, VIDEO_MASTERS_INSTALLED, videoMasterSrcSet } = await import("./video-masters");
const { resetStreamSupportForTests } = await import("./use-stream-playback");

const play = vi.fn(() => Promise.resolve());
const pause = vi.fn();
let observerCallback: IntersectionObserverCallback | null = null;
let pausedFlag = true;

beforeEach(() => {
  play.mockClear();
  pause.mockClear();
  pausedFlag = true;
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: function () {
      pausedFlag = false;
      return play();
    },
  });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", {
    configurable: true,
    value: function () {
      pausedFlag = true;
      pause();
    },
  });
  Object.defineProperty(HTMLMediaElement.prototype, "paused", { configurable: true, get: () => pausedFlag });
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        observerCallback = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  observerCallback = null;
});

function video(id: string, title: string | null, durationSeconds: number, extra: Partial<VideoHommageItem> = {}): VideoHommageItem {
  return { id, title, durationSeconds, status: "ready", source: { kind: "local", url: `blob:heritage/${id}` }, ...extra };
}

const three = [video("a", "Son dernier anniversaire", 268), video("b", null, 131), video("c", "Les vacances en famille", 201)];

describe("« Des instants pour se souvenir »", () => {
  it("affiche le titre et le sous-titre officiels", () => {
    render(<VideoHommageV1 items={three} skinVariant="light" language="fr" />);
    expect(screen.getByRole("heading", { level: 2, name: "Des instants pour se souvenir" })).toBeTruthy();
    expect(screen.getByText("Quelques instants précieux à revivre et à partager.")).toBeTruthy();
  });

  it("une seule vidéo : lecteur seul, sans sélecteur", () => {
    const { container } = render(<VideoHommageV1 items={[three[0]!]} skinVariant="light" language="fr" />);
    expect(container.querySelector("[data-video-selectors]")).toBeNull();
    expect(container.querySelector("[data-layout='player-only']")).not.toBeNull();
    expect(container.querySelector("video")).not.toBeNull();
  });

  it.each([2, 3])("%i vidéos : autant de sélecteurs, titres et durées", (count) => {
    render(<VideoHommageV1 items={three.slice(0, count)} skinVariant="dark" language="fr" />);
    const buttons = within(screen.getByRole("list", { name: "Choisir un souvenir" })).getAllByRole("button");
    expect(buttons).toHaveLength(count);
    expect(buttons[0]!.textContent).toContain("Son dernier anniversaire");
    expect(buttons[0]!.textContent).toContain("4:28");
    expect(buttons[1]!.textContent).toContain("Souvenir 2");
    expect(buttons[1]!.getAttribute("aria-label")).toBe("Lire Souvenir 2, 2 min 11 s");
  });

  it("ignore une quatrième vidéo éventuelle", () => {
    render(<VideoHommageV1 items={[...three, video("d", null, 10)]} skinVariant="light" language="fr" />);
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("première vidéo sélectionnée, aucune lecture automatique", () => {
    const { container } = render(<VideoHommageV1 items={three} skinVariant="light" language="fr" />);
    expect(container.querySelector("video")!.getAttribute("src")).toBe("blob:heritage/a");
    expect(screen.getAllByRole("button")[0]!.getAttribute("aria-pressed")).toBe("true");
    expect(play).not.toHaveBeenCalled();
    const element = container.querySelector("video")!;
    expect(element.hasAttribute("autoplay")).toBe(false);
    expect(element.hasAttribute("loop")).toBe(false);
    expect(element.getAttribute("controlslist")).toContain("nodownload");
    // Commande plein écran du lecteur conservée (retour PO).
    expect(element.getAttribute("controlslist")).not.toContain("nofullscreen");
    expect(element.hasAttribute("controls")).toBe(true);
  });

  it("un clic sur un autre souvenir change de vidéo et la lance", () => {
    const { container } = render(<VideoHommageV1 items={three} skinVariant="light" language="fr" />);
    fireEvent.click(screen.getAllByRole("button")[2]!);
    expect(container.querySelector("video")!.getAttribute("src")).toBe("blob:heritage/c");
    expect(screen.getAllByRole("button")[2]!.getAttribute("aria-pressed")).toBe("true");
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("aucun enchaînement à la fin d'une vidéo", () => {
    const { container } = render(<VideoHommageV1 items={three} skinVariant="light" language="fr" />);
    fireEvent.click(screen.getAllByRole("button")[0]!);
    play.mockClear();
    fireEvent(container.querySelector("video")!, new Event("ended"));
    expect(container.querySelector("video")!.getAttribute("src")).toBe("blob:heritage/a");
    expect(play).not.toHaveBeenCalled();
  });

  it("pause quand le lecteur quitte l'écran, sans reprise au retour", () => {
    const { container } = render(<VideoHommageV1 items={three} skinVariant="light" language="fr" />);
    fireEvent.click(screen.getAllByRole("button")[1]!);
    const element = container.querySelector("video")!;
    act(() => observerCallback!([{ intersectionRatio: 0.2, target: element } as unknown as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(pause).toHaveBeenCalledTimes(1);
    play.mockClear();
    act(() => observerCallback!([{ intersectionRatio: 1, target: element } as unknown as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(play).not.toHaveBeenCalled();
  });

  it("pause quand l'onglet est masqué", () => {
    render(<VideoHommageV1 items={three} skinVariant="light" language="fr" />);
    fireEvent.click(screen.getAllByRole("button")[0]!);
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    fireEvent(document, new Event("visibilitychange"));
    expect(pause).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  });

  it("la vidéo affichée retirée : retour à la première", () => {
    const { container, rerender } = render(<VideoHommageV1 items={three} skinVariant="light" language="fr" />);
    fireEvent.click(screen.getAllByRole("button")[2]!);
    rerender(<VideoHommageV1 items={three.slice(0, 2)} skinVariant="light" language="fr" />);
    expect(container.querySelector("video")!.getAttribute("src")).toBe("blob:heritage/a");
  });

  it.each([
    ["preparing", "Vidéo en préparation"],
    ["error", "Cette vidéo ne peut pas être lue pour le moment."],
    ["local-unavailable", "Pour revoir cette vidéo, sélectionnez-la à nouveau sur votre appareil."],
  ] as const)("état %s : message, aucun lecteur", (status, text) => {
    const { container } = render(
      <VideoHommageV1 items={[{ id: "x", title: null, durationSeconds: 60, status }]} skinVariant="light" language="fr" />,
    );
    expect(screen.getByRole("status").textContent).toBe(text);
    expect(container.querySelector("video")).toBeNull();
  });

  it("une vidéo que le navigateur ne lit pas affiche l'erreur", () => {
    const { container } = render(<VideoHommageV1 items={[three[0]!]} skinVariant="light" language="fr" />);
    fireEvent.error(container.querySelector("video")!);
    expect(screen.getByRole("status").textContent).toBe("Cette vidéo ne peut pas être lue pour le moment.");
  });

  it("aucune vidéo : message d'attente", () => {
    render(<VideoHommageV1 items={[]} skinVariant="light" language="fr" />);
    expect(screen.getByRole("status").textContent).toBe("Aucune vidéo pour le moment.");
  });

  it("un flux hébergé n'est pas préchargé ; une vidéo locale charge seulement ses métadonnées", () => {
    // Navigateur à HLS natif (Safari) : l'adresse est posée sur <video>, sans préchargement.
    vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockImplementation((type) => (type === "application/vnd.apple.mpegurl" ? "maybe" : ""));
    resetStreamSupportForTests();
    const stream = video("s", null, 60, { source: { kind: "stream", url: "https://stream.example/s.m3u8", posterUrl: "https://image.example/s.jpg" } });
    const { container, rerender } = render(<VideoHommageV1 items={[stream]} skinVariant="light" language="fr" />);
    expect(container.querySelector("video")!.getAttribute("preload")).toBe("none");
    expect(container.querySelector("video")!.getAttribute("poster")).toBe("https://image.example/s.jpg");
    rerender(<VideoHommageV1 items={[three[0]!]} skinVariant="light" language="fr" />);
    expect(container.querySelector("video")!.getAttribute("preload")).toBe("metadata");
    vi.restoreAllMocks();
    resetStreamSupportForTests();
  });

  it.each(["light", "dark"] as const)(
    "Master Light universel — ambiance %s du mémorial : Masters Light, AVIF puis WebP, différés, adresses à empreinte",
    (memorialVariant) => {
      expect(VIDEO_MASTERS_INSTALLED).toBe(true);
      expect(VIDEO_HOMMAGE_PRESENTATION_VARIANT).toBe("light");
      const { container } = render(<VideoHommageV1 items={three} skinVariant={memorialVariant} language="fr" />);
      const section = container.querySelector("[data-video-hommage]")!;
      // Présentation Light de la rubrique ; l'ambiance du mémorial reste exposée, non modifiée.
      expect(section.getAttribute("data-variant")).toBe("light");
      expect(section.getAttribute("data-memorial-variant")).toBe(memorialVariant);
      expect(section.getAttribute("data-masters")).toBe("installed");
      // Textes et commandes aux couleurs Light : la portée de la rubrique est Light.
      expect(container.querySelector("[data-heritage-skin-variant='light']")).not.toBeNull();
      expect(container.querySelector("[data-heritage-skin-variant='dark']")).toBeNull();

      const masters = Array.from(container.querySelectorAll("img[data-video-master]"));
      expect(masters.map((m) => m.getAttribute("data-video-master"))).toEqual(["mobile-light", "desktop-light"]);
      for (const img of masters) {
        const [layout] = img.getAttribute("data-video-master")!.split("-") as ["mobile" | "desktop"];
        const spec = VIDEO_MASTERS[layout].light;
        expect(img.getAttribute("loading")).toBe("lazy");
        expect(img.getAttribute("alt")).toBe("");
        expect(img.getAttribute("width")).toBe(String(spec.width));
        expect(img.getAttribute("height")).toBe(String(spec.height));
        expect(img.getAttribute("src")).toBe(spec.webp.at(-1)!.src);
        expect(img.getAttribute("srcset")).toBe(videoMasterSrcSet(spec.webp));
        const avif = img.closest("picture")!.querySelector("source")!;
        expect(avif.getAttribute("type")).toBe("image/avif");
        expect(avif.getAttribute("srcset")).toBe(videoMasterSrcSet(spec.avif));
        expect(avif.getAttribute("sizes")).toBe(img.getAttribute("sizes"));
      }
      // Aucune ressource Dark demandée, quelle que soit l'ambiance.
      expect(container.innerHTML).not.toContain("-dark-");
      expect(container.innerHTML).toMatch(/\/assets\/video-hommage\/v1\/[0-9a-f]{64}-video-/);
    },
  );

  it("changer l'ambiance du mémorial ne change pas le décor de la rubrique", () => {
    const decor = () =>
      Array.from(container.querySelectorAll("picture img, picture source")).map(
        (el) => `${el.getAttribute("src") ?? ""} ${el.getAttribute("srcset") ?? ""}`,
      );
    const { container, rerender } = render(<VideoHommageV1 items={three} skinVariant="light" language="fr" />);
    const before = decor();
    expect(before).toHaveLength(4);
    rerender(<VideoHommageV1 items={three} skinVariant="dark" language="fr" />);
    expect(decor()).toEqual(before);
    expect(container.querySelector("[data-video-hommage]")!.getAttribute("data-memorial-variant")).toBe("dark");
    expect(container.querySelector("[data-video-hommage]")!.getAttribute("data-variant")).toBe("light");
  });

  it("les Masters Dark restent installés et déclarés", () => {
    for (const layout of ["desktop", "mobile"] as const) {
      expect(VIDEO_MASTERS[layout].dark.avif).toHaveLength(2);
      expect(VIDEO_MASTERS[layout].dark.source.file).toMatch(/_Dark_MASTER\.png$/);
    }
  });

  it("titre de niveau 1 sur une page dédiée, textes traduits", () => {
    render(<VideoHommageV1 items={three} skinVariant="light" language="en" headingLevel="page" />);
    expect(screen.getByRole("heading", { level: 1, name: "Moments to remember" })).toBeTruthy();
    expect(screen.getAllByRole("button")[1]!.textContent).toContain("Memory 2");
  });
});
