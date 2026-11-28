import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import sharp from "sharp";
import type { ContributionRepository, DepositResult, PublicContributionRow } from "@/lib/adapters/contribution-repository";
import type { Media } from "@/types/media";
import { issueFormToken, type FormTokenSecrets } from "./form-token";
import { processContributionPhoto } from "./photo-processing";
import {
  decodeCursor,
  encodeCursor,
  finishContributionPhoto,
  openContributionForm,
  loadPublicContributionsInitial,
  readPublicContributions,
  renewPublicContributionPhotos,
  startContributionPhoto,
  submitContributionText,
  type VisitorContributionDeps,
} from "./visitor-contributions";

/** Données synthétiques uniquement. */
const SECRETS: FormTokenSecrets = { current: "test-secret-0123456789abcdef0123456789", previous: null };
const SLUG = "a1b2c3d4e5f6";
const MEM = "11111111-1111-4111-8111-111111111111";
const MEDIA = "22222222-2222-4222-8222-222222222222";
const OWNER = "33333333-3333-4333-8333-333333333333";
const NONCE = "44444444-4444-4444-8444-444444444444";
const T0 = new Date("2026-11-20T10:00:00Z");
const NOW = new Date(T0.getTime() + 10_000);
const PATH = `${MEM}/${MEDIA}/original.webp`;

function token(at = T0, slug = SLUG, nonce = NONCE) {
  return issueFormToken(SECRETS, slug, at, nonce);
}

function media(over: Partial<Media> = {}): Media {
  return {
    id: MEDIA,
    memorialId: MEM,
    ownerId: OWNER,
    storagePath: PATH,
    mediaType: "photo",
    purpose: "contribution" as Media["purpose"],
    status: "pending",
    mimeType: "image/jpeg",
    originalFilename: null,
    sizeBytes: null,
    width: null,
    height: null,
    createdAt: new Date(NOW.getTime() - 60_000).toISOString(),
    updatedAt: NOW.toISOString(),
    ...over,
  };
}

function setup(over: { repo?: Partial<ContributionRepository>; media?: Media | null; stored?: Uint8Array | null; secrets?: FormTokenSecrets | null } = {}) {
  const objects = new Map<string, Uint8Array>();
  if (over.stored !== null && over.stored !== undefined) objects.set(PATH, over.stored);
  const deposit = (outcome: DepositResult["outcome"], status: DepositResult["status"] = null): DepositResult => ({ outcome, contributionId: "c1", status });
  const repository = {
    findPublicMemorialId: vi.fn(async () => MEM as string | null),
    submit: vi.fn(async (i: { type: string }) => deposit(i.type === "condolence" ? "published" : "pending", i.type === "condolence" ? "published" : "pending")),
    reservePhoto: vi.fn(async () => "reserved" as const),
    finalizePhoto: vi.fn(async () => deposit("pending", "pending")),
    readPublic: vi.fn(async () => [] as PublicContributionRow[]),
    ...over.repo,
  } as unknown as ContributionRepository & Record<string, ReturnType<typeof vi.fn>>;
  const deps: VisitorContributionDeps = {
    repository,
    signPublicPhoto: vi.fn(async (_slug, path) => `https://storage.test/signed/${path}?ttl=300`),
    objectStore: {
      createUploadPermission: vi.fn(async ({ path }: { path: string }) => ({ url: `https://storage.test/upload/${path}?token=t`, token: "t" })),
      createReadUrl: vi.fn(async ({ path, expiresInSeconds }: { path: string; expiresInSeconds: number }) => `https://storage.test/signed/${path}?ttl=${expiresInSeconds}`),
      statObject: vi.fn(async ({ path }: { path: string }) => (objects.has(path) ? { sizeBytes: objects.get(path)!.byteLength } : null)),
      removeByPrefix: vi.fn(async ({ prefix }: { prefix: string }) => {
        for (const k of [...objects.keys()]) if (k.startsWith(prefix + "/")) objects.delete(k);
      }),
    },
    mediaRepository: { findById: vi.fn(async () => (over.media === undefined ? media() : over.media)) },
    mediaSecurityRepository: {
      reservePendingCleanup: vi.fn(async () => ({ claimId: "claim-1" })),
      finishPendingCleanup: vi.fn(async () => undefined),
    },
    photoStore: {
      download: vi.fn(async ({ path }: { path: string }) => objects.get(path) ?? null),
      replace: vi.fn(async ({ path, bytes }: { path: string; bytes: Uint8Array }) => {
        objects.set(path, bytes);
      }),
    },
    processPhoto: vi.fn(processContributionPhoto),
    secrets: over.secrets === undefined ? SECRETS : over.secrets,
    generateId: () => MEDIA,
    now: () => NOW,
  };
  return { deps, repository, objects };
}

