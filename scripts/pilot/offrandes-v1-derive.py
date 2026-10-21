"""Offrandes symboliques Intemporel V1 — versions servies au navigateur.

Lit les sources artistiques (`assets/offrandes-intemporel-v1/source/`,
jamais modifiées), vérifie leur SHA-256, puis écrit pour chacune :

  - un AVIF 4:4:4, qualité 90 : la version principale. Le sous-échantillonnage
    de la chrominance (4:2:0) est exclu : il émousse les paillettes dorées et
    les fibres colorées des papiers. La qualité 90 est la plus basse pour
    laquelle tous les fichiers restent au-dessus de 42 dB de PSNR (fonds) et
    45 dB (objets, composités sur papier clair et sur papier sombre) ;
  - un WebP sans perte (`exact`), repli des navigateurs sans AVIF : pixels et
    transparence identiques à la source.

Aucun redimensionnement : les fonds sont affichés au plus à leur taille
native, et les objets, à leur plus grande échelle Desktop (×0,48, densité 2),
demandent environ 1 280 px de leurs 1 536.

Usage :
  python3 -I scripts/pilot/offrandes-v1-derive.py <sources> <sortie>
  python3 -I scripts/pilot/offrandes-v1-derive.py \
      assets/offrandes-intemporel-v1/source public/assets/offrandes/v1

Imprime, par fichier, le poids de la source et des dérivés et l'écart de
l'AVIF à la source.
"""

import hashlib
import io
import sys
from pathlib import Path

import numpy as np
from PIL import Image

SOURCES = {
    # sortie relative : (fichier source, SHA-256 de la livraison PO, transparence)
    "fonds/mobile-light": ("offrandes-recueillement-mobile-light.png", "3e34472567f5d81ea3ff9d5f1e4ff8fb667ebb6a3894e1c27bc1aee4f4781f58", False),
    "fonds/mobile-dark": ("offrandes-recueillement-mobile-dark.png", "fc57a1982ae473aa3d843ae578bae939093c6110d8350b64f327be35b8df2381", False),
    "fonds/desktop-light": ("offrandes-recueillement-desktop-light.png", "f491b13184b7d17861b15a4adb58275749c3386206c9174789dcd20c7b55d68e", False),
    "fonds/desktop-dark": ("offrandes-recueillement-desktop-dark.png", "2204e3aa6163af9049d9a80dbb0dac8936e8e9ca93331368365019d5b9e6a2e2", False),
    "objets/bougie": ("01_Bougie_eteinte.png", "4f3df62e630de0fb53e2e360a6493c608bed0f2520d83599ecba79800a383a98", True),
    "objets/flamme": ("02_Flamme.png", "e8a4ba480135201d733debd6355d4f618114c6d33b44bddac5158197c6235a9b", True),
    "objets/lys": ("03_Lys_ivoire.png", "71d74bb473a6eb77e8eb43869985af63f3f0eb457fb9878e57f71b95ca038b7e", True),
    "objets/coeur": ("04_Coeur_sculpte.png", "0e072f5f25c30832a0ac2ac4d3701edbf865e8bbddab886484579f1a7a5c1364", True),
}
AVIF_QUALITY = 90
PAPERS = ((243, 227, 213), (17, 15, 11))   # papier clair et papier sombre des fonds


def psnr(a, b):
    mse = ((a - b) ** 2).mean()
    return float("inf") if mse == 0 else 10 * np.log10(255 ** 2 / mse)


def composite(rgba, paper):
    alpha = rgba[..., 3:4] / 255
    return rgba[..., :3] * alpha + np.array(paper, dtype=np.float64) * (1 - alpha)


def main(src_dir: Path, out_dir: Path):
    rows = []
    for name, (filename, sha, has_alpha) in SOURCES.items():
        raw = (src_dir / filename).read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        if digest != sha:
            sys.exit(f"{filename} : SHA-256 {digest} ≠ livraison PO {sha}")
        image = Image.open(io.BytesIO(raw)).convert("RGBA" if has_alpha else "RGB")
        target = out_dir / f"{name}.avif"
        target.parent.mkdir(parents=True, exist_ok=True)
        image.save(target, "AVIF", quality=AVIF_QUALITY, subsampling="4:4:4", speed=4)
        image.save(out_dir / f"{name}.webp", "WEBP", lossless=True, method=6, exact=True)

        a = np.asarray(image, dtype=np.float64)
        b = np.asarray(Image.open(target).convert(image.mode), dtype=np.float64)
        if has_alpha:
            score = min(psnr(composite(a, p), composite(b, p)) for p in PAPERS)
            p999 = max(np.percentile(np.abs(composite(a, p) - composite(b, p)), 99.9) for p in PAPERS)
        else:
            score = psnr(a, b)
            p999 = np.percentile(np.abs(a - b), 99.9)
        rows.append((name, len(raw), target.stat().st_size, (out_dir / f"{name}.webp").stat().st_size, score, p999))

    print(f"{'fichier':22s} {'source':>9s} {'avif':>9s} {'webp':>9s} {'PSNR':>7s} {'p99,9':>6s}")
    for name, src, avif, webp, score, p999 in rows:
        print(f"{name:22s} {src / 1e3:8.0f}k {avif / 1e3:8.0f}k {webp / 1e3:8.0f}k {score:6.1f}dB {p999:6.0f}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(Path(sys.argv[1]), Path(sys.argv[2]))
