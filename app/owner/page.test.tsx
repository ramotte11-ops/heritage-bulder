import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

vi.mock("server-only", () => ({}));

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

const { listTributeDetails, countOfferings, listOfferings, SupabaseFamilySpaceRepository } = vi.hoisted(() => {
  const listTributeDetails = vi.fn();
  const countOfferings = vi.fn();
  const listOfferings = vi.fn();
  return {
    listTributeDetails,
    countOfferings,
    listOfferings,
    SupabaseFamilySpaceRepository: vi.fn(function (this: Record<string, unknown>) {
      this.listTributeDetails = listTributeDetails;
      this.countOfferings = countOfferings;
      this.listOfferings = listOfferings;
    }),
  };
});
vi.mock("@/lib/adapters/supabase/family-space-repository", () => ({ SupabaseFamilySpaceRepository }));

const { loadOwnerFreePublicationStatus } = vi.hoisted(() => ({ loadOwnerFreePublicationStatus: vi.fn() }));
vi.mock("@/lib/memorial/load-owner-free-publication-status", () => ({ loadOwnerFreePublicationStatus }));

const { createServerMediaEngineDeps, createMediaReadUrl } = vi.hoisted(() => ({
  createServerMediaEngineDeps: vi.fn(() => ({ engine: "deps" })),
  createMediaReadUrl: vi.fn(),
}));
vi.mock("@/lib/media/server-media-engine", () => ({ createServerMediaEngineDeps }));
vi.mock("@/lib/media/read-media", () => ({ createMediaReadUrl }));

