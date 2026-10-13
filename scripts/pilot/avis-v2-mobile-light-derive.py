"""Avis de décès V2 — pilote Mobile Light (phase 1) : dérivations du fond.

Lit le fond vierge Mobile Light original (jamais modifié), vérifie son
SHA-256, puis dérive — avec la méthode du Récit de vie V2
(config/recit-de-vie-v2-tokens.ts) :

  1. la ligne de coupe : fenêtre de rangées où les bords portent le moins
     de détail net (pixels dont l'écart à un flou gaussien σ=3 dépasse 14
     niveaux), recherchée entre les rangées 760 et 1120 ;
  2. la teinte : deux profils horizontaux — médiane, colonne par colonne,
     des 50 rangées juste au-dessus du raccord haut [cut-fade-50, cut-fade]
     et des 50 rangées juste sous le raccord bas [cut+fade, cut+fade+50],
     lissées (σ = 22 px) —, écrits comme une image 941×2 que le navigateur
     étire sur toute la surface : chaque raccord retrouve exactement la
     teinte du Master qu'il touche, et la surface passe de l'une à l'autre
     sans arête (le bord gauche du Master s'assombrit sous la coupe —
     marguerite floue —, le bord droit s'éclaircit — bord déchiré) ;
  3. trois tuiles de grain : zones calmes du papier central, tendance
     basse fréquence retirée (flou σ = 24), centrées sur 128, rendues
     raccordables par fondu de bord — jamais en miroir —, tailles
     premières entre elles. Gain GRAIN_GAIN : en mode « overlay », un papier
     clair (≈ 0,9) ne restitue que ~2 × (1 − 0,9) = 0,2 de l'écart du
     grain ; le gain est calibré sur rendu pour que la texture de la surface
     (écart-type passe-haut, σ = 24) rejoigne celle du Master (≈ 2,0).
  4. la compensation de teinte TONE_GAIN : les couches de grain et de bruit
     éclaircissent légèrement la surface ; la teinte est corrigée, canal par
     canal, de l'écart mesuré sur rendu (comme le × 0,875 du Récit V2).

Usage :
  python3 -I scripts/pilot/avis-v2-mobile-light-derive.py <fond.png> <dossier-de-sortie>

Le fond lui-même est copié octet pour octet à part (cp) : ce script
n'écrit que l'image de teinte et les tuiles de grain, et imprime les
réglages à reporter dans config/death-notice-v2-tokens.ts.
"""

import hashlib
import sys

import numpy as np
from PIL import Image, ImageFilter

EXPECTED_SHA256 = "757fab95d4094a9fcf3ee3c651b1b3c962a0a723a781a3ccde14f89608fb3e6a"
FADE = 40
SEARCH = (760, 1120)
PROFILE_ROWS = 50
PROFILE_SIGMA = 22
GRAIN_SIGMA = 24
GRAIN_GAIN = 2.4
TONE_GAIN = (0.996, 0.991, 0.985)
OVERLAP = 48
# (x, y, largeur, hauteur) dans le papier central nu (x 0,25–0,75 : aucun
# feuillage net, écart moyen au flou < 3 niveaux sur toute la hauteur).
GRAIN_ZONES = {
    "a": (236, 560, 460, 620),
    "b": (262, 300, 400, 540),
    "c": (292, 800, 340, 460),
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


def find_cut(img: Image.Image) -> tuple[int, float]:
    lum = img.convert("L")
    sharp = np.abs(np.asarray(lum, dtype=float) - np.asarray(lum.filter(ImageFilter.GaussianBlur(3)), dtype=float)) > 14
    per_row = sharp.sum(axis=1)
    best = None
    for y in range(SEARCH[0] + FADE, SEARCH[1] - FADE):
        score = per_row[y - FADE : y + FADE].mean()
        if best is None or score < best[1]:
            best = (y, score)
    return best


def profile(rgb: np.ndarray, start: int) -> np.ndarray:
    col = np.median(rgb[start : start + PROFILE_ROWS], axis=0)
    return gaussian_1d(col, PROFILE_SIGMA)


def tone(rgb: np.ndarray, cut: int) -> Image.Image:
    top = profile(rgb, cut - FADE - PROFILE_ROWS)
    bottom = profile(rgb, cut + FADE)
    rows = np.stack([top, bottom]) * np.array(TONE_GAIN)
    return Image.fromarray(np.clip(np.round(rows), 0, 255).astype(np.uint8), "RGB")


def grain_tile(img: Image.Image, zone: tuple[int, int, int, int]) -> Image.Image:
    x, y, w, h = zone
    region = img.crop((x, y, x + w + OVERLAP, y + h + OVERLAP))
    arr = np.asarray(region, dtype=float)
    low = np.asarray(region.filter(ImageFilter.GaussianBlur(GRAIN_SIGMA)), dtype=float)
    detail = (arr - low) * GRAIN_GAIN
    # Raccord horizontal puis vertical par fondu de bord (jamais de miroir).
    ramp = np.linspace(0, 1, OVERLAP)[None, :, None]
    detail[:, :OVERLAP] = detail[:, :OVERLAP] * ramp + detail[:, w : w + OVERLAP] * (1 - ramp)
    detail = detail[:, :w]
    ramp_v = np.linspace(0, 1, OVERLAP)[:, None, None]
    detail[:OVERLAP] = detail[:OVERLAP] * ramp_v + detail[h : h + OVERLAP] * (1 - ramp_v)
    detail = detail[:h]
    return Image.fromarray(np.clip(np.round(128 + detail), 0, 255).astype(np.uint8), "RGB")


def main() -> None:
    src, out = sys.argv[1], sys.argv[2]
    digest = sha256(src)
    if digest != EXPECTED_SHA256:
        sys.exit(f"SHA-256 inattendu : {digest}")
    img = Image.open(src).convert("RGB")
    rgb = np.asarray(img, dtype=float)
    cut, score = find_cut(img)
    print(f"canvas {img.width}x{img.height}")
    print(f"cutY {cut} (fondu {FADE}, détail net moyen {score:.1f} px/rangée)")
    tone_path = f"{out}/avis-mobile-light-tone.png"
    tone(rgb, cut).save(tone_path, optimize=True)
    print(f"tone {tone_path}")
    for name, zone in GRAIN_ZONES.items():
        tile = grain_tile(img, zone)
        path = f"{out}/avis-mobile-light-grain-{name}.png"
        tile.save(path, optimize=True)
        dev = np.asarray(tile, dtype=float) - 128
        print(f"grain {name} {tile.width}x{tile.height} écart-type {dev.std():.2f} -> {path}")


if __name__ == "__main__":
    main()