const TEXT = { slug: SLUG, type: "condolence", authorName: "Marie", text: "Toutes nos pensées.", formToken: token() };

describe("M8-E2 — ouverture du formulaire", () => {
  it("jeton signé pour l'hommage ; sans secret : indisponible ; slug forgé : refusé", () => {
    const { deps } = setup();
    expect(openContributionForm(deps, SLUG)).toMatchObject({ status: "ready", formToken: expect.stringMatching(/^v1\./) });
    expect(openContributionForm({ ...deps, secrets: null }, SLUG)).toEqual({ status: "unavailable" });
    expect(openContributionForm(deps, "../etc")).toEqual({ status: "refused" });
  });
});

describe("M8-E2 — dépôt d'un texte", () => {
  it("condoléance publiée, récit en attente (D2), avec la clé d'idempotence du jeton", async () => {
    const { deps, repository } = setup();
    expect(await submitContributionText(deps, TEXT)).toEqual({ status: "published" });
    expect(await submitContributionText(deps, { ...TEXT, type: "testimonial", text: "Un été." })).toEqual({ status: "pending" });
    expect(repository.submit).toHaveBeenCalledWith({ slug: SLUG, type: "condolence", authorName: "Marie", content: "Toutes nos pensées.", idempotencyKey: NONCE });
  });

  it("le serveur normalise avant la base (NFC, \\r\\n → \\n, bords)", async () => {
    const { deps, repository } = setup();
    await submitContributionText(deps, { ...TEXT, authorName: "  Rene\u0301 ", text: "Ligne 1\r\nLigne 2\r" });
    expect(repository.submit).toHaveBeenCalledWith(expect.objectContaining({ authorName: "René", content: "Ligne 1\nLigne 2" }));
  });

  it("limites (serveur) : nom 61, condoléance 501, récit 2001 refusés sans appel à la base", async () => {
    const { deps, repository } = setup();
    expect(await submitContributionText(deps, { ...TEXT, authorName: "x".repeat(61) })).toEqual({ status: "invalid", field: "authorName" });
    expect(await submitContributionText(deps, { ...TEXT, text: "x".repeat(501) })).toEqual({ status: "invalid", field: "text" });
    expect(await submitContributionText(deps, { ...TEXT, type: "testimonial", text: "x".repeat(2001) })).toEqual({ status: "invalid", field: "text" });
    expect(await submitContributionText(deps, { ...TEXT, type: "testimonial", text: "x".repeat(2000) })).toEqual({ status: "pending" });
    expect(repository.submit).toHaveBeenCalledTimes(1);
  });

  it("types : memory_message et photo ne passent jamais par ce dépôt", async () => {
    const { deps, repository } = setup();
    for (const type of ["memory_message", "photo", "x", undefined]) {
      expect(await submitContributionText(deps, { ...TEXT, type })).toEqual({ status: "invalid", field: "request" });
    }
    expect(repository.submit).not.toHaveBeenCalled();
  });

  it("anti-robots : champ piège rempli, jeton absent, forgé, trop rapide, d'un autre hommage → refusé ; expiré → expired", async () => {
    const { deps, repository } = setup();
    expect(await submitContributionText(deps, { ...TEXT, honeypot: "http://spam" })).toEqual({ status: "refused" });
    expect(await submitContributionText(deps, { ...TEXT, formToken: undefined })).toEqual({ status: "refused" });
    expect(await submitContributionText(deps, { ...TEXT, formToken: issueFormToken({ current: "y".repeat(40), previous: null }, SLUG, T0) })).toEqual({ status: "refused" });
    expect(await submitContributionText(deps, { ...TEXT, formToken: token(new Date(NOW.getTime() - 1_000)) })).toEqual({ status: "refused" });
    expect(await submitContributionText(deps, { ...TEXT, formToken: token(T0, "ffffffffffff") })).toEqual({ status: "refused" });
    expect(await submitContributionText(deps, { ...TEXT, formToken: token(new Date(NOW.getTime() - 3 * 3600_000)) })).toEqual({ status: "expired" });
    expect(repository.submit).not.toHaveBeenCalled();
  });

  it("sans secret configuré : indisponible, rien n'est écrit (échec fermé)", async () => {
    const { deps, repository } = setup({ secrets: null });
    expect(await submitContributionText(deps, TEXT)).toEqual({ status: "unavailable" });
    expect(repository.submit).not.toHaveBeenCalled();
  });

  it("slug forgé : refusé sans appel à la base", async () => {
    const { deps, repository } = setup();
    expect(await submitContributionText(deps, { ...TEXT, slug: "'; drop table messages;--" })).toEqual({ status: "refused" });
    expect(repository.submit).not.toHaveBeenCalled();
  });

  it("résultats de la base : plafond → busy (R5) ; doublon → le succès d'origine, sans révéler une modération ; refus ; panne", async () => {
    const cases: [DepositResult, unknown][] = [
      [{ outcome: "rate_limited", contributionId: null, status: null }, { status: "busy" }],
      [{ outcome: "duplicate", contributionId: "c", status: "published" }, { status: "published" }],
      [{ outcome: "duplicate", contributionId: "c", status: "pending" }, { status: "pending" }],
      [{ outcome: "duplicate", contributionId: "c", status: "hidden" }, { status: "pending" }],
      [{ outcome: "duplicate", contributionId: "c", status: "rejected" }, { status: "pending" }],
      [{ outcome: "refused", contributionId: null, status: null }, { status: "refused" }],
    ];
    for (const [db, expected] of cases) {
      const { deps } = setup({ repo: { submit: vi.fn(async () => db) } });
      expect(await submitContributionText(deps, TEXT)).toEqual(expected);
    }
    const { deps } = setup({ repo: { submit: vi.fn(async () => { throw new Error("network"); }) } });
    expect(await submitContributionText(deps, TEXT)).toEqual({ status: "unavailable" });
  });
});

