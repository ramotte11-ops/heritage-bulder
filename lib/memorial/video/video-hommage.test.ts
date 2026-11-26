import { describe, expect, it } from "vitest";
import {
  admitVideo,
  countCharacters,
  countedHostedDurationSeconds,
  formatVideoDuration,
  isVideoCollectionWithinLimits,
  limitVideoTitleInput,
  moveVideo,
  normalizeVideoTitle,
  removeVideo,
  replaceVideo,
  videoDisplayTitle,
  videoHommageBudget,
  VIDEO_HOMMAGE_MAX_TITLE_LENGTH,
} from "./video-hommage";

const souvenir = (position: number) => `Souvenir ${position}`;
const item = (id: string, durationSeconds: number | null) => ({ id, durationSeconds });

describe("titres", () => {
  it("garde un titre court, retire les espaces superflus", () => {
    expect(normalizeVideoTitle("  À   la plage  ")).toBe("À la plage");
    expect(normalizeVideoTitle("Ligne\nsuivante")).toBe("Ligne suivante");
  });

  it("un titre vide ou absent redonne l'intitulé automatique", () => {
    expect(normalizeVideoTitle("   ")).toBeNull();
    expect(normalizeVideoTitle(null)).toBeNull();
    expect(videoDisplayTitle({ title: "  " }, 1, souvenir)).toBe("Souvenir 2");
  });

  it("coupe à 30 caractères, espaces compris, en comptant les caractères visibles", () => {
    const long = "Les quatre-vingts ans de Mamie à Biarritz";
    const cut = normalizeVideoTitle(long)!;
    expect(countCharacters(cut)).toBeLessThanOrEqual(VIDEO_HOMMAGE_MAX_TITLE_LENGTH);
    expect(long.startsWith(cut)).toBe(true);
    const accents = "é".repeat(31);
    expect(countCharacters(normalizeVideoTitle(accents)!)).toBe(30);
    const emoji = "👨‍👩‍👧".repeat(31);
    expect(countCharacters(normalizeVideoTitle(emoji)!)).toBe(30);
  });

  it("la saisie garde ses espaces mais reste limitée à 30 caractères", () => {
    expect(limitVideoTitleInput("À la ")).toBe("À la ");
    expect(countCharacters(limitVideoTitleInput("x".repeat(40)))).toBe(30);
  });

  it("l'intitulé automatique suit la position actuelle", () => {
    const list = [{ title: "Anniversaire" }, { title: null }, { title: null }];
    expect(list.map((entry, index) => videoDisplayTitle(entry, index, souvenir))).toEqual(["Anniversaire", "Souvenir 2", "Souvenir 3"]);
    const moved = moveVideo(list, 2, 0);
    expect(moved.map((entry, index) => videoDisplayTitle(entry, index, souvenir))).toEqual(["Souvenir 1", "Anniversaire", "Souvenir 3"]);
  });
});

describe("durées affichées", () => {
  it("minutes et secondes entières", () => {
    expect(formatVideoDuration(268.9)).toBe("4:28");
    expect(formatVideoDuration(600)).toBe("10:00");
    expect(formatVideoDuration(5)).toBe("0:05");
    expect(formatVideoDuration(null)).toBeNull();
    expect(formatVideoDuration(Number.NaN)).toBeNull();
  });
});

