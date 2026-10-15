"""Traditions & repères V2 — dérivations du décor vierge.

Lit le décor vierge de la variante (jamais modifié), vérifie son SHA-256,
puis dérive, avec la méthode du Récit de vie V2 et de l'Avis de décès V2 :

  1. la ligne de coupe : fenêtre de rangées où le décor porte le moins de
     détail net (écart à un flou gaussien σ = 3 supérieur à 14 niveaux),
     cherchée dans la plage `search` de la variante ;
  2. la teinte : médiane, colonne par colonne, des 50 rangées au-dessus
     du raccord haut et des 50 rangées sous le raccord bas, lissée
     (σ = 22 px), écrite en image W×2 étirée par le navigateur ;
  3. trois tuiles de grain : zones calmes du papier central, tendance
     basse fréquence retirée (σ = 24), centrées sur 128, raccordables par
     fondu de bord (jamais de miroir) ;
  4. gain de grain et compensation de teinte calibrés sur rendu ;
  5. la bande des bords : la grande feuille centrale a des bords déchirés
     verticaux (x ≈ 100 et 860) que la teinte lissée ne peut pas porter.
     Une bande pleine largeur est tirée des rangées calmes situées juste
     au-dessus de la fin du fondu bas [cut + fade − L, cut + fade), rendue
     raccordable verticalement par fondu (jamais de miroir), et opaque
     seulement sur les côtés (alpha 0 au centre, où la teinte et le grain
     prennent le relais). Posée en bas de la surface, elle continue
     exactement le bas authentique ; au raccord haut, le fondu l'absorbe.

Usage :
  python3 -I scripts/pilot/traditions-v2-derive.py <mobile-light> <decor.png> <dossier-de-sortie>

Le décor lui-même est copié octet pour octet à part (cp) ; ce script
n'écrit que la teinte et les grains, et imprime les réglages.
"""

import hashlib
import sys

import numpy as np
from PIL import Image, ImageFilter

PROFILE_ROWS = 50
PROFILE_SIGMA = 22
GRAIN_SIGMA = 24
OVERLAP = 48

VARIANTS = {
    # Mobile Light — papier ivoire central nu de x 140 à 820 entre les
    # rangées 260 et 1430. Coupe cherchée dans 840–980 : seule fenêtre où
    # les deux côtés sont calmes (bord déchiré et papier de fond nus, sans
    # feuillage flou à gauche ni bouquet ou papiers à droite : rangées
    # 720–990).
    "mobile-light": {
        "sha256": "203dfe8eb18c82b3c4ecdf0d78c9d2ee2cb08ff097d0bef83a67e7c8f40357b5",
        "fade": 40,
        "search": (840, 980),
        # Bande des bords : hauteur L ; opaque autour du bord gauche de la
        # feuille (x 92–165, fondus 80→92 et 165→200 : à l’extrême gauche,
        # un éclat de papier déchiré du fond se répéterait visiblement, la
        # teinte unie y suffit) et à droite dès x 825 (fondu depuis 790).
        "edge_strip": {"height": 220, "left": (80, 92, 165, 200), "right": (790, 825)},
        "grain_gain": 2.4,
        "tone_gain": (0.996, 0.991, 0.985),
        "grain_zones": {
            "a": (220, 650, 460, 620),
            "b": (260, 300, 400, 300),
            "c": (300, 980, 340, 340),
        },
    },
}


def sha256(path: str) -> str:
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def gaussian_1d(values: np.ndarray, sigma: float) -> np.ndarray:
    radius = int(sigma * 3)
    k = np.exp(-0.5 * (np.arange(-radius, radius + 1) / sigma) ** 2)
    k /= k.sum()
    padded = np.pad(values, ((radius, radius), (0, 0)), mode="edge")
    return np.stack([np.convolve(padded[:, c], k, mode="valid") for c in range(values.shape[1])], axis=1)


def find_cut(img: Image.Image, fade: int, search: tuple[int, int]) -> tuple[int, float]:
    lum = img.convert("L")
    sharp = np.abs(np.asarray(lum, dtype=float) - np.asarray(lum.filter(ImageFilter.GaussianBlur(3)), dtype=float)) > 14
    per_row = sharp.sum(axis=1)
    best = None
    for y in range(search[0] + fade, search[1] - fade):
        score = per_row[y - fade : y + fade].mean()
        if best is None or score < best[1]:
            best = (y, score)
    return best


def profile(rgb: np.ndarray, start: int) -> np.ndarray:
    return gaussian_1d(np.median(rgb[start : start + PROFILE_ROWS], axis=0), PROFILE_SIGMA)


