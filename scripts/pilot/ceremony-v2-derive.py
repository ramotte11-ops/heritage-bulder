"""Cérémonie Intemporel V2 — dérivations du décor vierge (pilote C1).

Lit le décor runtime vierge de la variante (jamais modifié), vérifie son
SHA-256, puis dérive, avec la méthode éprouvée sur Traditions V2
(scripts/pilot/traditions-v2-derive.py) :

  1. la ligne de coupe : fenêtre de rangées où le décor porte le moins de
     détail net (écart à un flou gaussien σ = 3 supérieur à 14 niveaux),
     cherchée dans la plage `search` de la variante ;
  2. la teinte : médiane, colonne par colonne, des 50 rangées au-dessus
     du raccord haut et des 50 rangées sous le raccord bas, lissée
     (σ = 22 px), écrite en image W×2 étirée par le navigateur ;
  3. trois tuiles de grain : zones calmes de la grande feuille centrale,
     tendance basse fréquence retirée (σ = 24), centrées sur 128,
     raccordables par fondu de bord (jamais de miroir) ;
  4. la bande des bords : les bords déchirés verticaux de la grande
     feuille (x ≈ 113 et 843), tirés des rangées [cut + fade − L,
     cut + fade), rendus périodiques par fondu avec les rangées qui les
     suivent, opaques sur le seul liseré.

Usage :
  python3 -I scripts/pilot/ceremony-v2-derive.py mobile-light <decor.png> <dossier-de-sortie>

Le décor lui-même est copié octet pour octet à part (cp) ; ce script
n'écrit que la teinte, les grains et la bande des bords, et imprime les
réglages.
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
    # Mobile Light (941×1671) — grande feuille ivoire nue de x 114 à 842
    # entre les rangées 130 et 1550. Au-dessus de la coupe, bouquet et
    # sceau en haut, papier vert à gauche (rangées 785–875) ; en dessous,
    # grande feuille du bouquet bas gauche dès la rangée 930 et papiers
    # en diagonale à droite. La fenêtre la moins nette (986) tranche
    # cette feuille : rejetée. Recherche dans 830–870 : seule fenêtre où
    # les profils de part et d'autre du raccord se suivent à la fois à
    # gauche (collage de papiers) et à droite (papiers en diagonale), et
    # où rien de figuratif n'est coupé.
    "mobile-light": {
        "sha256": "254a036942b2a1102bf03a5bc308190b88ece96b1c1ec44b4331a508b7bca002",
        "fade": 40,
        "search": (790, 910),
        # Bande des bords : liseré déchiré de la feuille seul (gauche
        # x 113–124, fondus 110→113 et 124→134 ; droite x 836–846, fondus
        # 830→836 et 846→852). Juste à gauche du liseré, le papier vert
        # (rangées 785–875) se répéterait en damier, et au-delà des deux
        # liserés le collage de papiers aussi : la teinte et le grain y
        # suffisent.
        # Voile de luminance : dans la bande, tout pixel plus sombre que
        # 90 (papier vert, encoches) devient transparent, plein dès 140 —
        # sans lui, ces éclats se répètent en encoches tous les 220 px.
        "edge_strip": {
            "height": 220,
            "left": (112, 115, 124, 134),
            "right": (830, 836, 846, 852),
            "veil": (90, 140),
        },
        # Hors des deux liserés, au-dessus de la coupe, l'ombre du papier
        # vert (à gauche x < 110, à droite x > 840) assombrit le profil
        # haut ; étiré sur toute la surface, il dessinerait une colonne
        # d'ombre. Teinte du dessous seulement : x < 108 (fondu jusqu'à
        # 122) et x > 838 (fondu depuis 826).
        "tone_below": {"left": (108, 122), "right": (826, 838)},
        "grain_gain": 2.4,
        "tone_gain": (1.0, 1.0, 1.0),
        "grain_zones": {
            "a": (180, 480, 460, 420),
            "b": (250, 1000, 400, 300),
            "c": (420, 300, 340, 160),
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
    """Rangée de coupe : détail net minimal dans la fenêtre du fondu,
    départagé par la continuité des profils de teinte sur les bords
    (x < 115 et x > 840), là où le décor reste visible autour des
    cartouches."""
    lum = img.convert("L")
    sharp = np.abs(np.asarray(lum, dtype=float) - np.asarray(lum.filter(ImageFilter.GaussianBlur(3)), dtype=float)) > 14
    rgb = np.asarray(img, dtype=float)
    per_row = sharp.sum(axis=1)
    best = None
    for y in range(search[0] + fade, search[1] - fade + 1):
        detail = per_row[y - fade : y + fade].mean()
        up = np.median(rgb[y - fade - PROFILE_ROWS : y - fade], axis=0)
        down = np.median(rgb[y + fade : y + fade + PROFILE_ROWS], axis=0)
        gap = np.abs(up - down).mean(axis=1)
        sides = (gap[:115].mean() + gap[840:].mean()) / 2
        score = detail + sides
        if best is None or score < best[1]:
            best = (y, score, detail, sides)
    return best


def profile(rgb: np.ndarray, start: int) -> np.ndarray:
    return gaussian_1d(np.median(rgb[start : start + PROFILE_ROWS], axis=0), PROFILE_SIGMA)


def tone(rgb: np.ndarray, cut: int, fade: int, gain: tuple[float, float, float], below: dict | None = None) -> Image.Image:
    rows = np.stack([profile(rgb, cut - fade - PROFILE_ROWS), profile(rgb, cut + fade)])
    if below is not None:
        # Aux bords extérieurs, la teinte du dessous seulement : ce qui est
        # au-dessus de la coupe (ombre du papier vert) ne s'étire pas.
        xs = np.arange(rgb.shape[1], dtype=float)
        l0, l1 = below["left"]
        r0, r1 = below["right"]
        w = np.maximum(np.clip((l1 - xs) / (l1 - l0), 0, 1), np.clip((xs - r0) / (r1 - r0), 0, 1))[:, None]
        rows[0] = rows[0] * (1 - w) + rows[1] * w
    rows = rows * np.array(gain)
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
    avec les OVERLAP rangées qui la SUIVENT dans le décor, de sorte qu'à
    chaque répétition sa dernière rangée enchaîne sur la suivante du
    décor. Alpha sur les deux liserés seulement."""
    height = cfg["height"]
    end = cut + fade
    start = end - height
    rgb = np.asarray(img, dtype=float)
    ov = min(OVERLAP, height // 2)
    band = rgb[start:end].copy()
    after = rgb[end : end + ov]
    ramp = np.linspace(0, 1, ov)[:, None, None]
    band[:ov] = band[:ov] * ramp + after * (1 - ramp)
    xs = np.arange(band.shape[1], dtype=float)

    def bounded(a0: float, a1: float, b0: float, b1: float) -> np.ndarray:
        return np.minimum(np.clip((xs - a0) / (a1 - a0), 0, 1), np.clip((b1 - xs) / (b1 - b0), 0, 1))

    alpha = np.clip(bounded(*cfg["left"]) + bounded(*cfg["right"]), 0, 1)
    alpha = np.broadcast_to(alpha, band.shape[:2])
    if "veil" in cfg:
        v0, v1 = cfg["veil"]
        alpha = alpha * np.clip((band.mean(axis=2) - v0) / (v1 - v0), 0, 1)
    rgba = np.dstack([np.clip(np.round(band), 0, 255), np.round(alpha * 255)])
    return Image.fromarray(rgba.astype(np.uint8), "RGBA")


def main() -> None:
    variant, src, out = sys.argv[1], sys.argv[2], sys.argv[3]
    v = VARIANTS[variant]
    digest = sha256(src)
    if digest != v["sha256"]:
        sys.exit(f"SHA-256 inattendu : {digest}")
    img = Image.open(src).convert("RGB")
    rgb = np.asarray(img, dtype=float)
    cut, score, detail, sides = find_cut(img, v["fade"], v["search"])
    print(f"variante {variant} — canvas {img.width}x{img.height}")
    print(f"cutY {cut} (fondu {v['fade']}, détail net moyen {detail:.1f} px/rangée, écart des profils aux bords {sides:.1f})")
    tone_path = f"{out}/ceremony-{variant}-tone.png"
    tone(rgb, cut, v["fade"], v["tone_gain"], v.get("tone_below")).save(tone_path, optimize=True)
    print(f"tone {tone_path}")
    strip = edge_strip(img, cut, v["fade"], v["edge_strip"])
    path = f"{out}/ceremony-{variant}-edges.png"
    strip.save(path, optimize=True)
    print(f"edges {strip.width}x{strip.height} (rangées {cut + v['fade'] - strip.height}–{cut + v['fade']}) -> {path}")
    for name, zone in v["grain_zones"].items():
        tile = grain_tile(img, zone, v["grain_gain"])
        path = f"{out}/ceremony-{variant}-grain-{name}.png"
        tile.save(path, optimize=True)
        print(f"grain {name} {tile.width}x{tile.height} écart-type {(np.asarray(tile, float) - 128).std():.2f} -> {path}")


if __name__ == "__main__":
    main()
