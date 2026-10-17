"""Avis de décès V2 — dérivations des fonds (Mobile Light, Mobile Dark,
Desktop Light, Desktop Dark).

Lit le fond vierge de la variante (jamais modifié), vérifie son SHA-256,
puis dérive — avec la méthode du Récit de vie V2
(config/recit-de-vie-v2-tokens.ts), réglages PROPRES à chaque variante
(table VARIANTS ; aucun réglage n'est recopié d'une variante à l'autre) :

  1. la ligne de coupe : fenêtre de rangées où les bords portent le moins
     de détail net (pixels dont l'écart à un flou gaussien σ=3 dépasse 14
     niveaux), recherchée dans la plage `search` de la variante ;
  2. la teinte : deux profils horizontaux — médiane, colonne par colonne,
     des 50 rangées juste au-dessus du raccord haut [cut-fade-50, cut-fade]
     et des 50 rangées juste sous le raccord bas [cut+fade, cut+fade+50],
     lissées (σ = 22 px) —, écrits comme une image W×2 que le navigateur
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

Desktop Light (phase 4) : le fond horizontal porte du décor net sur ses
deux bords à toutes les hauteurs — à gauche les feuillets écrits (rangées
250–460) puis le bouquet (470–780), à droite le brin fleuri (390–560) puis
le bouquet (650–941). Aucune rangée unique ne traverse les deux bords sans
couper un ornement. La surface s'ouvre donc à DEUX coupes, une par zone
(`zones` : gauche entre feuillets et bouquet, droite sous le brin fleuri),
chacune cherchée sur les seules colonnes de sa zone ; les deux piles se
raccordent par un fondu vertical dans le papier nu du centre. La teinte
est celle du PAPIER seul (pixels sans détail net, clairs, non saturés),
interpolée sous le décor et prolongée jusqu'aux bords : aucune couleur
de fleur ou de feuille n'est étirée dans la surface.

Usage :
  python3 -I scripts/pilot/avis-v2-derive.py <mobile-light|mobile-dark|desktop-light|desktop-dark> <fond.png> <dossier-de-sortie>

Mobile Light (phases 1-2) et Mobile Dark (phase 3), validés PO :
réglages inchangés ; leurs fichiers régénérés sont identiques octet pour
octet à ceux du dépôt.

Le fond lui-même est copié octet pour octet à part (cp) : ce script
n'écrit que les images de teinte et les tuiles de grain, et imprime les
réglages à reporter dans config/death-notice-v2-tokens.ts.
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
    # Mobile Light — phases 1-2, validé PO : NE PAS MODIFIER.
    "mobile-light": {
        "sha256": "757fab95d4094a9fcf3ee3c651b1b3c962a0a723a781a3ccde14f89608fb3e6a",
        "fade": 40,
        "search": (760, 1120),
        "grain_gain": 2.4,
        "tone_gain": (0.996, 0.991, 0.985),
        # (x, y, largeur, hauteur) dans le papier central nu (x 0,25–0,75 :
        # aucun feuillage net, écart moyen au flou < 3 niveaux).
        "grain_zones": {
            "a": (236, 560, 460, 620),
            "b": (262, 300, 400, 540),
            "c": (292, 800, 340, 460),
        },
    },
    # Mobile Dark — phase 3. Coupe cherchée dans 760–1040 : plus bas, le
    # bord déchiré droit traverse toute la fenêtre du fondu. Cuir sombre
    # central (x 0,25–0,75), craquelé visible : zones calmes sans feuillage
    # ni bord. Gain et compensation calibrés sur rendu (rapport de phase 3).
    # Validé PO : NE PAS MODIFIER.
    "mobile-dark": {
        "sha256": "0164cefbe1281d61bdff86c2e6bc24c385f6ee45350a4dd4328b2a5be2b43980",
        "fade": 40,
        "search": (760, 1040),
        "grain_gain": 1.95,
        "tone_gain": (0.9, 0.868, 0.847),
        "grain_zones": {
            "a": (236, 470, 460, 620),
            "b": (262, 260, 400, 540),
            "c": (292, 760, 340, 460),
        },
    },
    # Desktop Light — phase 4. Deux zones de coupe (voir l'en-tête) :
    #   - gauche (colonnes 0–420) : entre le bas des feuillets écrits et le
    #     haut du bouquet, cherchée dans 400–530 ; fondu court (le bouquet
    #     commence 15 rangées sous la coupe) ;
    #   - droite (colonnes 1250–1672) : sous le brin fleuri et les ombres
    #     de feuilles, au-dessus du bouquet du bas, cherchée dans 540–680.
    # Teinte du papier seul, lissée σ = PAPER_SIGMA. Grain : papier central
    # nu (x 470–1180, y 170–770 : écart moyen au flou 1,4 niveau, aucun
    # pixel de détail net), tuiles 560 / 480 / 410.
    "desktop-light": {
        "sha256": "f95b05ce584292ae3059f4d2f4463b8bd62ad72fb6ed7f6433d451e9d721c070",
        "zones": {
            "left": {"columns": (0, 420), "search": (400, 530), "fade": 28},
            "right": {"columns": (1250, 1672), "search": (540, 680), "fade": 40},
        },
        "paper_sigma": 40,
        # Papier clair : moyenne > 205, R − B < 80.
        "paper_select": (205, 256, 80),
        # Calibré sur rendu (surface étendue 1,50 à 2,4 → papier du Master 1,74).
        "grain_gain": 2.8,
        "tone_gain": (0.996, 0.991, 0.985),
        "grain_zones": {
            "a": (470, 170, 560, 380),
            "b": (660, 300, 480, 340),
            "c": (560, 430, 410, 290),
        },
    },
    # Desktop Dark — phase 5. Même méthode à deux zones que le Desktop
    # Light, réglages mesurés sur le fond Dark :
    #   - gauche (colonnes 0–420) : gerbe florale continue des rangées 440 à
    #     720 ; coupe cherchée dans 640–740, sous les dernières fleurs, dans
    #     la poussière dorée, au-dessus des papiers déchirés du bas ;
    #   - droite (colonnes 1250–1670) : cuir nu entre la feuille du bord
    #     (fin vers 560) et les papiers (début vers 620), cherchée dans
    #     540–680.
    # « Papier seul » = le cuir : sans détail net, sombre (moyenne 4–48),
    # R − B < 60 (exclut l'or des brindilles et les papiers champagne), et
    # de teinte cuir : G − B ≤ (R − G) + 4 (cuir 38,21,7 : 14 ≤ 21 ; le
    # feuillage flou olive des bords, 73,51,19 : 32 > 26, est exclu).
    "desktop-dark": {
        "sha256": "8b07b2f25f32fd390f1123468370d06a9bc3eaf3410a3d5c4a8315df2ada78e0",
        "zones": {
            "left": {"columns": (0, 420), "search": (640, 740), "fade": 28},
            "right": {"columns": (1250, 1670), "search": (540, 680), "fade": 40},
        },
        "paper_sigma": 40,
        "paper_select": (4, 48, 60, 4),
        # Calibrés sur rendu : sur cuir sombre, « overlay » ne restitue
        # qu'une faible part de l'écart du grain.
        "grain_gain": 3.8,
        "tone_gain": (0.945, 0.96, 1.15),
        "grain_zones": {
            # Cuir central calme : < 0,1 % de pixels nets, basse fréquence ≤ 2,9.
            "a": (420, 330, 560, 380),
            "b": (500, 440, 480, 280),
            "c": (560, 360, 410, 290),
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
    col = np.median(rgb[start : start + PROFILE_ROWS], axis=0)
    return gaussian_1d(col, PROFILE_SIGMA)


def tone(rgb: np.ndarray, cut: int, fade: int, gain: tuple[float, float, float]) -> Image.Image:
    top = profile(rgb, cut - fade - PROFILE_ROWS)
    bottom = profile(rgb, cut + fade)
    rows = np.stack([top, bottom]) * np.array(gain)
    return Image.fromarray(np.clip(np.round(rows), 0, 255).astype(np.uint8), "RGB")


def grain_tile(img: Image.Image, zone: tuple[int, int, int, int], gain: float) -> Image.Image:
    x, y, w, h = zone
    region = img.crop((x, y, x + w + OVERLAP, y + h + OVERLAP))
    arr = np.asarray(region, dtype=float)
    low = np.asarray(region.filter(ImageFilter.GaussianBlur(GRAIN_SIGMA)), dtype=float)
    detail = (arr - low) * gain
    # Raccord horizontal puis vertical par fondu de bord (jamais de miroir).
    ramp = np.linspace(0, 1, OVERLAP)[None, :, None]
    detail[:, :OVERLAP] = detail[:, :OVERLAP] * ramp + detail[:, w : w + OVERLAP] * (1 - ramp)
    detail = detail[:, :w]
    ramp_v = np.linspace(0, 1, OVERLAP)[:, None, None]
    detail[:OVERLAP] = detail[:OVERLAP] * ramp_v + detail[h : h + OVERLAP] * (1 - ramp_v)
    detail = detail[:h]
    return Image.fromarray(np.clip(np.round(128 + detail), 0, 255).astype(np.uint8), "RGB")


def sharp_mask(img: Image.Image, threshold: float) -> np.ndarray:
    lum = img.convert("L")
    return np.abs(np.asarray(lum, dtype=float) - np.asarray(lum.filter(ImageFilter.GaussianBlur(3)), dtype=float)) > threshold


def find_zone_cut(img: Image.Image, fade: int, search: tuple[int, int], columns: tuple[int, int]) -> tuple[int, float]:
    """`find_cut`, restreint aux colonnes de la zone."""
    per_row = sharp_mask(img, 14)[:, columns[0] : columns[1]].sum(axis=1)
    best = None
    for y in range(search[0] + fade, search[1] - fade):
        score = per_row[y - fade : y + fade].mean()
        if best is None or score < best[1]:
            best = (y, score)
    return best


def paper_profile(
    rgb: np.ndarray, sharp: np.ndarray, start: int, sigma: float, select: tuple[float, ...]
) -> tuple[np.ndarray, int]:
    """Teinte du papier seul sur [start, start + PROFILE_ROWS] : par colonne,
    médiane des pixels sans détail net, de luminosité moyenne dans
    ]select[0], select[1][, peu saturés (R − B < select[2]) et, si
    select[3] est donné, de teinte cuir (G − B ≤ R − G + select[3]) ; une colonne
    où ces pixels font moins de 60 % des rangées (fleur, feuille, ombre
    dense) est interpolée depuis ses voisines de papier, puis prolongée
    jusqu'aux bords."""
    lum_min, lum_max, rb_max = select[:3]
    block = rgb[start : start + PROFILE_ROWS]
    mean = block.mean(axis=2)
    ok = ~sharp[start : start + PROFILE_ROWS] & (mean > lum_min) & (mean < lum_max) & (block[..., 0] - block[..., 2] < rb_max)
    if len(select) > 3:
        # Teinte cuir : le vert ne domine pas (exclut le feuillage olive flou).
        r, g, b = block[..., 0], block[..., 1], block[..., 2]
        ok &= (g - b) <= (r - g) + select[3]
    width = rgb.shape[1]
    values = np.full((width, 3), np.nan)
    for x in range(width):
        sel = ok[:, x]
        if sel.sum() >= 0.6 * PROFILE_ROWS:
            values[x] = np.median(block[sel, x], axis=0)
    good = ~np.isnan(values[:, 0])
    xs = np.arange(width)
    for c in range(3):
        values[:, c] = np.interp(xs, xs[good], values[good, c])
    return gaussian_1d(values, sigma), int(good.sum())


def main() -> None:
    variant, src, out = sys.argv[1], sys.argv[2], sys.argv[3]
    v = VARIANTS[variant]
    digest = sha256(src)
    if digest != v["sha256"]:
        sys.exit(f"SHA-256 inattendu : {digest}")
    img = Image.open(src).convert("RGB")
    rgb = np.asarray(img, dtype=float)
    print(f"variante {variant} — canvas {img.width}x{img.height}")
    if "zones" in v:
        sharp = sharp_mask(img, 10)
        for zone_name, zone in v["zones"].items():
            fade = zone["fade"]
            cut, score = find_zone_cut(img, fade, zone["search"], zone["columns"])
            print(f"zone {zone_name} : cutY {cut} (fondu {fade}, détail net moyen {score:.1f} px/rangée sur les colonnes {zone['columns']})")
            top, top_cols = paper_profile(rgb, sharp, cut - fade - PROFILE_ROWS, v["paper_sigma"], v["paper_select"])
            bottom, bottom_cols = paper_profile(rgb, sharp, cut + fade, v["paper_sigma"], v["paper_select"])
            rows = np.stack([top, bottom]) * np.array(v["tone_gain"])
            tone_path = f"{out}/avis-{variant}-tone-{zone_name}.png"
            Image.fromarray(np.clip(np.round(rows), 0, 255).astype(np.uint8), "RGB").save(tone_path, optimize=True)
            print(f"  teinte {tone_path} (colonnes de papier mesurées : {top_cols} / {bottom_cols} sur {img.width})")
    else:
        cut, score = find_cut(img, v["fade"], v["search"])
        print(f"cutY {cut} (fondu {v['fade']}, détail net moyen {score:.1f} px/rangée)")
        tone_path = f"{out}/avis-{variant}-tone.png"
        tone(rgb, cut, v["fade"], v["tone_gain"]).save(tone_path, optimize=True)
        print(f"tone {tone_path}")
    for name, zone in v["grain_zones"].items():
        tile = grain_tile(img, zone, v["grain_gain"])
        path = f"{out}/avis-{variant}-grain-{name}.png"
        tile.save(path, optimize=True)
        dev = np.asarray(tile, dtype=float) - 128
        print(f"grain {name} {tile.width}x{tile.height} écart-type {dev.std():.2f} -> {path}")


if __name__ == "__main__":
    main()