async function exifJpeg(width: number, height: number, orientation?: number) {
  let img = sharp({ create: { width, height, channels: 3, background: { r: 200, g: 100, b: 50 } } })
    .jpeg()
    .withExif({ IFD0: { Make: "SyntheticCam" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "48/1 51/1 24/1" } });
  if (orientation) img = img.withMetadata({ orientation });
  return new Uint8Array(await img.toBuffer());
}

describe("M8-E2 — photographie : réservation", () => {
  it("réserve <memorial>/<media>/original.webp et délivre une permission pour CE SEUL objet, avec un ticket", async () => {
    const { deps, repository } = setup();
    const r = await startContributionPhoto(deps, { slug: SLUG, declaredMimeType: "image/jpeg", formToken: token() });
    expect(r).toMatchObject({ status: "ready", mediaId: MEDIA, uploadToken: "t", photoTicket: expect.any(String) });
    expect(repository.reservePhoto).toHaveBeenCalledWith({ slug: SLUG, mediaId: MEDIA, storagePath: PATH, declaredMimeType: "image/jpeg" });
    expect(deps.objectStore.createUploadPermission).toHaveBeenCalledWith({ path: PATH });
  });

  it("R2/R3 : rate_limited et pending_full → busy (R5), sans permission d'envoi", async () => {
    for (const outcome of ["rate_limited", "pending_full"] as const) {
      const { deps } = setup({ repo: { reservePhoto: vi.fn(async () => outcome) } });
      expect(await startContributionPhoto(deps, { slug: SLUG, declaredMimeType: "image/webp", formToken: token() })).toEqual({ status: "busy" });
      expect(deps.objectStore.createUploadPermission).not.toHaveBeenCalled();
    }
  });

  it("type déclaré hors JPEG/PNG/WebP, hommage non public, catégorie fermée : refus sans permission", async () => {
    const a = setup();
    expect(await startContributionPhoto(a.deps, { slug: SLUG, declaredMimeType: "image/svg+xml", formToken: token() })).toEqual({ status: "invalid", field: "photo" });
    const b = setup({ repo: { findPublicMemorialId: vi.fn(async () => null) } });
    expect(await startContributionPhoto(b.deps, { slug: SLUG, declaredMimeType: "image/png", formToken: token() })).toEqual({ status: "refused" });
    expect(b.repository.reservePhoto).not.toHaveBeenCalled();
    const c = setup({ repo: { reservePhoto: vi.fn(async () => "refused" as const) } });
    expect(await startContributionPhoto(c.deps, { slug: SLUG, declaredMimeType: "image/png", formToken: token() })).toEqual({ status: "refused" });
    for (const d of [a, b, c]) expect(d.deps.objectStore.createUploadPermission).not.toHaveBeenCalled();
  });
});

