import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
import { readFileSync } from "node:fs";
import path from "node:path";
import { isValidElement, type ReactElement } from "react";

/**
 * QG 016 / M2 — `/hommage/[slug]`. Like the other route tests of this
 * repository, the async Server Component is called directly (Vitest runs
 * in the "node" environment). The loader has its own end-to-end tests
 * (lib/memorial/public/load-public-memorial.test.ts); this file proves the
 * ROUTE: request-time rendering, the service-role client, one neutral 404
 * for every non-ready outcome, the existing MemorialAssembly with no
 * Builder chrome, and noindex.
 */

const { notFound } = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("next/navigation", () => ({ notFound }));

const { connection } = vi.hoisted(() => ({ connection: vi.fn(async () => undefined) }));
vi.mock("next/server", () => ({ connection }));

const { createServiceRoleSupabaseClient } = vi.hoisted(() => ({
  createServiceRoleSupabaseClient: vi.fn(() => ({ fake: "service-role-client" })),
}));
vi.mock("@/lib/supabase/service-role-client", () => ({ createServiceRoleSupabaseClient }));

const { loadPublicMemorial } = vi.hoisted(() => ({ loadPublicMemorial: vi.fn() }));
vi.mock("@/lib/memorial/public/load-public-memorial", () => ({ loadPublicMemorial }));

// The real renderers load next/font at import time, which only works under Next's compiler;
// the route test checks WHICH component is mounted and with WHAT, as app/admin/atelier/preview does.
const { MemorialAssembly } = vi.hoisted(() => ({ MemorialAssembly: function MemorialAssembly() { return null; } }));
vi.mock("@/components/memorial/assembly/MemorialAssembly", () => ({ MemorialAssembly }));

// QG 016 — Offrandes symboliques : the public host and the page's Server Action.
const { PublicOfferingsProvider } = vi.hoisted(() => ({
  PublicOfferingsProvider: function PublicOfferingsProvider() { return null; },
}));
vi.mock("@/components/memorial/symbolic-offerings/v1/offerings-public", () => ({ PublicOfferingsProvider }));
const { PublicContributionsProvider, loadPublicContributionsInitial } = vi.hoisted(() => ({
  PublicContributionsProvider: function PublicContributionsProvider() { return null; },
  loadPublicContributionsInitial: vi.fn(),
}));
vi.mock("@/components/memorial/contributions/contributions-host", () => ({ PublicContributionsProvider }));
vi.mock("@/lib/memorial/contributions/visitor-contributions", () => ({ loadPublicContributionsInitial }));
vi.mock("@/lib/memorial/contributions/server-contributions", () => ({ createVisitorContributionDeps: () => ({ fake: "visitor-deps" }) }));
const { loadContributions, renewContributionPhotos, openContributionWindow, depositContributionText, beginContributionPhoto, completeContributionPhoto } = vi.hoisted(() => ({
  loadContributions: vi.fn(),
  renewContributionPhotos: vi.fn(),
  openContributionWindow: vi.fn(),
  depositContributionText: vi.fn(),
  beginContributionPhoto: vi.fn(),
  completeContributionPhoto: vi.fn(),
}));
vi.mock("./contribution-actions", () => ({ loadContributions, renewContributionPhotos, openContributionWindow, depositContributionText, beginContributionPhoto, completeContributionPhoto }));
// M8-E6-F — le verrou de publication : fermé en réalité ; chaque test choisit son état.
const readiness = vi.hoisted(() => ({ CONTRIBUTIONS_DEPOSIT_PUBLIC_READY: false }));
vi.mock("@/config/contributions-deposit-readiness", () => readiness);
const { depositSymbolicOffering, signSymbolicOfferingAction } = vi.hoisted(() => ({
  depositSymbolicOffering: vi.fn(),
  signSymbolicOfferingAction: vi.fn(),
}));
vi.mock("./actions", () => ({ depositSymbolicOffering, signSymbolicOfferingAction }));

