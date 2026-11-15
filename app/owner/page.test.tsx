import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const { getHeritageActor } = vi.hoisted(() => ({ getHeritageActor: vi.fn() }));
vi.mock("@/lib/auth/heritage-session", () => ({ getHeritageActor }));

const { createServerSupabaseClient } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(async () => ({ session: "client" })),
}));
vi.mock("@/lib/supabase/server-client", () => ({ createServerSupabaseClient }));

const { listOwnedMemorials, SupabaseOwnedMemorialListRepository } = vi.hoisted(() => {
  const listOwnedMemorials = vi.fn();
  return {
    listOwnedMemorials,
    SupabaseOwnedMemorialListRepository: vi.fn(function (this: { listOwnedMemorials: unknown }) {
      this.listOwnedMemorials = listOwnedMemorials;
    }),
  };
});
vi.mock("@/lib/adapters/supabase/owned-memorial-list-repository", () => ({
  SupabaseOwnedMemorialListRepository,
}));

const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("next/navigation", () => ({ redirect }));

// Imported after the mocks above are registered.
const { default: OwnerPage } = await import("./page");

const VISITOR = { audience: "visitor", identity: null, owner: null, isHeritageAdmin: false };
const SIGNED_IN_NO_OWNER = {
  audience: "authenticated",
  identity: { id: "auth-1", email: "rany@example.com", app_metadata: {} },
  owner: null,
  isHeritageAdmin: false,
};
const OWNER = {
  audience: "owner",
  identity: { id: "auth-1", email: "rany@example.com", app_metadata: {} },
  owner: { id: "owner-1", authUserId: "auth-1", email: "rany@example.com", createdAt: "", updatedAt: "" },
  isHeritageAdmin: false,
};

async function render(langue?: "fr" | "en" | "es"): Promise<string> {
  const { renderToStaticMarkup } = await import("react-dom/server");
  return renderToStaticMarkup(
    await OwnerPage({ searchParams: Promise.resolve(langue ? { langue } : {}) }),
  );
}