describe("limites : 3 vidéos, 600 secondes strictes", () => {
  it("accepte une répartition libre jusqu'à 600 s pile", () => {
    expect(admitVideo([], 600).ok).toBe(true);
    expect(admitVideo([item("a", 420)], 180).ok).toBe(true);
    expect(admitVideo([item("a", 240), item("b", 240)], 120).ok).toBe(true);
  });

  it("refuse 600,001 s : aucune tolérance", () => {
    expect(admitVideo([], 600.001)).toEqual({ ok: false, reason: "too-long", durationSeconds: 600.001, remainingSeconds: 600 });
    expect(admitVideo([item("a", 300)], 300.0005).ok).toBe(false);
  });

  it("refuse une quatrième vidéo", () => {
    expect(admitVideo([item("a", 10), item("b", 10), item("c", 10)], 1)).toEqual({ ok: false, reason: "too-many-videos" });
  });

  it("refuse une durée inconnue", () => {
    expect(admitVideo([], null)).toEqual({ ok: false, reason: "duration-unknown" });
  });

  it("un remplacement libère d'abord la place et le temps de l'ancienne vidéo", () => {
    const list = [item("a", 400), item("b", 100), item("c", 100)];
    expect(admitVideo(list, 300).ok).toBe(false);
    expect(admitVideo(list, 400, "a").ok).toBe(true);
    expect(admitVideo(list, 400.5, "a").ok).toBe(false);
  });

  it("la suppression rend les minutes", () => {
    const list = [item("a", 400), item("b", 200)];
    expect(videoHommageBudget(list).remainingSeconds).toBe(0);
    expect(videoHommageBudget(removeVideo(list, "a")).remainingSeconds).toBe(400);
  });

  it("le cumul se calcule sans erreur d'arrondi flottant", () => {
    const thirds = [item("a", 200.1), item("b", 200.2), item("c", 199.7)];
    expect(isVideoCollectionWithinLimits(thirds)).toBe(true);
    expect(isVideoCollectionWithinLimits([...thirds.slice(0, 2), item("c", 199.7001)])).toBe(false);
  });

  it("une vidéo sans durée occupe une place mais pas de temps", () => {
    const budget = videoHommageBudget([item("a", null)]);
    expect(budget).toMatchObject({ count: 1, usedSeconds: 0, remainingSeconds: 600, canAddAnother: true });
  });
});

describe("ordre, remplacement, retrait", () => {
  it("déplace sans modifier l'entrée", () => {
    const list = ["a", "b", "c"];
    expect(moveVideo(list, 0, 2)).toEqual(["b", "c", "a"]);
    expect(list).toEqual(["a", "b", "c"]);
    expect(moveVideo(list, 0, 5)).toEqual(["a", "b", "c"]);
  });

  it("remplace à la même position", () => {
    const list = [{ id: "a" }, { id: "b" }];
    expect(replaceVideo(list, "a", { id: "z" })).toEqual([{ id: "z" }, { id: "b" }]);
  });
});

describe("durée comptée d'une vidéo hébergée (mesures VID-04B)", () => {
  it("compte la piste image : 10:00 pile n'est pas refusée pour deux images de traitement", () => {
    // 30 i/s : durée globale = piste image + 2/30 s.
    expect(countedHostedDurationSeconds({ assetDurationSeconds: 600.066667, videoTrackDurationSeconds: 600, frameRate: 30 })).toBeCloseTo(600, 3);
    expect(countedHostedDurationSeconds({ assetDurationSeconds: 120.033333, videoTrackDurationSeconds: 120, frameRate: 60 })).toBeCloseTo(120, 3);
  });

  it("reproduit les mesures réelles de la phase 2", () => {
    expect(countedHostedDurationSeconds({ assetDurationSeconds: 60.066667, videoTrackDurationSeconds: 60, frameRate: 30 })).toBeCloseTo(60, 3);
    expect(countedHostedDurationSeconds({ assetDurationSeconds: 90.056633, videoTrackDurationSeconds: 89.9899, frameRate: 29.97 })).toBeCloseTo(89.99, 2);
  });

  it("un son plus long que l'image est compté", () => {
    // Piste image 600 s, son jusqu'à 601 s : durée globale 601,0667 s.
    expect(countedHostedDurationSeconds({ assetDurationSeconds: 601.066667, videoTrackDurationSeconds: 600, frameRate: 30 })).toBeCloseTo(601, 3);
  });

  it("sans piste image ou sans fréquence connue, la durée globale est comptée telle quelle", () => {
    expect(countedHostedDurationSeconds({ assetDurationSeconds: 600.066667 })).toBe(600.066667);
    expect(countedHostedDurationSeconds({ assetDurationSeconds: 600.066667, videoTrackDurationSeconds: 600, frameRate: 0 })).toBe(600.066667);
  });
});
