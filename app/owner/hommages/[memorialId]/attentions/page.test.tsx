import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadFamilySpace } = vi.hoisted(() => ({ loadFamilySpace: vi.fn() }));
vi.mock("@/lib/owner/load-family-space", () => ({ loadFamilySpace }));
vi.mock("@/app/auth/actions", () => ({ signOut: vi.fn() }));
vi.mock("@/components/builder/fonts", () => ({ playfairDisplay: { variable: "serif" }, inter: { variable: "sans" } }));

const { redirect, notFound } = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("next/navigation", () => ({ redirect, notFound }));

const { default: TributeAttentionsPage } = await import("./page");

const OWN = "11111111-1111-4111-8111-111111111111";
const FOREIGN = "99999999-9999-4999-8999-999999999999";
const countOfferings = vi.fn();
const listOfferings = vi.fn();

function ready(state = "published") {
  return {
    status: "ready",
    email: "rany@example.com",
    actor: {},
    publication: { status: "unknown" },
    tributes: [{ id: OWN, displayName: "Jeanne Martin", language: "fr", state, years: null, photo: null, publicSlug: null, freeDeadlines: null }],
    repository: { listTributeDetails: vi.fn(), countOfferings, listOfferings },
  };
}

async function render(memorialId: string, search: Record<string, string> = {}): Promise<string> {
  const { renderToStaticMarkup } = await import("react-dom/server");
  return renderToStaticMarkup(
    await TributeAttentionsPage({ params: Promise.resolve({ memorialId }), searchParams: Promise.resolve(search) }),
  );
}

beforeEach(() => {
  loadFamilySpace.mockReset();
  countOfferings.mockReset().mockResolvedValue({ coeur: 1, bougie: 1, lys: 0 });
  listOfferings.mockReset().mockResolvedValue({
    offerings: [
      { id: "o2", kind: "bougie", createdAt: "2026-11-12T18:30:00.000Z" },
      { id: "o1", kind: "coeur", createdAt: "2026-11-10T08:00:00.000Z" },
    ],
    hasMore: false,
  });
});

describe("TributeAttentionsPage — the private book of one tribute", () => {
  it("redirects a visitor to /login and reads nothing", async () => {
    loadFamilySpace.mockResolvedValue({ status: "visitor" });
    await expect(render(OWN)).rejects.toThrow("REDIRECT:/login");
    expect(countOfferings).not.toHaveBeenCalled();
  });

  it("answers 404 for a tribute that is not the family's — and never reads its gestures", async () => {
    loadFamilySpace.mockResolvedValue(ready());
    await expect(render(FOREIGN)).rejects.toThrow("NOT_FOUND");
    expect(countOfferings).not.toHaveBeenCalled();
    expect(listOfferings).not.toHaveBeenCalled();
  });

  it("answers 404 when the family space is unavailable or empty", async () => {
    loadFamilySpace.mockResolvedValue({ status: "none", email: null, isOwner: true, publication: { status: "unknown" } });
    await expect(render(OWN)).rejects.toThrow("NOT_FOUND");
    loadFamilySpace.mockResolvedValue({ status: "error", email: null });
    await expect(render(OWN)).rejects.toThrow("NOT_FOUND");
  });

  it("shows the tribute's name, its real totals and every gesture with its date, newest first", async () => {
    loadFamilySpace.mockResolvedValue(ready());

    const html = await render(OWN);

    expect(countOfferings).toHaveBeenCalledWith(OWN);
    expect(listOfferings).toHaveBeenCalledWith(OWN, { offset: 0, limit: 30 });
    expect(html).toContain("Carnet des attentions");
    expect(html).toContain("Jeanne Martin");
    expect(html).toContain("seule votre famille peut le consulter");
    expect(html).toMatch(/data-offering-count="bougie"[^>]*>1</);
    expect(html.indexOf("Une bougie a été allumée.")).toBeLessThan(html.indexOf("Un cœur a été déposé."));
    expect(html).toContain("12 nov. 2026");
    expect(html).toContain(`href="/owner?hommage=${OWN}"`);
    expect(html).not.toContain("data-attentions-older");
  });

  it("pages through older gestures and back", async () => {
    loadFamilySpace.mockResolvedValue(ready());
    listOfferings.mockResolvedValue({ offerings: [{ id: "o9", kind: "lys", createdAt: "2026-10-01T08:00:00.000Z" }], hasMore: true });

    const html = await render(OWN, { page: "2", langue: "en" });

    expect(listOfferings).toHaveBeenCalledWith(OWN, { offset: 30, limit: 30 });
    expect(html).toContain("A flower was left.");
    expect(html).toContain(`href="/owner/hommages/${OWN}/attentions?langue=en"`);
    expect(html).toContain(`href="/owner/hommages/${OWN}/attentions?langue=en&amp;page=3"`);
  });

  it("treats a malformed page number as the first page", async () => {
    loadFamilySpace.mockResolvedValue(ready());
    await render(OWN, { page: "-4; drop" });
    expect(listOfferings).toHaveBeenCalledWith(OWN, { offset: 0, limit: 30 });
  });

  it("says so calmly when nothing was received, or when the read fails", async () => {
    loadFamilySpace.mockResolvedValue(ready("in_preparation"));
    countOfferings.mockResolvedValue({ coeur: 0, bougie: 0, lys: 0 });
    listOfferings.mockResolvedValue({ offerings: [], hasMore: false });
    expect(await render(OWN)).toContain("dès que l’hommage sera publié");

    countOfferings.mockRejectedValue(new Error("boom"));
    const html = await render(OWN);
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("data-offering-count");
  });
});
