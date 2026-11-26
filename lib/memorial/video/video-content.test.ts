import { describe, expect, it, vi } from "vitest";
import type { MemorialContent } from "@/types/memorial";
import {
  admitDraftVideo,
  createVideoDraftId,
  inspectVideoContent,
  videoDraftBudget,
  videoDraftCompliance,
  writeVideoItems,
  type VideoDraftItem,
} from "./video-content";
import { createLocalVideoRegistry } from "./local-video-registry";
import { isVideoFile } from "./local-video";

const item = (id: string, durationSeconds: number | null, title: string | null = null): VideoDraftItem => ({ id: `v-${id}`, title, durationSeconds });

describe("VID-06 — contenu vidéo du brouillon", () => {
  it("absent : aucune vidéo", () => {
    expect(inspectVideoContent({} as MemorialContent)).toEqual({ status: "absent", items: [] });
  });

  it("lit les vidéos dans l'ordre de la famille", () => {
    const content = { video: { items: [item("a", 268.4, "Son anniversaire"), item("b", null)] } } as unknown as MemorialContent;
    expect(inspectVideoContent(content)).toEqual({ status: "valid", items: [item("a", 268.4, "Son anniversaire"), item("b", null)] });
  });

  it.each([
    ["video n'est pas un objet", { video: [] }],
    ["items absent", { video: {} }],
    ["quatre vidéos", { video: { items: [item("a", 1), item("b", 1), item("c", 1), item("d", 1)] } }],
    ["identifiant invalide", { video: { items: [{ id: "abc", title: null, durationSeconds: 1 }] } }],
    ["identifiant en double", { video: { items: [item("a", 1), item("a", 2)] } }],
    ["durée nulle (jamais zéro)", { video: { items: [{ id: "v-a", title: null, durationSeconds: 0 }] } }],
    ["durée négative", { video: { items: [{ id: "v-a", title: null, durationSeconds: -3 }] } }],
    ["durée non numérique", { video: { items: [{ id: "v-a", title: null, durationSeconds: "60" }] } }],
    ["titre de 31 caractères", { video: { items: [{ id: "v-a", title: "x".repeat(31), durationSeconds: 1 }] } }],
    ["titre non normalisé", { video: { items: [{ id: "v-a", title: "  À la plage ", durationSeconds: 1 }] } }],
    ["titre vide (doit être null)", { video: { items: [{ id: "v-a", title: "", durationSeconds: 1 }] } }],
  ])("corrompu : %s", (_label, content) => {
    expect(inspectVideoContent(content as unknown as MemorialContent)).toEqual({ status: "corrupted" });
  });

  it("titre de 30 caractères exactement accepté, émojis comptés comme une personne les compte", () => {
    const thirty = "Les 80 ans de Mamie à Biarritz";
    expect([...new Intl.Segmenter("fr", { granularity: "grapheme" }).segment(thirty)]).toHaveLength(30);
    expect(inspectVideoContent({ video: { items: [item("a", 1, thirty)] } } as unknown as MemorialContent).status).toBe("valid");
    expect(inspectVideoContent({ video: { items: [item("a", 1, "👨‍👩‍👧".repeat(30))] } } as unknown as MemorialContent).status).toBe("valid");
  });

  it("écriture : ordre, titres normalisés, autres clés du brouillon et clés futures conservées", () => {
    const content = {
      hero: { displayName: "Élise" },
      video: { schema: 1, items: [{ ...item("a", 10), hosted: { status: "future" } }] },
    } as unknown as MemorialContent;
    const next = writeVideoItems(content, [item("b", 20, "  À   la plage  "), item("a", 10, "")]);
    expect(next).toEqual({
      hero: { displayName: "Élise" },
      video: { schema: 1, items: [item("b", 20, "À la plage"), { ...item("a", 10), hosted: { status: "future" } }] },
    });
    expect(content.video).toEqual({ schema: 1, items: [{ ...item("a", 10), hosted: { status: "future" } }] });
    expect(inspectVideoContent(next).status).toBe("valid");
  });

  it("identifiant local au format attendu", () => {
    expect(createVideoDraftId(() => "0f2c-41")).toBe("v-0f2c-41");
    expect(inspectVideoContent(writeVideoItems({} as MemorialContent, [{ id: createVideoDraftId(), title: null, durationSeconds: 5 }])).status).toBe("valid");
  });
});

