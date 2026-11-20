import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Lot 3 — « Les contributions reçues » (route). The E5 Server Actions are
 * mocked here: their session and ownership rules are proven by
 * lib/memorial/contributions/family-contributions.test.ts and the SQL
 * harness. What this route adds: the URL claim is honoured only for the
 * family's own tribute, only its id goes to the actions, the view and the
 * language are validated, and nothing is invented when a read fails.
 */
const { loadFamilySpace } = vi.hoisted(() => ({ loadFamilySpace: vi.fn() }));
vi.mock("@/lib/owner/load-family-space", () => ({ loadFamilySpace }));
vi.mock("@/app/auth/actions", () => ({ signOut: vi.fn() }));
vi.mock("@/components/builder/fonts", () => ({ playfairDisplay: { variable: "serif" }, inter: { variable: "sans" } }));
const actions = vi.hoisted(() => ({
  getFamilyContributions: vi.fn(),
  getPendingContributionCounts: vi.fn(),
  getContributionSettings: vi.fn(),
  moderateFamilyContribution: vi.fn(),
  deleteFamilyContribution: vi.fn(),
  updateContributionCategories: vi.fn(),
}));
vi.mock("@/lib/memorial/contributions/family-contribution-actions", () => actions);

const { redirect, notFound } = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("next/navigation", () => ({ redirect, notFound }));

const { default: TributeContributionsPage } = await import("./page");

const OWN = "11111111-1111-4111-8111-111111111111";
const FOREIGN = "99999999-9999-4999-8999-999999999999";

function ready() {
  return {
    status: "ready",
    email: "famille@example.test",
    actor: {},
    publication: { status: "unknown" },
    tributes: [{ id: OWN, displayName: "Jeanne Martin", language: "fr", state: "published", years: null, photo: null, publicSlug: "abc", freeDeadlines: null }],
    repository: {},
  };
}

const STORY = {
  id: "c1000000-0000-4000-8000-000000000001",
  type: "testimonial",
  status: "pending",
  authorName: "Paul <b>Durand</b>",
  content: "Un été à Biarritz <script>alert(1)</script>",
  caption: null,
  createdAt: "2026-11-20T09:15:00.000Z",
  publishedAt: null,
  moderatedAt: null,
  photo: null,
};

async function render(memorialId: string, search: Record<string, string> = {}): Promise<string> {
  const { renderToStaticMarkup } = await import("react-dom/server");
  return renderToStaticMarkup(await TributeContributionsPage({ params: Promise.resolve({ memorialId }), searchParams: Promise.resolve(search) }));
}

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset();
  loadFamilySpace.mockReset().mockResolvedValue(ready());
  actions.getFamilyContributions.mockResolvedValue({ status: "ok", items: [STORY], nextCursor: null });
  actions.getPendingContributionCounts.mockResolvedValue({ status: "ok", counts: [{ memorialId: OWN, pendingStories: 1, pendingPhotos: 0, pendingTotal: 1 }] });
  actions.getContributionSettings.mockResolvedValue({
    status: "ok",
    settings: { features: { condolences: true, stories: true, photos: false }, corrupted: false, firstPublished: true, draftRevision: 7, contributionsDigest: false },
  });
});

describe("TributeContributionsPage — the family's contributions of ONE tribute", () => {
  it("redirects a visitor to /login and calls no action", async () => {
    loadFamilySpace.mockResolvedValue({ status: "visitor" });
    await expect(render(OWN)).rejects.toThrow("REDIRECT:/login");
    expect(actions.getFamilyContributions).not.toHaveBeenCalled();
  });

  it("answers 404 for a tribute that is not the family's — and never asks for its contributions", async () => {
    await expect(render(FOREIGN)).rejects.toThrow("NOT_FOUND");
    for (const fn of Object.values(actions)) expect(fn).not.toHaveBeenCalled();
  });

  it("answers 404 when the family space is empty or unavailable", async () => {
    loadFamilySpace.mockResolvedValue({ status: "none", email: null, isOwner: true, publication: { status: "unknown" } });
    await expect(render(OWN)).rejects.toThrow("NOT_FOUND");
    loadFamilySpace.mockResolvedValue({ status: "error", email: null });
    await expect(render(OWN)).rejects.toThrow("NOT_FOUND");
  });

  it("opens on « À examiner »: only the validated tribute id goes to the actions, never an owner id", async () => {
    const html = await render(OWN);
    expect(actions.getFamilyContributions).toHaveBeenCalledWith({ memorialId: OWN, status: "pending", limit: 20 });
    expect(actions.getPendingContributionCounts).toHaveBeenCalledWith(OWN);
    expect(actions.getContributionSettings).toHaveBeenCalledWith(OWN);
    expect(html).toContain("Les contributions reçues");
    expect(html).toContain("Jeanne Martin");
    expect(html).toMatch(/data-contributions-tab="pending"[^>]*aria-current="page"|aria-current="page"[^>]*data-contributions-tab="pending"/);
    expect(html).toContain('data-pending-total="1"');
  });

  it("visitors' words are TEXT, never HTML", async () => {
    const html = await render(OWN);
    expect(html).toContain("Paul &lt;b&gt;Durand&lt;/b&gt;");
    expect(html).toContain("Un été à Biarritz &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<b>Durand</b>");
  });

  it.each(["published", "hidden", "rejected"] as const)("?vue=%s reads that status", async (vue) => {
    await render(OWN, { vue });
    expect(actions.getFamilyContributions).toHaveBeenCalledWith({ memorialId: OWN, status: vue, limit: 20 });
  });

  it("an unknown ?vue= falls back to « À examiner »", async () => {
    await render(OWN, { vue: "all" });
    expect(actions.getFamilyContributions).toHaveBeenCalledWith({ memorialId: OWN, status: "pending", limit: 20 });
  });

  it("keeps ?langue= on every link (FR / EN / ES)", async () => {
    const html = await render(OWN, { langue: "es" });
    expect(html).toContain("Las contribuciones recibidas");
    expect(html).toContain(`href="/owner/hommages/${OWN}/contributions?langue=es&amp;vue=hidden"`);
    expect(html).toContain(`href="/owner?langue=es&amp;hommage=${OWN}"`);
    expect(await render(OWN, { langue: "en" })).toContain("Contributions received");
  });

  it("a failed list read says so and offers to retry; a failed settings read says so too; nothing invented", async () => {
    actions.getFamilyContributions.mockResolvedValue({ status: "unavailable" });
    actions.getPendingContributionCounts.mockRejectedValue(new Error("down"));
    actions.getContributionSettings.mockResolvedValue({ status: "unavailable" });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const html = await render(OWN);
    log.mockRestore();
    expect(html).toContain("Les contributions n’ont pas pu être chargées pour le moment.");
    expect(html).toContain("Réessayer");
    expect(html).toContain("Les réglages n’ont pas pu être chargés pour le moment.");
    expect(html).not.toContain("data-pending-total");
  });

  it("the settings show the three A15 categories, as read", async () => {
    const html = await render(OWN);
    expect(html).toContain("Ce que vos proches peuvent partager");
    expect(html).toMatch(/checked=""[^>]*data-contribution-category="condolences"|data-contribution-category="condolences"[^>]*checked/);
    expect(html).not.toMatch(/checked=""[^>]*data-contribution-category="photos"/);
    // No Brevo digest is offered: no e-mail is sent yet.
    expect(html).not.toMatch(/récapitulatif|digest|Brevo/i);
  });
});