describe("M8-E2 — photographie : traitement et finalisation (O5)", () => {
  async function started(deps: VisitorContributionDeps) {
    const r = await startContributionPhoto(deps, { slug: SLUG, declaredMimeType: "image/jpeg", formToken: token() });
    if (r.status !== "ready") throw new Error("not started");
    return r.photoTicket;
  }

  it("le fichier brut est remplacé par la version nettoyée AVANT la finalisation ; la base reçoit les mesures du fichier final", async () => {
    const raw = await exifJpeg(4032, 3024, 6);
    const { deps, repository, objects } = setup({ stored: raw });
    const ticket = await started(deps);
    const r = await finishContributionPhoto(deps, { slug: SLUG, mediaId: MEDIA, photoTicket: ticket, authorName: " Paul ", caption: "  ", formToken: token() });
    expect(r).toEqual({ status: "pending" });

    const stored = objects.get(PATH)!;
    const meta = await sharp(stored).metadata();
    expect(meta.format).toBe("webp");
    expect([meta.width, meta.height]).toEqual([1500, 2000]); // orientation appliquée
    expect([meta.exif, meta.xmp, meta.icc]).toEqual([undefined, undefined, undefined]);
    expect(Buffer.from(stored).includes(Buffer.from("SyntheticCam"))).toBe(false);

    expect(repository.finalizePhoto).toHaveBeenCalledWith({
      slug: SLUG, mediaId: MEDIA, authorName: "Paul", caption: null, idempotencyKey: NONCE,
      mimeType: "image/webp", sizeBytes: stored.byteLength, width: 1500, height: 2000,
    });
    // L'ordre est la garantie : remplacement, PUIS passage à ready.
    const replaceOrder = (deps.photoStore.replace as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    const finalizeOrder = (repository.finalizePhoto as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    expect(replaceOrder).toBeLessThan(finalizeOrder);
  });

  it("un fichier dangereux ou invalide est refusé : jamais finalisé, octets supprimés tout de suite, réclamation laissée au balayage (< 3 h)", async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const { deps, repository, objects } = setup({ stored: svg });
    const ticket = await started(deps);
    expect(await finishContributionPhoto(deps, { slug: SLUG, mediaId: MEDIA, photoTicket: ticket, authorName: "Paul", formToken: token() })).toEqual({ status: "invalid", field: "photo" });
    expect(repository.finalizePhoto).not.toHaveBeenCalled();
    expect(deps.photoStore.replace).not.toHaveBeenCalled();
    expect(objects.has(PATH)).toBe(false);
    expect(deps.mediaSecurityRepository.reservePendingCleanup).toHaveBeenCalledWith({ memorialId: MEM, ownerId: OWNER, mediaId: MEDIA });
    expect(deps.mediaSecurityRepository.finishPendingCleanup).not.toHaveBeenCalled();
  });

  it("une réservation de plus de 3 h refusée est entièrement close (réclamation finie)", async () => {
    const { deps } = setup({ stored: new TextEncoder().encode("not an image"), media: media({ createdAt: new Date(NOW.getTime() - 4 * 3600_000).toISOString() }) });
    const ticket = await started(deps);
    await finishContributionPhoto(deps, { slug: SLUG, mediaId: MEDIA, photoTicket: ticket, authorName: "Paul", formToken: token() });
    expect(deps.mediaSecurityRepository.finishPendingCleanup).toHaveBeenCalledWith({ memorialId: MEM, ownerId: OWNER, claimId: "claim-1" });
  });

  it("au-delà de 15 Mo : refusé sans téléchargement ni décodage", async () => {
    const big = new Uint8Array(15 * 1024 * 1024 + 1);
    const { deps } = setup({ stored: big });
    const ticket = await started(deps);
    expect(await finishContributionPhoto(deps, { slug: SLUG, mediaId: MEDIA, photoTicket: ticket, authorName: "Paul", formToken: token() })).toEqual({ status: "invalid", field: "photo" });
    expect(deps.photoStore.download).not.toHaveBeenCalled();
    expect(deps.processPhoto).not.toHaveBeenCalled();
  });

  it("envoi pas encore terminé : upload_incomplete, la réservation reste pour un nouvel essai", async () => {
    const { deps } = setup({ stored: null });
    const ticket = await started(deps);
    expect(await finishContributionPhoto(deps, { slug: SLUG, mediaId: MEDIA, photoTicket: ticket, authorName: "Paul", formToken: token() })).toEqual({ status: "upload_incomplete" });
    expect(deps.mediaSecurityRepository.reservePendingCleanup).not.toHaveBeenCalled();
  });

  it("ticket d'une autre réservation, autre jeton, média d'une autre nature : refusé sans rien toucher", async () => {
    const raw = await exifJpeg(64, 64);
    const { deps, repository } = setup({ stored: raw });
    const ticket = await started(deps);
    const other = "55555555-5555-4555-8555-555555555555";
    expect(await finishContributionPhoto(deps, { slug: SLUG, mediaId: other, photoTicket: ticket, authorName: "P", formToken: token() })).toEqual({ status: "refused" });
    expect(await finishContributionPhoto(deps, { slug: SLUG, mediaId: MEDIA, photoTicket: ticket, authorName: "P", formToken: token(T0, SLUG, other) })).toEqual({ status: "refused" });
    expect(await finishContributionPhoto(deps, { slug: SLUG, mediaId: "../x", photoTicket: ticket, authorName: "P", formToken: token() })).toEqual({ status: "refused" });
    const gallery = setup({ stored: raw, media: media({ purpose: "gallery" }) });
    expect(await finishContributionPhoto(gallery.deps, { slug: SLUG, mediaId: MEDIA, photoTicket: ticket, authorName: "P", formToken: token() })).toEqual({ status: "refused" });
    expect(repository.finalizePhoto).not.toHaveBeenCalled();
    expect(deps.photoStore.download).not.toHaveBeenCalled();
    expect(gallery.deps.photoStore.download).not.toHaveBeenCalled();
  });

  it("légende : 150 caractères visibles acceptés, 151 refusés ; nom obligatoire", async () => {
    const { deps } = setup({ stored: await exifJpeg(64, 64) });
    const ticket = await started(deps);
    expect(await finishContributionPhoto(deps, { slug: SLUG, mediaId: MEDIA, photoTicket: ticket, authorName: "P", caption: "x".repeat(151), formToken: token() })).toEqual({ status: "invalid", field: "caption" });
    expect(await finishContributionPhoto(deps, { slug: SLUG, mediaId: MEDIA, photoTicket: ticket, authorName: " ", formToken: token() })).toEqual({ status: "invalid", field: "authorName" });
    expect(await finishContributionPhoto(deps, { slug: SLUG, mediaId: MEDIA, photoTicket: ticket, authorName: "P", caption: "x".repeat(150), formToken: token() })).toEqual({ status: "pending" });
  });

  it("rejeu après une réponse perdue : photo déjà prête, jamais retraitée, la base répond doublon", async () => {
    const { deps, repository } = setup({
      media: media({ status: "ready", mimeType: "image/webp", sizeBytes: 1234, width: 2000, height: 1500 }),
      repo: { finalizePhoto: vi.fn(async () => ({ outcome: "duplicate" as const, contributionId: "c1", status: "pending" as const })) },
    });
    const ticket = await started(deps);
    expect(await finishContributionPhoto(deps, { slug: SLUG, mediaId: MEDIA, photoTicket: ticket, authorName: "P", formToken: token() })).toEqual({ status: "pending" });
    expect(deps.photoStore.download).not.toHaveBeenCalled();
    expect(deps.photoStore.replace).not.toHaveBeenCalled();
    expect(repository.finalizePhoto).toHaveBeenCalledWith(expect.objectContaining({ sizeBytes: 1234, width: 2000, height: 1500 }));
  });

  it("catégorie désactivée entre la réservation et la finalisation : refus, la photo ne reste pas stockée", async () => {
    const { deps, objects } = setup({ stored: await exifJpeg(64, 64), repo: { finalizePhoto: vi.fn(async () => ({ outcome: "refused" as const, contributionId: null, status: null })) } });
    const ticket = await started(deps);
    expect(await finishContributionPhoto(deps, { slug: SLUG, mediaId: MEDIA, photoTicket: ticket, authorName: "P", formToken: token() })).toEqual({ status: "refused" });
    expect(objects.has(PATH)).toBe(false);
    expect(deps.mediaSecurityRepository.reservePendingCleanup).toHaveBeenCalled();
  });
});

describe("M8-E2 — lecture publique et Album (P1)", () => {
  const rows: PublicContributionRow[] = [
    { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", type: "photo", authorName: "A", content: null, caption: "Jardin", publishedAt: "2026-11-03T10:00:00Z", media: { mediaId: MEDIA, storagePath: PATH, width: 2000, height: 1500 } },
    { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", type: "condolence", authorName: "B", content: "Pensées", caption: null, publishedAt: "2026-11-02T10:00:00Z", media: null },
  ];

  it("photos servies par URL signée de 5 min, jamais par leur chemin ; textes tels quels", async () => {
    const { deps } = setup({ repo: { readPublic: vi.fn(async () => rows) } });
    const page = await readPublicContributions(deps, { slug: SLUG });
    expect(page).toEqual({
      items: [
        { id: rows[0].id, type: "photo", authorName: "A", text: null, caption: "Jardin", publishedAt: rows[0].publishedAt, photo: { url: `https://storage.test/signed/${PATH}?ttl=300`, width: 2000, height: 1500 } },
        { id: rows[1].id, type: "condolence", authorName: "B", text: "Pensées", caption: null, publishedAt: rows[1].publishedAt, photo: null },
      ],
      nextCursor: null,
    });
    expect(JSON.stringify(page)).not.toContain('"storagePath"');
    expect(deps.signPublicPhoto).toHaveBeenCalledWith(SLUG, PATH, true);
  });

  it("keeps the free photo signing path and withholds a premium photo denied at signing", async () => {
    const freePhoto = { ...rows[0], media: { ...rows[0].media!, requiresTermRecheck: false } };
    const { deps } = setup({ repo: { readPublic: vi.fn(async () => [freePhoto, rows[0]]) } });
    vi.mocked(deps.signPublicPhoto).mockResolvedValueOnce("https://storage.test/free").mockResolvedValueOnce(null);
    const page = await readPublicContributions(deps, { slug: SLUG });
    expect(deps.signPublicPhoto).toHaveBeenCalledWith(SLUG, PATH, false);
    expect(deps.signPublicPhoto).toHaveBeenCalledWith(SLUG, PATH, true);
    expect(page).toMatchObject({ items: [{ photo: { url: "https://storage.test/free" } }] });
  });

  it("page pleine → curseur (published_at, id) du dernier élément ; la page suivante le transmet", async () => {
    const readPublic = vi.fn(async () => rows);
    const { deps } = setup({ repo: { readPublic } });
    const page = await readPublicContributions(deps, { slug: SLUG, limit: 2 });
    if (!("items" in page)) throw new Error("expected a page");
    expect(decodeCursor(page.nextCursor)).toEqual({ publishedAt: rows[1].publishedAt, id: rows[1].id });
    await readPublicContributions(deps, { slug: SLUG, limit: 2, cursor: page.nextCursor });
    expect(readPublic).toHaveBeenLastCalledWith({ slug: SLUG, limit: 2, before: { publishedAt: rows[1].publishedAt, id: rows[1].id } });
  });

  it("limite bornée à [1, 100] ; curseur forgé ou slug forgé : refusé", async () => {
    const readPublic = vi.fn(async () => []);
    const { deps } = setup({ repo: { readPublic } });
    await readPublicContributions(deps, { slug: SLUG, limit: 10_000 });
    expect(readPublic).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 100 }));
    await readPublicContributions(deps, { slug: SLUG, limit: 0 });
    expect(readPublic).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 1 }));
    for (const cursor of ["x", encodeCursor({ publishedAt: "pas une date", id: MEDIA }), Buffer.from('["2026-01-01", "1; drop"]').toString("base64url")]) {
      expect(await readPublicContributions(deps, { slug: SLUG, cursor })).toEqual({ status: "refused" });
    }
    expect(await readPublicContributions(deps, { slug: "nope" })).toEqual({ status: "refused" });
  });
});