def tone(rgb: np.ndarray, cut: int, fade: int, gain: tuple[float, float, float]) -> Image.Image:
    rows = np.stack([profile(rgb, cut - fade - PROFILE_ROWS), profile(rgb, cut + fade)]) * np.array(gain)
    return Image.fromarray(np.clip(np.round(rows), 0, 255).astype(np.uint8), "RGB")


def grain_tile(img: Image.Image, zone: tuple[int, int, int, int], gain: float) -> Image.Image:
    x, y, w, h = zone
    region = img.crop((x, y, x + w + OVERLAP, y + h + OVERLAP))
    arr = np.asarray(region, dtype=float)
    low = np.asarray(region.filter(ImageFilter.GaussianBlur(GRAIN_SIGMA)), dtype=float)
    detail = (arr - low) * gain
    ramp = np.linspace(0, 1, OVERLAP)[None, :, None]
    detail[:, :OVERLAP] = detail[:, :OVERLAP] * ramp + detail[:, w : w + OVERLAP] * (1 - ramp)
    detail = detail[:, :w]
    ramp_v = np.linspace(0, 1, OVERLAP)[:, None, None]
    detail[:OVERLAP] = detail[:OVERLAP] * ramp_v + detail[h : h + OVERLAP] * (1 - ramp_v)
    detail = detail[:h]
    return Image.fromarray(np.clip(np.round(128 + detail), 0, 255).astype(np.uint8), "RGB")


def edge_strip(img: Image.Image, cut: int, fade: int, cfg: dict) -> Image.Image:
    """Bande pleine largeur des rangées [cut + fade − L, cut + fade), rendue
    périodique verticalement : ses OVERLAP premières rangées sont fondues
    avec les OVERLAP rangées qui la SUIVENT dans le décor (calmes), de sorte
    qu'à chaque répétition sa dernière rangée enchaîne sur la suivante du
    décor. Alpha sur les côtés seulement."""
    height = cfg["height"]
    end = cut + fade
    start = end - height
    rgb = np.asarray(img, dtype=float)
    band = rgb[start:end].copy()
    after = rgb[end : end + OVERLAP]
    ramp = np.linspace(0, 1, OVERLAP)[:, None, None]
    band[:OVERLAP] = band[:OVERLAP] * ramp + after * (1 - ramp)
    width = band.shape[1]
    xs = np.arange(width, dtype=float)
    (a0, a1, l0, l1), (r0, r1) = cfg["left"], cfg["right"]
    left = np.minimum(np.clip((xs - a0) / (a1 - a0), 0, 1), np.clip((l1 - xs) / (l1 - l0), 0, 1))
    alpha = left + np.clip((xs - r0) / (r1 - r0), 0, 1)
    alpha = np.clip(alpha, 0, 1)
    rgba = np.dstack([np.clip(np.round(band), 0, 255), np.broadcast_to(np.round(alpha * 255), band.shape[:2])])
    return Image.fromarray(rgba.astype(np.uint8), "RGBA")


def main() -> None:
    variant, src, out = sys.argv[1], sys.argv[2], sys.argv[3]
    v = VARIANTS[variant]
    digest = sha256(src)
    if digest != v["sha256"]:
        sys.exit(f"SHA-256 inattendu : {digest}")
    img = Image.open(src).convert("RGB")
    rgb = np.asarray(img, dtype=float)
    cut, score = find_cut(img, v["fade"], v["search"])
    print(f"variante {variant} — canvas {img.width}x{img.height}")
    print(f"cutY {cut} (fondu {v['fade']}, détail net moyen {score:.1f} px/rangée)")
    tone_path = f"{out}/traditions-{variant}-tone.png"
    tone(rgb, cut, v["fade"], v["tone_gain"]).save(tone_path, optimize=True)
    print(f"tone {tone_path}")
    if "edge_strip" in v:
        strip = edge_strip(img, cut, v["fade"], v["edge_strip"])
        path = f"{out}/traditions-{variant}-edges.png"
        strip.save(path, optimize=True)
        print(f"edges {strip.width}x{strip.height} (rangées {cut + v['fade'] - strip.height}–{cut + v['fade']}) -> {path}")
    for name, zone in v["grain_zones"].items():
        tile = grain_tile(img, zone, v["grain_gain"])
        path = f"{out}/traditions-{variant}-grain-{name}.png"
        tile.save(path, optimize=True)
        print(f"grain {name} {tile.width}x{tile.height} écart-type {(np.asarray(tile, float) - 128).std():.2f} -> {path}")


if __name__ == "__main__":
    main()