vi.mock("@/app/auth/actions", () => ({ signOut: vi.fn() }));
vi.mock("@/components/builder/fonts", () => ({
  playfairDisplay: { variable: "serif" },
  inter: { variable: "sans" },
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

const ID_1 = "11111111-1111-4111-8111-111111111111";
const ID_2 = "22222222-2222-4222-8222-222222222222";
const ID_3 = "33333333-3333-4333-8333-333333333333";

const PUBLISHED = { id: ID_1, displayName: "Jeanne Test-S1", createdAt: "2026-11-04T10:00:00.000Z", language: null, publicSlug: "95bd2601eac8" };
const DRAFT = { id: ID_2, displayName: "Paul Brouillon", createdAt: "2026-11-04T11:00:00.000Z", language: null, publicSlug: null };

function details(entries: Record<string, Record<string, unknown>>) {
  return new Map(
    Object.entries(entries).map(([id, value]) => [
      id,
      { memorialId: id, status: "draft", birth: null, death: null, photo: null, ...value },
    ]),
  );
}

async function render(params: { langue?: string; hommage?: string } = {}): Promise<string> {
  const { renderToStaticMarkup } = await import("react-dom/server");
  return renderToStaticMarkup(await OwnerPage({ searchParams: Promise.resolve(params) }));
}

/** The rendered card of one tribute, by its data attribute. */
function cardOf(html: string, memorialId: string): string {
  const start = html.indexOf(`data-tribute="${memorialId}"`);
  if (start < 0) throw new Error(`no card for ${memorialId}`);
  const end = html.indexOf("</article>", start);
  return html.slice(start, end);
}

beforeEach(() => {
  for (const mock of [
    getHeritageActor, listOwnedMemorials, listTributeDetails, countOfferings, listOfferings,
    loadOwnerFreePublicationStatus, createMediaReadUrl,
  ]) {
    mock.mockReset();
  }
  SupabaseOwnedMemorialListRepository.mockClear();
  SupabaseFamilySpaceRepository.mockClear();
  createServerSupabaseClient.mockClear();
  createServerMediaEngineDeps.mockClear();
  redirect.mockClear();
  loadOwnerFreePublicationStatus.mockResolvedValue({ status: "opens_on_next_save", activeFreeDrafts: 0, maxFreeDrafts: 3 });
  listTributeDetails.mockResolvedValue(new Map());
  countOfferings.mockResolvedValue({ coeur: 0, bougie: 0, lys: 0 });
  listOfferings.mockResolvedValue({ offerings: [], hasMore: false });
});

describe("OwnerPage — session and access (unchanged guarantees)", () => {
  it("redirects to /login when there is no authenticated session, and reads nothing", async () => {
    getHeritageActor.mockResolvedValue(VISITOR);

    await expect(OwnerPage()).rejects.toThrow("REDIRECT:/login");
    expect(listOwnedMemorials).not.toHaveBeenCalled();
    expect(listTributeDetails).not.toHaveBeenCalled();
    expect(countOfferings).not.toHaveBeenCalled();
  });

  it("asks for the SERVER-resolved Owner's tributes, through the session-scoped client", async () => {
    getHeritageActor.mockResolvedValue(OWNER);
    listOwnedMemorials.mockResolvedValue([DRAFT]);

    await render();

    expect(createServerSupabaseClient).toHaveBeenCalledTimes(1);
    expect(SupabaseOwnedMemorialListRepository).toHaveBeenCalledWith({ session: "client" });
    expect(SupabaseFamilySpaceRepository).toHaveBeenCalledWith({ session: "client" });
    expect(listOwnedMemorials).toHaveBeenCalledWith("owner-1");
    expect(listTributeDetails).toHaveBeenCalledWith("owner-1");
    expect(loadOwnerFreePublicationStatus).toHaveBeenCalledWith("owner-1");
  });

  it("a signed-in session with no Owner sees no tribute, only the way to /activate — nothing is read", async () => {
    getHeritageActor.mockResolvedValue(SIGNED_IN_NO_OWNER);

    const html = await render();

    expect(listOwnedMemorials).not.toHaveBeenCalled();
    expect(loadOwnerFreePublicationStatus).not.toHaveBeenCalled();
    expect(html).not.toContain("/builder/");
    expect(html).toContain('href="/activate"');
    expect(html).not.toContain("data-family-features");
  });

  it("an Owner with no tribute yet gets the /activate path and the creation entry, never an error", async () => {
    getHeritageActor.mockResolvedValue(OWNER);
    listOwnedMemorials.mockResolvedValue([]);

    const html = await render();

    expect(html).not.toContain("/builder/");
    expect(html).toContain('href="/activate"');
    expect(html).toContain('href="/creer"');
    expect(html).not.toContain('role="alert"');
    expect(countOfferings).not.toHaveBeenCalled();
  });

  it("a failed read is a calm, visible error — never an empty space pretending there is no tribute", async () => {
    getHeritageActor.mockResolvedValue(OWNER);
    listOwnedMemorials.mockRejectedValue(new Error("permission denied"));

    const html = await render();

    expect(html).toContain('role="alert"');
    expect(html).not.toContain('href="/activate"');
    expect(html).not.toContain('href="/creer"');
  });

  it("keeps privileged clients out of the page: lists on the session client, status and photos through server-only loaders", () => {
    const source = readFileSync(path.join(import.meta.dirname, "page.tsx"), "utf8");
    expect(source).not.toContain("service-role-client");
    expect(source).not.toContain("createServiceRoleSupabaseClient");
    const loader = readFileSync(path.join(import.meta.dirname, "../../lib/owner/load-family-space.ts"), "utf8");
    expect(loader).toContain('import "server-only"');
    expect(loader).not.toContain("createServiceRoleSupabaseClient");
    expect(loader).toContain("loadOwnerFreePublicationStatus");
  });
});

describe("OwnerPage — tribute cards", () => {
  it("shows « Mon espace famille », the account and every tribute with its Builder link", async () => {
    getHeritageActor.mockResolvedValue(OWNER);
    listOwnedMemorials.mockResolvedValue([DRAFT, { ...PUBLISHED, id: ID_3, displayName: null, publicSlug: null }]);

    const html = await render();

    expect(html).toContain("Mon espace famille");
    expect(html).toContain("rany@example.com");
    expect(html).toContain(`href="/builder/${ID_2}"`);
    expect(html).toContain(`href="/builder/${ID_3}"`);
    expect(html).toContain("Paul Brouillon");
    expect(html).toContain("Mémorial en cours de création");
  });

  it("a tribute in preparation: real years, « En préparation », « Reprendre l'atelier », no public link", async () => {
    getHeritageActor.mockResolvedValue(OWNER);
    listOwnedMemorials.mockResolvedValue([DRAFT]);
    listTributeDetails.mockResolvedValue(
      details({ [ID_2]: { birth: { precision: "date", date: "1948-03-02" }, death: { precision: "year", year: 2023 } } }),
    );

    const card = cardOf(await render(), ID_2);

    expect(card).toContain('data-tribute-state="in_preparation"');
    expect(card).toContain("1948 – 2023");
    expect(card).toContain("En préparation");
    expect(card).toContain("Reprendre l’atelier");
    expect(card).not.toContain("/hommage/");
    expect(card).not.toContain("data-tribute-edit");
  });

  it("shows no years when none is entered — nothing is invented", async () => {
    getHeritageActor.mockResolvedValue(OWNER);
    listOwnedMemorials.mockResolvedValue([DRAFT]);

    expect(cardOf(await render(), ID_2)).not.toMatch(/\d{4} – \d{4}/);
  });

  it("a published tribute: « Publié », « Voir l'hommage » → /hommage/<slug> in the same tab, and « Modifier » → its Builder", async () => {
    getHeritageActor.mockResolvedValue(OWNER);
    listOwnedMemorials.mockResolvedValue([PUBLISHED]);
    listTributeDetails.mockResolvedValue(details({ [ID_1]: { status: "published" } }));

    const card = cardOf(await render(), ID_1);

    expect(card).toContain('data-tribute-state="published"');
    expect(card).toContain("Publié");
    expect(card).toContain('href="/hommage/95bd2601eac8"');
    expect(card).toContain("Voir l’hommage");
    expect(card).toContain("data-tribute-edit");
    expect(card).toContain(`href="/builder/${ID_1}"`);
    expect(card).not.toContain("target=");
    expect(card).not.toContain("_blank");
  });

  it("fails closed: without the server-decided publicSlug there is no public link, whatever the raw status", async () => {
    getHeritageActor.mockResolvedValue(OWNER);
    listOwnedMemorials.mockResolvedValue([{ ...PUBLISHED, publicSlug: null }, DRAFT]);
    listTributeDetails.mockResolvedValue(details({ [ID_1]: { status: "published" }, [ID_2]: { status: "editing" } }));

    const html = await render();

    expect(html).not.toContain("/hommage/");
    expect(cardOf(html, ID_1)).toContain('data-tribute-state="no_longer_visible"');
    expect(cardOf(html, ID_1)).toContain("N’est plus visible");
    expect(cardOf(html, ID_2)).toContain("Modifications en cours");
  });

  it("several tributes: the public link appears only in the card of the consultable one, with its own slug", async () => {
    getHeritageActor.mockResolvedValue(OWNER);
    listOwnedMemorials.mockResolvedValue([PUBLISHED, DRAFT]);

    const html = await render();

    expect(cardOf(html, ID_1)).toContain("/hommage/95bd2601eac8");
    expect(cardOf(html, ID_2)).not.toContain("/hommage/");
  });

  it("the public link is built only from the slug — no domain, no deployment URL", () => {
    const source = readFileSync(path.join(import.meta.dirname, "../../components/owner/TributeCard.tsx"), "utf8");
    expect(source).not.toMatch(/https?:\/\//);
    expect(source).not.toContain("netlify");
  });
});

describe("OwnerPage — the Hero photograph, reused", () => {
  const PHOTO = { mediaId: "media-1", crop: { focalX: 0.5, focalY: 0.2, zoom: 1 } };

  it("signs the Hero's own photo through the Builder's read path, for the session's actor, and places it with the Hero crop", async () => {
    getHeritageActor.mockResolvedValue(OWNER);
    listOwnedMemorials.mockResolvedValue([DRAFT]);
    listTributeDetails.mockResolvedValue(details({ [ID_2]: { photo: PHOTO } }));
    createMediaReadUrl.mockResolvedValue({
      ok: true,
      value: { media: { width: 1000, height: 2000 }, readUrl: "https://storage.example/signed?token=abc", expiresInSeconds: 300 },
    });

    const card = cardOf(await render(), ID_2);

    expect(createMediaReadUrl).toHaveBeenCalledWith({ engine: "deps" }, OWNER, { memorialId: ID_2, mediaId: "media-1" });
    expect(card).toContain('src="https://storage.example/signed?token=abc"');
    expect(card).toContain('alt="Photographie de Paul Brouillon"');
    // 1000×2000 in a 4:5 window: full width, 160 % tall, top driven by the focal point.
    expect(card).toContain("width:100%");
    expect(card).toContain("height:160%");
    expect(card).not.toContain("data-tribute-no-photo");
    expect(card).not.toContain("data-tribute-add-photo");
  });

  it("a draft saved before the photo: a placeholder and « Ajouter la photo » → the Builder's photo screen; nothing is signed", async () => {
    getHeritageActor.mockResolvedValue(OWNER);
    listOwnedMemorials.mockResolvedValue([DRAFT]);

    const card = cardOf(await render(), ID_2);

    expect(createMediaReadUrl).not.toHaveBeenCalled();
    expect(card).toContain("data-tribute-no-photo");
    expect(card).toContain(`href="/builder/${ID_2}?etape=photo"`);
    expect(card).toContain("Ajouter la photo");
    expect(card).not.toContain("<img");
  });

  it("a photo that cannot be read is simply absent — the card and its actions remain", async () => {
    getHeritageActor.mockResolvedValue(OWNER);
    listOwnedMemorials.mockResolvedValue([DRAFT]);
    listTributeDetails.mockResolvedValue(details({ [ID_2]: { photo: PHOTO } }));
    createMediaReadUrl.mockResolvedValue({ ok: false, code: "access_denied" });

    const card = cardOf(await render(), ID_2);

    expect(card).toContain("data-tribute-no-photo");
    expect(card).not.toContain("<img");
    expect(card).toContain(`href="/builder/${ID_2}"`);
  });

  it("still lists every tribute when statuses and photos cannot be read", async () => {
    getHeritageActor.mockResolvedValue(OWNER);
    listOwnedMemorials.mockResolvedValue([PUBLISHED, DRAFT]);
    listTributeDetails.mockRejectedValue(new Error("boom"));

    const html = await render();

    expect(html).not.toContain('role="alert"');
    expect(cardOf(html, ID_1)).toContain("/hommage/95bd2601eac8");
    expect(cardOf(html, ID_2)).toContain(`href="/builder/${ID_2}"`);
  });
});

describe("OwnerPage — creating a new tribute", () => {
  it("offers « Créer un nouvel hommage » → /creer below the limit", async () => {
    getHeritageActor.mockResolvedValue(OWNER);
    listOwnedMemorials.mockResolvedValue([DRAFT]);
    loadOwnerFreePublicationStatus.mockResolvedValue({ status: "opens_on_next_save", activeFreeDrafts: 2, maxFreeDrafts: 3 });

    const html = await render();

    expect(html).toContain('href="/creer"');
    expect(html).not.toContain("data-create-limit");
  });

  it("at the account's official limit: no link, and the reason in plain words", async () => {
    getHeritageActor.mockResolvedValue(OWNER);
    listOwnedMemorials.mockResolvedValue([DRAFT]);
    loadOwnerFreePublicationStatus.mockResolvedValue({ status: "used", renewsAt: null, activeFreeDrafts: 3, maxFreeDrafts: 3 });

    const html = await render();

    expect(html).not.toContain('href="/creer"');
    expect(html).toContain('data-create-tribute="limit"');
    expect(html).toContain("Votre compte a déjà 3 hommages en préparation");
  });

  it("keeps the entry open when the official counter is unavailable — the database still decides at save time", async () => {
    getHeritageActor.mockResolvedValue(OWNER);
    listOwnedMemorials.mockResolvedValue([DRAFT]);
    loadOwnerFreePublicationStatus.mockResolvedValue({ status: "unknown" });

    const html = await render();

    expect(html).toContain('href="/creer"');
    expect(html).not.toContain("Hommages en préparation");
  });
});

describe("OwnerPage — real attentions of the selected tribute", () => {
  it("shows the real totals and the latest gestures of the published tribute by default, with the way to its book", async () => {
    getHeritageActor.mockResolvedValue(OWNER);
    listOwnedMemorials.mockResolvedValue([PUBLISHED, DRAFT]);
    listTributeDetails.mockResolvedValue(details({ [ID_1]: { status: "published" } }));
    countOfferings.mockResolvedValue({ coeur: 12, bougie: 7, lys: 9 });
    listOfferings.mockResolvedValue({
      offerings: [
        { id: "o1", kind: "lys", createdAt: "2026-11-15T09:00:00.000Z" },
        { id: "o2", kind: "bougie", createdAt: "2026-11-12T18:30:00.000Z" },
      ],
      hasMore: true,
    });

    const html = await render();

    expect(countOfferings).toHaveBeenCalledWith(ID_1);
    expect(listOfferings).toHaveBeenCalledWith(ID_1, { offset: 0, limit: 2 });
    expect(html).toContain(`data-family-features="${ID_1}"`);
    expect(html).toMatch(/data-offering-count="coeur"[^>]*>12</);
    expect(html).toMatch(/data-offering-count="bougie"[^>]*>7</);
    expect(html).toMatch(/data-offering-count="lys"[^>]*>9</);
    expect(html).toContain("Une fleur a été déposée.");
    expect(html).toContain("Une bougie a été allumée.");
    expect(html).toContain("15 nov. 2026");
    expect(html).toContain(`href="/owner/hommages/${ID_1}/attentions"`);
  });

  it("no gesture: zeros and a quiet empty state — no invented figure, no link to an empty book", async () => {
    getHeritageActor.mockResolvedValue(OWNER);
    listOwnedMemorials.mockResolvedValue([PUBLISHED]);

    const html = await render();

    expect(html).toMatch(/data-offering-count="coeur"[^>]*>0</);
    expect(html).toContain("Aucune attention pour le moment.");
    expect(html).not.toContain("/attentions");
  });

  it("a tribute in preparation explains that attentions come with publication", async () => {
    getHeritageActor.mockResolvedValue(OWNER);
    listOwnedMemorials.mockResolvedValue([DRAFT]);

    expect(await render()).toContain("dès que l’hommage sera publié");
  });

  it("the switcher appears only with several tributes; « ?hommage= » selects one of the family's own", async () => {
    getHeritageActor.mockResolvedValue(OWNER);
    listOwnedMemorials.mockResolvedValue([PUBLISHED]);
    expect(await render()).not.toContain("data-tribute-switcher");

    listOwnedMemorials.mockResolvedValue([PUBLISHED, DRAFT]);
    const html = await render({ hommage: ID_2 });

    expect(html).toContain("data-tribute-switcher");
    expect(html).toContain(`href="/owner?hommage=${ID_1}"`);
    expect(countOfferings).toHaveBeenLastCalledWith(ID_2);
    expect(html).toContain(`data-family-features="${ID_2}"`);
  });

  it("« ?hommage= » naming a tribute that is not the family's is ignored — never passed to a read", async () => {
    getHeritageActor.mockResolvedValue(OWNER);
    listOwnedMemorials.mockResolvedValue([PUBLISHED, DRAFT]);
    const foreign = "99999999-9999-4999-8999-999999999999";

    const html = await render({ hommage: foreign });

    expect(countOfferings).toHaveBeenCalledTimes(1);
    expect(countOfferings).toHaveBeenCalledWith(ID_1);
    expect(listOfferings).not.toHaveBeenCalledWith(foreign, expect.anything());
    expect(html).not.toContain(foreign);
  });

  it("a failed attentions read is said calmly; the tributes stay usable", async () => {
    getHeritageActor.mockResolvedValue(OWNER);
    listOwnedMemorials.mockResolvedValue([PUBLISHED]);
    countOfferings.mockRejectedValue(new Error("boom"));

    const html = await render();

    expect(html).toContain("Les attentions n’ont pas pu être chargées");
    expect(html).not.toContain("data-offering-count");
    expect(cardOf(html, ID_1)).toContain("/hommage/95bd2601eac8");
  });

  it("contributions are announced, not simulated: no link, « Bientôt disponible »", async () => {
    getHeritageActor.mockResolvedValue(OWNER);
    listOwnedMemorials.mockResolvedValue([PUBLISHED]);

    const html = await render();

    expect(html).toContain('data-feature="contributions" data-available="false"');
    expect(html).toContain("Bientôt disponible");
    expect(html).not.toContain("/contributions");
  });
});

describe("OwnerPage — free publication information (QG 017 A2, unchanged rules)", () => {
  it("shows three active free drafts, their real deadlines and the account publication availability in Spanish", async () => {
    getHeritageActor.mockResolvedValue(OWNER);
    loadOwnerFreePublicationStatus.mockResolvedValue({
      status: "window_open", windowUntil: "2099-11-25T10:00:00.000Z", activeFreeDrafts: 3, maxFreeDrafts: 3,
    });
    const deadlines = { publishUntil: "2099-11-25T10:00:00.000Z", draftUntil: "2099-12-30T10:00:00.000Z" };
    listOwnedMemorials.mockResolvedValue([
      { ...DRAFT, id: ID_1, freeDeadlines: deadlines },
      { ...DRAFT, id: ID_2, freeDeadlines: deadlines },
      { ...DRAFT, id: ID_3, freeDeadlines: deadlines },
    ]);

    const html = await render({ langue: "es" });

    expect(html).toContain('lang="es"');
    expect(html).toContain("Mi espacio familiar");
    expect(html).toContain("Homenajes en preparación: 3 / 3");
    expect(html).toContain('data-owner-free-publication="window_open"');
    expect(html.match(/data-free-deadline="publish"/g)).toHaveLength(3);
    expect(html.match(/data-free-deadline="draft"/g)).toHaveLength(3);
    expect(html).toContain("25 de noviembre de 2099");
    expect(html).toContain('href="/owner?langue=es&amp;hommage=');
    expect(html).not.toMatch(/owner\.[a-zA-Z]+/);
  });

  it("shows the official used state and renewal, hiding another draft's future publication date", async () => {
    getHeritageActor.mockResolvedValue(OWNER);
    loadOwnerFreePublicationStatus.mockResolvedValue({
      status: "used", renewsAt: "2027-11-04T10:00:00.000Z", activeFreeDrafts: 1, maxFreeDrafts: 3,
    });
    listOwnedMemorials.mockResolvedValue([
      { ...DRAFT, freeDeadlines: { publishUntil: "2099-11-25T10:00:00.000Z", draftUntil: "2099-12-30T10:00:00.000Z" } },
    ]);

    const html = await render();

    expect(html).toContain('data-owner-free-publication="used"');
    expect(html).toContain("La publication gratuite de votre compte a été utilisée.");
    expect(html).toContain("data-owner-free-renewal");
    expect(html).toContain("4 novembre 2027");
    expect(html).not.toContain('data-free-deadline="publish"');
    expect(html).toContain('data-free-deadline="draft"');
  });

  it("shows an expired right without inventing a renewal date, and neutral copy when the status is unavailable", async () => {
    getHeritageActor.mockResolvedValue(OWNER);
    listOwnedMemorials.mockResolvedValue([DRAFT]);
    loadOwnerFreePublicationStatus.mockResolvedValue({ status: "expired", renewsAt: null, activeFreeDrafts: 1, maxFreeDrafts: 3 });

    let html = await render();
    expect(html).toContain('data-owner-free-publication="expired"');
    expect(html).not.toContain("data-owner-free-renewal");

    loadOwnerFreePublicationStatus.mockResolvedValue({ status: "unknown" });
    html = await render({ langue: "en" });
    expect(html).toContain('data-owner-free-publication="unknown"');
    expect(html).toContain("Each account has one free publication per 12-month period.");
    expect(html).not.toContain("Tributes in preparation");
  });
});