describe("M8-E3 — renouvellement des liens photo expirés", () => {
  const ID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const ID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const ID_GONE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const photoRow = (id: string, d: number): PublicContributionRow => ({
    id, type: "photo", authorName: "A", content: null, caption: null, publishedAt: `2026-11-${String(d).padStart(2, "0")}T10:00:00Z`,
    media: { mediaId: MEDIA, storagePath: `${MEM}/${id}/original.webp`, width: 10, height: 10 },
  });

  it("un nouveau lien seulement pour une photo toujours publiée ; les autres sont rendues « gone »", async () => {
    const readPublicByIds = vi.fn(async () => [photoRow(ID_A, 3)]);
    const { deps } = setup({ repo: { readPublicByIds } });
    const r = await renewPublicContributionPhotos(deps, { slug: SLUG, ids: [ID_A, ID_GONE] });
    expect(r).toEqual({ status: "ok", renewed: { [ID_A]: `https://storage.test/signed/${MEM}/${ID_A}/original.webp?ttl=300` }, gone: [ID_GONE] });
    // Relecture exacte des contributions demandées, où qu'elles soient dans l'Album (aucun parcours plafonné).
    expect(readPublicByIds).toHaveBeenCalledWith({ slug: SLUG, ids: [ID_A, ID_GONE] });
  });

  it("marks an expired premium photo gone when authorization fails at renewal", async () => {
    const { deps } = setup({ repo: { readPublicByIds: vi.fn(async () => [photoRow(ID_A, 3)]) } });
    vi.mocked(deps.signPublicPhoto).mockResolvedValueOnce(null);
    expect(await renewPublicContributionPhotos(deps, { slug: SLUG, ids: [ID_A] })).toEqual({ status: "ok", renewed: {}, gone: [ID_A] });
    expect(deps.signPublicPhoto).toHaveBeenCalledWith(SLUG, `${MEM}/${ID_A}/original.webp`, true);
  });

  it("une contribution relue qui n'est plus une photo ne reçoit aucun lien", async () => {
    const { deps } = setup({ repo: { readPublicByIds: vi.fn(async () => [{ ...photoRow(ID_B, 2), type: "condolence" as const, media: null, content: "x" }]) } });
    expect(await renewPublicContributionPhotos(deps, { slug: SLUG, ids: [ID_B] })).toEqual({ status: "ok", renewed: {}, gone: [ID_B] });
  });

  it("identifiants forgés, liste vide ou trop longue, slug forgé : refusé sans lecture", async () => {
    const readPublicByIds = vi.fn(async () => []);
    const { deps } = setup({ repo: { readPublicByIds } });
    for (const ids of [[], ["../x"], "abc", Array.from({ length: 101 }, () => ID_A)]) {
      expect(await renewPublicContributionPhotos(deps, { slug: SLUG, ids })).toEqual({ status: "refused" });
    }
    expect(await renewPublicContributionPhotos(deps, { slug: "nope", ids: [ID_A] })).toEqual({ status: "refused" });
    expect(readPublicByIds).not.toHaveBeenCalled();
  });

  it("jamais un chemin de stockage dans la réponse", async () => {
    const { deps } = setup({ repo: { readPublicByIds: vi.fn(async () => [photoRow(ID_A, 3)]) } });
    const r = await renewPublicContributionPhotos(deps, { slug: SLUG, ids: [ID_A] });
    expect(JSON.stringify(r)).not.toMatch(/storagePath|original\.webp"/);
  });
});

describe("M8-E4 — chargement initial sans plafond", () => {
  const row = (id: string, type: "condolence" | "testimonial" | "photo", d: number): PublicContributionRow => ({
    id, type, authorName: "A", content: type === "photo" ? null : "t", caption: null, publishedAt: `2026-11-${String(d).padStart(2, "0")}T10:00:00Z`,
    media: type === "photo" ? { mediaId: MEDIA, storagePath: `${MEM}/${id}/original.webp`, width: 10, height: 10 } : null,
  });
  const ID = (n: number) => `eeeeeeee-eeee-4eee-8eee-${String(n).padStart(12, "0")}`;

  it("une seule page lue avec la page ; la plus récente de chaque catégorie absente, pour la scène O8", async () => {
    const page = Array.from({ length: 100 }, (_, i) => row(ID(i), "condolence", 28));
    const readPublic = vi.fn(async (i: { types?: readonly string[] }) => (i.types?.[0] === "photo" ? [row(ID(900), "photo", 1)] : i.types ? [] : page));
    const { deps } = setup({ repo: { readPublic, readPublicOverview: vi.fn(async () => ({ categories: { condolences: true, stories: true, photos: true }, published: { condolences: 4000, stories: 0, photos: 3 } })) } });
    const r = await loadPublicContributionsInitial(deps, SLUG);
    expect(r).toMatchObject({ total: 4003, complete: false, items: expect.any(Array), sceneExtras: [expect.objectContaining({ id: ID(900), type: "photo" })] });
    expect(r!.items).toHaveLength(100);
    // 1 page + 1 lecture ciblée (photo) ; les récits n'ont rien de publié : aucune lecture.
    expect(readPublic).toHaveBeenCalledTimes(2);
    expect(readPublic).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 1, types: ["photo"] }));
  });

  it("aucune contribution publiée : aucune lecture de page", async () => {
    const readPublic = vi.fn();
    const { deps } = setup({ repo: { readPublic, readPublicOverview: vi.fn(async () => ({ categories: { condolences: true, stories: false, photos: false }, published: { condolences: 0, stories: 0, photos: 0 } })) } });
    expect(await loadPublicContributionsInitial(deps, SLUG)).toEqual({ categories: { condolences: true, stories: false, photos: false }, total: 0, items: [], sceneExtras: [], complete: true, nextCursor: null });
    expect(readPublic).not.toHaveBeenCalled();
  });
});