describe("VID-06 — limites : 3 vidéos, 600 s cumulées, aucune limite individuelle", () => {
  it("une seule vidéo de 10 minutes passe", () => {
    expect(admitDraftVideo([], 600)).toEqual({ ok: true, durationVerified: true });
  });

  it("trois vidéos acceptées, la quatrième refusée", () => {
    const three = [item("a", 60), item("b", 60), item("c", 60)];
    expect(admitDraftVideo(three.slice(0, 2), 60)).toEqual({ ok: true, durationVerified: true });
    expect(admitDraftVideo(three, 1)).toEqual({ ok: false, reason: "too-many-videos" });
    expect(admitDraftVideo(three, null)).toEqual({ ok: false, reason: "too-many-videos" });
  });

  it("cumul inférieur, égal et supérieur à 600 s", () => {
    const used = [item("a", 400)];
    expect(admitDraftVideo(used, 199.999).ok).toBe(true);
    expect(admitDraftVideo(used, 200)).toEqual({ ok: true, durationVerified: true });
    expect(admitDraftVideo(used, 200.001)).toEqual({ ok: false, reason: "too-long", durationSeconds: 200.001, remainingSeconds: 200 });
    expect(videoDraftCompliance([item("a", 400), item("b", 200)])).toBe("within");
    expect(videoDraftCompliance([item("a", 400), item("b", 200.001)])).toBe("over");
  });

  it("plus une seconde disponible : toute vidéo est refusée, même de durée inconnue", () => {
    expect(admitDraftVideo([item("a", 600)], 1)).toEqual({ ok: false, reason: "no-time-left" });
    expect(admitDraftVideo([item("a", 600)], null)).toEqual({ ok: false, reason: "no-time-left" });
  });

  it("durée indisponible : acceptée mais jamais comptée comme zéro ni déclarée conforme", () => {
    expect(admitDraftVideo([item("a", 100)], null)).toEqual({ ok: true, durationVerified: false });
    const items = [item("a", 100), item("b", null)];
    expect(videoDraftBudget(items)).toEqual({ count: 2, knownSeconds: 100, unknownCount: 1, remainingSeconds: 500, canAddAnother: true });
    expect(videoDraftCompliance(items)).toBe("unverified");
    expect(videoDraftCompliance([])).toBe("empty");
  });

  it("remplacement : la vidéo remplacée ne compte plus", () => {
    const items = [item("a", 500), item("b", 100)];
    expect(admitDraftVideo(items, 450, "v-a").ok).toBe(true);
    expect(admitDraftVideo(items, 501, "v-a")).toEqual({ ok: false, reason: "too-long", durationSeconds: 501, remainingSeconds: 500 });
    expect(admitDraftVideo([item("a", 1), item("b", 1), item("c", 1)], 5, "v-b").ok).toBe(true);
  });
});

describe("VID-06 — fichiers locaux, le temps de la page", () => {
  const handle = (url: string) => ({ url, metadata: { durationSeconds: 3, width: 1, height: 1, playable: true }, release: vi.fn() });

  it("remplacer ou retirer libère l'adresse blob:", () => {
    const registry = createLocalVideoRegistry();
    const first = handle("blob:1");
    const second = handle("blob:2");
    registry.set("v-a", first);
    registry.set("v-a", second);
    expect(first.release).toHaveBeenCalledTimes(1);
    expect(registry.get("v-a")?.url).toBe("blob:2");
    registry.release("v-a");
    expect(second.release).toHaveBeenCalledTimes(1);
    expect(registry.has("v-a")).toBe(false);
    registry.release("v-a");
    expect(second.release).toHaveBeenCalledTimes(1);
  });

  it("ne garde que les vidéos encore présentes dans le brouillon", () => {
    const registry = createLocalVideoRegistry();
    const a = handle("blob:a");
    const b = handle("blob:b");
    registry.set("v-a", a);
    registry.set("v-b", b);
    registry.retainOnly(["v-b"]);
    expect(a.release).toHaveBeenCalledTimes(1);
    expect(b.release).not.toHaveBeenCalled();
    expect(registry.size()).toBe(1);
  });

  it.each([
    [{ type: "video/mp4", name: "a.mp4" }, true],
    [{ type: "video/quicktime", name: "IMG_0001.MOV" }, true],
    [{ type: "", name: "IMG_0001.MOV" }, true],
    [{ type: "", name: "clip.3gp" }, true],
    [{ type: "", name: "notes.txt" }, false],
    [{ type: "image/jpeg", name: "photo.mov" }, false],
    [{ type: "application/pdf", name: "x.pdf" }, false],
  ])("reconnaissance des vidéos : %o → %s", (file, expected) => {
    expect(isVideoFile(file)).toBe(expected);
  });
});