describe("OwnerPage — the owner space (Builder continuity entry point)", () => {
  beforeEach(() => {
    getHeritageActor.mockReset();
    listOwnedMemorials.mockReset();
    SupabaseOwnedMemorialListRepository.mockClear();
    createServerSupabaseClient.mockClear();
    redirect.mockClear();
  });

  it("redirects to /login when there is no authenticated session, and reads nothing", async () => {
    getHeritageActor.mockResolvedValue(VISITOR);

    await expect(OwnerPage()).rejects.toThrow("REDIRECT:/login");
    expect(listOwnedMemorials).not.toHaveBeenCalled();
  });

  it("lists the Owner's memorials, each linking to its Builder — no UUID to remember", async () => {
    getHeritageActor.mockResolvedValue(OWNER);
    listOwnedMemorials.mockResolvedValue([
      { id: "11111111-1111-4111-8111-111111111111", displayName: "Jeanne Martin", createdAt: "2026-09-20T10:00:00.000Z", publicSlug: null },
      { id: "22222222-2222-4222-8222-222222222222", displayName: null, createdAt: "2026-09-21T10:00:00.000Z", publicSlug: null },
    ]);

    const html = await render();

    expect(html).toContain('href="/builder/11111111-1111-4111-8111-111111111111"');
    expect(html).toContain('href="/builder/22222222-2222-4222-8222-222222222222"');
    expect(html).toContain("Jeanne Martin");
    expect(html).toContain("Mémorial en cours de création");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("asks for the SERVER-resolved Owner's memorials, through the session-scoped client", async () => {
    getHeritageActor.mockResolvedValue(OWNER);
    listOwnedMemorials.mockResolvedValue([]);

    await render();

    expect(createServerSupabaseClient).toHaveBeenCalledTimes(1);
    expect(SupabaseOwnedMemorialListRepository).toHaveBeenCalledWith({ session: "client" });
    expect(listOwnedMemorials).toHaveBeenCalledWith("owner-1");
  });

  it("a signed-in session with no Owner sees no memorial, only the way to /activate — nothing is read", async () => {
    getHeritageActor.mockResolvedValue(SIGNED_IN_NO_OWNER);

    const html = await render();

    expect(listOwnedMemorials).not.toHaveBeenCalled();
    expect(html).not.toContain("/builder/");
    expect(html).toContain('href="/activate"');
  });

  it("an Owner with no memorial yet gets the same /activate path, never an error", async () => {
    getHeritageActor.mockResolvedValue(OWNER);
    listOwnedMemorials.mockResolvedValue([]);

    const html = await render();

    expect(html).not.toContain("/builder/");
    expect(html).toContain('href="/activate"');
    expect(html).not.toContain('role="alert"');
  });

  it("a failed read is a calm, visible error — never an empty list pretending there is no memorial", async () => {
    getHeritageActor.mockResolvedValue(OWNER);
    listOwnedMemorials.mockRejectedValue(new Error("permission denied"));

    const html = await render();

    expect(html).toContain('role="alert"');
    expect(html).not.toContain('href="/activate"');
  });

  it("never uses the service-role client for the list — the session client (RLS) only", () => {
    const source = readFileSync(path.join(import.meta.dirname, "page.tsx"), "utf8");
    expect(source).not.toContain("service-role-client");
    expect(source).not.toContain("createServiceRoleSupabaseClient");
  });

  // -------------------------------------------------------------------
  // QG 016 / M4 — « Voir mon hommage »
  // -------------------------------------------------------------------

  const PUBLISHED = {
    id: "11111111-1111-4111-8111-111111111111",
    displayName: "Jeanne Test-S1",
    createdAt: "2026-11-04T10:00:00.000Z",
    publicSlug: "95bd2601eac8",
  };
  const DRAFT = {
    id: "22222222-2222-4222-8222-222222222222",
    displayName: "Paul Brouillon",
    createdAt: "2026-11-04T11:00:00.000Z",
    publicSlug: null,
  };

  /** The rendered card (<li>) of one memorial, by its Builder link. */
  function cardOf(html: string, memorialId: string): string {
    const card = html.split("<li").find((chunk) => chunk.includes(`/builder/${memorialId}`));
    if (!card) throw new Error(`no card for ${memorialId}`);
    return card;
  }

  it("shows « Voir mon hommage » → /hommage/<slug>, same tab, under « Ouvrir l'atelier », for a consultable memorial", async () => {
    getHeritageActor.mockResolvedValue(OWNER);
    listOwnedMemorials.mockResolvedValue([PUBLISHED]);

    const html = await render();
    const card = cardOf(html, PUBLISHED.id);

    expect(card).toContain('href="/hommage/95bd2601eac8"');
    expect(card).toContain("Voir mon hommage");
    expect(card.indexOf("/builder/")).toBeLessThan(card.indexOf("/hommage/"));
    expect(card).not.toContain("target=");
    expect(card).not.toContain("_blank");
  });

  it("shows no link and no mention when the memorial is not consultable (draft, expired notice, editing, archived)", async () => {
    getHeritageActor.mockResolvedValue(OWNER);
    listOwnedMemorials.mockResolvedValue([DRAFT]);

    const html = await render();

    expect(html).not.toContain("/hommage/");
    expect(html).not.toContain("Voir mon hommage");
    expect(cardOf(html, DRAFT.id)).not.toMatch(/expir|plus visible|n.est plus/i);
    expect(html).toContain(`href="/builder/${DRAFT.id}"`);
  });

  it("several memorials: the link appears only in the card of the consultable one, with its own slug", async () => {
    getHeritageActor.mockResolvedValue(OWNER);
    listOwnedMemorials.mockResolvedValue([DRAFT, PUBLISHED]);

    const html = await render();

    expect(cardOf(html, PUBLISHED.id)).toContain('href="/hommage/95bd2601eac8"');
    expect(cardOf(html, DRAFT.id)).not.toContain("/hommage/");
    expect(html.match(/\/hommage\//g)).toHaveLength(1);
  });

  it("« Ouvrir l'atelier » is unchanged on a published memorial", async () => {
    getHeritageActor.mockResolvedValue(OWNER);
    listOwnedMemorials.mockResolvedValue([PUBLISHED]);

    const card = cardOf(await render(), PUBLISHED.id);

    expect(card).toContain(`href="/builder/${PUBLISHED.id}"`);
    expect(card).toContain("Ouvrir l’atelier");
  });

  it("fails closed: a summary without a usable publicSlug never renders a link", async () => {
    getHeritageActor.mockResolvedValue(OWNER);
    listOwnedMemorials.mockResolvedValue([
      { ...DRAFT, publicSlug: undefined },
      { ...PUBLISHED, id: "33333333-3333-4333-8333-333333333333", publicSlug: "" },
    ]);

    const html = await render();

    expect(html).not.toContain("/hommage/");
  });

  it("the link is built only from the server-decided publicSlug — no domain, no deployment URL", () => {
    const source = readFileSync(path.join(import.meta.dirname, "page.tsx"), "utf8");
    expect(source).toContain("`/hommage/${encodeURIComponent(memorial.publicSlug)}`");
    expect(source).not.toMatch(/https?:\/\//);
    expect(source).not.toContain("DEPLOY_PRIME_URL");
    expect(source).not.toContain("NEXT_PUBLIC_SITE_URL");
    expect(source).not.toContain("netlify");
    expect(source).not.toContain("vercel");
  });

  it("shows three active free drafts, their real deadlines and the account publication availability in Spanish", async () => {
    getHeritageActor.mockResolvedValue(OWNER);
    listOwnedMemorials.mockResolvedValue([1, 2, 3].map((index) => ({
      id: `11111111-1111-4111-8111-11111111111${index}`,
      displayName: `Homenaje ${index}`,
      createdAt: "2026-11-10T10:00:00Z",
      language: "es",
      publicSlug: null,
      activeFreeDraft: true,
      freeFirstPublishedAt: null,
      freeDeadlines: {
        publishUntil: "2099-11-20T10:00:00Z",
        draftUntil: "2099-12-25T10:00:00Z",
      },
    })));

    const html = await render("es");

    expect(html).toContain("Homenajes en preparación: 3 / 3");
    expect(html).toContain("Publicación gratuita de su cuenta: disponible hasta el 20 de noviembre de 2099");
    expect(html.match(/Preparación posible hasta el 25 de diciembre de 2099/g)).toHaveLength(3);
  });

  it("shows a recent free publication as used even while other draft deadlines are still ahead", async () => {
    getHeritageActor.mockResolvedValue(OWNER);
    listOwnedMemorials.mockResolvedValue([
      {
        id: DRAFT.id,
        displayName: DRAFT.displayName,
        createdAt: DRAFT.createdAt,
        language: "en",
        publicSlug: null,
        activeFreeDraft: true,
        freeFirstPublishedAt: null,
        freeDeadlines: { publishUntil: "2099-11-20T10:00:00Z", draftUntil: "2099-12-25T10:00:00Z" },
      },
      {
        id: PUBLISHED.id,
        displayName: PUBLISHED.displayName,
        createdAt: PUBLISHED.createdAt,
        language: "en",
        publicSlug: PUBLISHED.publicSlug,
        activeFreeDraft: false,
        freeFirstPublishedAt: "2026-11-12T10:00:00Z",
        freeDeadlines: null,
      },
    ]);

    const html = await render("en");
    expect(html).toContain("Tributes being prepared: 1 / 3");
    expect(html).toContain("Your account&#x27;s free publication has already been used.");
    expect(html).not.toContain("available until 20 November 2099 for one of your tributes");
  });
});