const { loadPublicVideoPlayback } = vi.hoisted(() => ({ loadPublicVideoPlayback: vi.fn(async () => ({})) }));
vi.mock("@/lib/memorial/video/hosting/public-video-playback", () => ({ loadPublicVideoPlayback }));
const { default: PublicMemorialPage, metadata } = await import("./page");

const ASSEMBLED = { status: "assembled", language: "fr", skinVariant: "dark", sections: [], archivedSections: [], failures: [] };

function call(slug: string) {
  return PublicMemorialPage({ params: Promise.resolve({ slug }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  readiness.CONTRIBUTIONS_DEPOSIT_PUBLIC_READY = true;
});

describe("/hommage/[slug]", () => {
  it("renders the published memorial through the existing MemorialAssembly, with the service-role loader", async () => {
    loadPublicMemorial.mockResolvedValue({ status: "ready", assembled: ASSEMBLED });
    const element = (await call("95bd2601eac8")) as ReactElement<{ lang: string; children: ReactElement }>;
    expect(connection).toHaveBeenCalledTimes(1);
    expect(loadPublicMemorial).toHaveBeenCalledWith("95bd2601eac8", { client: { fake: "service-role-client" } });
    expect(isValidElement(element)).toBe(true);
    expect(element.type).toBe("main");
    expect(element.props.lang).toBe("fr");
    const host = element.props.children as ReactElement<{ slug: string; deposit: unknown; children: ReactElement }>;
    expect(host.type).toBe(PublicOfferingsProvider);
    // M8-E3 : l'hôte public des Contributions, entre les Offrandes et l'assemblage.
    const contributions = host.props.children as ReactElement<{ initial: unknown; children: ReactElement }>;
    expect(contributions.type).toBe(PublicContributionsProvider);
    // Aucune rubrique Contributions dans cette copie : rien n'est lu, l'hôte reçoit null.
    expect(contributions.props.initial).toBeNull();
    expect(loadPublicContributionsInitial).not.toHaveBeenCalled();
    const child = contributions.props.children;
    expect(child.type).toBe(MemorialAssembly);
    expect((child.props as { assembled: unknown }).assembled).toBe(ASSEMBLED);
  });

  describe("VID-08 — « Des instants pour se souvenir » on the public page", () => {
    const videoSection = { sectionId: "video", rendererKey: "VideoHommageV1Section", props: { skinVariant: "dark", language: "fr", items: [{ id: "v-a", title: "Mariage", durationSeconds: 40 }, { id: "v-b", title: null, durationSeconds: 10 }] } };
    const withVideo = { ...ASSEMBLED, sections: [{ sectionId: "testimonials", rendererKey: "ContributionsV1Section", props: {} }, videoSection] };
    type Assembled = { sections: { sectionId: string; props: Record<string, unknown> }[] };
    type Node = ReactElement<{ children: Node; assembled: Assembled }>;
    // <main> → Offrandes → Contributions → MemorialAssembly
    const assembledOf = (element: ReactElement) => (element as Node).props.children.props.children.props.children.props.assembled;
    const signed = { hlsUrl: "https://stream.mux.com/pb.m3u8?token=t", posterUrl: "https://image.mux.com/pb/thumbnail.webp?token=t", mp4Url: null, expiresAt: "2026-11-25T14:00:00.000Z", durationSeconds: 39.9 };

    it("no video rubrique in the published copy: nothing is read", async () => {
      loadPublicMemorial.mockResolvedValue({ status: "ready", assembled: ASSEMBLED });
      await call("slug");
      expect(loadPublicVideoPlayback).not.toHaveBeenCalled();
    });

    it("the server signs the visit's videos; the rubrique receives only its own, after the Contributions", async () => {
      loadPublicMemorial.mockResolvedValue({ status: "ready", assembled: withVideo });
      loadPublicVideoPlayback.mockResolvedValueOnce({ "v-a": signed, "v-other": signed });
      const assembled = assembledOf(await call("slug"));
      expect(loadPublicVideoPlayback).toHaveBeenCalledWith({ slug: "slug", client: { fake: "service-role-client" } });
      expect(assembled.sections.map((s) => s.sectionId)).toEqual(["testimonials", "video"]);
      expect(assembled.sections[1]!.props.publicPlayback).toEqual({ "v-a": signed });
    });

    it("free offer, unconfigured hosting, nothing ready or a read error (empty map): the rubrique is not drawn", async () => {
      loadPublicMemorial.mockResolvedValue({ status: "ready", assembled: withVideo });
      loadPublicVideoPlayback.mockResolvedValueOnce({});
      expect(assembledOf(await call("slug")).sections.map((s) => s.sectionId)).toEqual(["testimonials"]);
    });
  });

  it("M8-E3 — a copy carrying the rubrique reads the visit's real contributions for the public host", async () => {
    const assembled = { ...ASSEMBLED, sections: [...((ASSEMBLED as { sections?: unknown[] }).sections ?? []), { sectionId: "testimonials", rendererKey: "ContributionsV1Section", props: {} }] };
    loadPublicMemorial.mockResolvedValue({ status: "ready", assembled });
    const initial = { categories: { condolences: true, stories: true, photos: true }, total: 0, items: [], complete: true, nextCursor: null };
    loadPublicContributionsInitial.mockResolvedValueOnce(initial);
    const element = (await call("95bd2601eac8")) as ReactElement<{ children: ReactElement<{ children: ReactElement<{ initial: unknown }> }> }>;
    expect(loadPublicContributionsInitial).toHaveBeenCalledWith({ fake: "visitor-deps" }, "95bd2601eac8");
    expect(element.props.children.props.children.props.initial).toBe(initial);
    // Les Server Actions de pagination et de renouvellement sont liées au slug validé.
    const host = element.props.children.props.children.props as unknown as { loadMore: (c: string) => unknown; renewPhotos: (ids: string[]) => unknown };
    host.loadMore("cursor-1");
    host.renewPhotos(["id-1"]);
    expect(loadContributions).toHaveBeenCalledWith("95bd2601eac8", "cursor-1");
    expect(renewContributionPhotos).toHaveBeenCalledWith("95bd2601eac8", ["id-1"]);
  });

  it("M8-E6-F — verrou fermé : la rubrique n'est ni lue ni dessinée, et aucun dépôt n'est transmis", async () => {
    readiness.CONTRIBUTIONS_DEPOSIT_PUBLIC_READY = false;
    const assembled = { ...ASSEMBLED, sections: [{ sectionId: "testimonials", rendererKey: "ContributionsV1Section", props: {} }] };
    loadPublicMemorial.mockResolvedValue({ status: "ready", assembled });
    const element = (await call("95bd2601eac8")) as ReactElement<{ children: ReactElement<{ children: ReactElement<{ initial: unknown; deposit: unknown }> }> }>;
    expect(loadPublicContributionsInitial).not.toHaveBeenCalled();
    expect(element.props.children.props.children.props.initial).toBeNull();
    expect(element.props.children.props.children.props.deposit).toBeUndefined();
  });

  it("M8-E6-F — verrou ouvert : les quatre actions de dépôt E2 sont transmises, avec le slug validé", async () => {
    const assembled = { ...ASSEMBLED, sections: [{ sectionId: "testimonials", rendererKey: "ContributionsV1Section", props: {} }] };
    loadPublicMemorial.mockResolvedValue({ status: "ready", assembled });
    loadPublicContributionsInitial.mockResolvedValue({ categories: { condolences: true, stories: true, photos: true }, total: 0, items: [], sceneExtras: [], complete: true, nextCursor: null });
    const element = (await call("95bd2601eac8")) as ReactElement<{ children: ReactElement<{ children: ReactElement<{ deposit: { slug: string; actions: Record<string, unknown> } }> }> }>;
    expect(element.props.children.props.children.props.deposit).toEqual({
      slug: "95bd2601eac8",
      actions: { openContributionWindow, depositContributionText, beginContributionPhoto, completeContributionPhoto },
    });
  });

  it("M8-E3 — a failed contributions read never breaks the page nor shows a demonstration", async () => {
    const assembled = { ...ASSEMBLED, sections: [{ sectionId: "testimonials", rendererKey: "ContributionsV1Section", props: {} }] };
    loadPublicMemorial.mockResolvedValue({ status: "ready", assembled });
    loadPublicContributionsInitial.mockRejectedValueOnce(new Error("db"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const element = (await call("95bd2601eac8")) as ReactElement<{ children: ReactElement<{ children: ReactElement<{ initial: unknown }> }> }>;
    expect(element.props.children.props.children.props.initial).toBeNull();
  });

  it("QG 016 — the public Offrandes host gets the validated slug and the page's own Server Action", async () => {
    loadPublicMemorial.mockResolvedValue({ status: "ready", assembled: ASSEMBLED });
    const element = (await call("95bd2601eac8")) as ReactElement<{ children: ReactElement<{ slug: string; deposit: unknown; sign: unknown }> }>;
    expect(element.props.children.props.slug).toBe("95bd2601eac8");
    expect(element.props.children.props.deposit).toBe(depositSymbolicOffering);
    // Lot 2 — the page's own signing Server Action, and nothing else.
    expect(element.props.children.props.sign).toBe(signSymbolicOfferingAction);
  });

  it("renders at request time: connection() runs before any read (no prerender, no cached signed URL)", async () => {
    const order: string[] = [];
    connection.mockImplementationOnce(async () => {
      order.push("connection");
    });
    loadPublicMemorial.mockImplementationOnce(async () => {
      order.push("load");
      return { status: "ready", assembled: ASSEMBLED };
    });
    await call("95bd2601eac8");
    expect(order).toEqual(["connection", "load"]);
  });

  it("every non-ready outcome is the same neutral notFound()", async () => {
    loadPublicMemorial.mockResolvedValue({ status: "unavailable" });
    for (const slug of ["95bd2601eac8", "ffffffffffff", "jeanne-test-s1"]) {
      await expect(call(slug)).rejects.toThrow("NEXT_NOT_FOUND");
    }
    expect(notFound).toHaveBeenCalledTimes(3);
  });

  it("is not indexed (first TEST version): noindex, nofollow, nocache", () => {
    expect(metadata.robots).toMatchObject({ index: false, follow: false, nocache: true });
    expect(metadata.title).toBe("Hommage — HERITAGE");
  });

  it("has no Builder chrome, no editor link, no client-side Supabase and no proxy session", () => {
    const source = readFileSync(path.join(import.meta.dirname, "page.tsx"), "utf8");
    const imports = source.split("\n").filter((line) => line.startsWith("import "));
    expect(imports.join("\n")).not.toMatch(/components\/builder|BuilderShell|GuidedFlowPause|browser-client|server-client|heritage-session/);
    expect(source).not.toMatch(/href=["'`]\/builder/);
    expect(source).not.toMatch(/"use client"/);
    const proxy = readFileSync(path.join(import.meta.dirname, "..", "..", "..", "proxy.ts"), "utf8");
    expect(proxy).not.toContain("/hommage");
  });

  it("cartes mémorielles V2.1: the public frame clips but never becomes a scroll container", () => {
    // `overflow: hidden | auto | scroll` (either axis) makes `.page` a scroll
    // container that never scrolls: the cards' `position: sticky` then never
    // pins, and the validated covering effect degrades. `clip` does not.
    const css = readFileSync(path.join(import.meta.dirname, "page.module.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const declarations = [...css.matchAll(/(overflow(?:-x|-y)?)\s*:\s*([^;}]+)/g)].map(([, property, value]) => [property, value.trim()]);
    expect(declarations).toEqual([["overflow-x", "clip"]]);
    const frame = css.match(/\.page\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(frame).toMatch(/overflow-x\s*:\s*clip\s*;/);
  });
});
