"""Vidéo hommage V1 (« Des instants pour se souvenir ») — Masters servis au navigateur.

Lit les quatre Masters PNG officiels (`assets/video-hommage-v1/source/`,
jamais modifiés), vérifie leur SHA-256 de livraison PO, puis écrit, pour
chaque Master et chaque largeur servie :

  - un AVIF 4:4:4, qualité 90 : la version principale (même réglage que les
    Offrandes : pas de sous-échantillonnage de la chrominance, qui émousserait
    les paillettes dorées, les fibres des papiers et le sceau) ;
  - un WebP sans perte (`exact`), repli des navigateurs sans AVIF.

Largeurs : la largeur native du Master, sans agrandissement, et une largeur
réduite pour les écrans qui n'ont pas besoin de la native (Lanczos, aucune
autre retouche : ni recadrage, ni recomposition, ni découpage).

  Desktop 1670 × 942  → 1670 et 1280 px
  Mobile  1024 × 1536 → 1024 et 768 px

Convention d'empreinte du lot 06-D (Chef 06) : chaque fichier servi est
nommé `<SHA-256 complet de ses octets>-<nom>`, si bien qu'une image modifiée
reçoit nécessairement une nouvelle adresse. Le test
`components/memorial/video/video-masters.test.ts` revérifie ce lien.

Usage :
  python3 -I scripts/pilot/video-hommage-v1-derive.py <sources> <sortie>
  python3 -I scripts/pilot/video-hommage-v1-derive.py \
      assets/video-hommage-v1/source public/assets/video-hommage/v1

Imprime le tableau des poids et de l'écart à la source, puis le manifeste
JSON (layout → variante → largeur → format → adresse, octets, SHA-256) à
reporter dans `components/memorial/video/video-masters.ts`.
"""

import hashlib
import io
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

SOURCES = {
    # (layout, variante) : (fichier source, SHA-256 de la livraison PO, dimensions)
    ("desktop", "light"): ("HERITAGE_VIDEO_Desktop_Light_MASTER.png", "47d07afc7ad65a2576d9a93b52e1b24c7fdb35d677e364fccb7a5e51b2938c13", (1670, 942)),
    ("desktop", "dark"): ("HERITAGE_VIDEO_Desktop_Dark_MASTER.png", "46c31724fde3bca7f0fc420c27076291a4869a9828c906829dcad92b1de25b7e", (1670, 942)),
    ("mobile", "light"): ("HERITAGE_VIDEO_Mobile_Light_MASTER.png", "9c6fadb9d63ecd60d1ebe3f5b6bfb054ac3d408db3b13041a151ec3753c9eae1", (1024, 1536)),
    ("mobile", "dark"): ("HERITAGE_VIDEO_Mobile_Dark_MASTER.png", "d07e5be549e78d0ed0e5ae184c0b42455ea81f3e34e4d4e3d9ce38682153f1bf", (1024, 1536)),
}
WIDTHS = {"desktop": (1280, 1670), "mobile": (768, 1024)}
AVIF_QUALITY = 90
URL_PREFIX = "/assets/video-hommage/v1"


def psnr(a, b):
    mse = ((a - b) ** 2).mean()
    return float("inf") if mse == 0 else 10 * np.log10(255 ** 2 / mse)


def encode(image, fmt):
    buffer = io.BytesIO()
    if fmt == "avif":
        image.save(buffer, "AVIF", quality=AVIF_QUALITY, subsampling="4:4:4", speed=4)
    else:
        image.save(buffer, "WEBP", lossless=True, method=6, exact=True)
    return buffer.getvalue()


def main(src_dir: Path, out_dir: Path):
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest, rows = {}, []
    for (layout, variant), (filename, sha, size) in SOURCES.items():
        raw = (src_dir / filename).read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        if digest != sha:
            sys.exit(f"{filename} : SHA-256 {digest} ≠ livraison PO {sha}")
        master = Image.open(io.BytesIO(raw))
        if master.size != size or master.format != "PNG":
            sys.exit(f"{filename} : {master.format} {master.size} ≠ PNG {size}")
        master = master.convert("RGB")
        for width in WIDTHS[layout]:
            height = round(size[1] * width / size[0])
            reference = master if width == size[0] else master.resize((width, height), Image.Resampling.LANCZOS)
            for fmt in ("avif", "webp"):
                data = encode(reference, fmt)
                file_sha = hashlib.sha256(data).hexdigest()
                name = f"{file_sha}-video-{layout}-{variant}-{width}w.{fmt}"
                (out_dir / name).write_bytes(data)
                decoded = np.asarray(Image.open(io.BytesIO(data)).convert("RGB"), dtype=np.float64)
                ref = np.asarray(reference, dtype=np.float64)
                rows.append((f"{layout}-{variant} {width}w {fmt}", len(raw), len(data), psnr(ref, decoded),
                             float(np.percentile(np.abs(ref - decoded), 99.9))))
                manifest.setdefault(layout, {}).setdefault(variant, {}).setdefault(str(width), {})[fmt] = {
                    "src": f"{URL_PREFIX}/{name}", "bytes": len(data), "sha256": file_sha, "height": height,
                }

    print(f"{'fichier':28s} {'source':>9s} {'servi':>9s} {'PSNR':>8s} {'p99,9':>6s}")
    for name, src, out, score, p999 in rows:
        print(f"{name:28s} {src / 1e3:8.0f}k {out / 1e3:8.0f}k {score:7.1f}dB {p999:6.0f}")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(Path(sys.argv[1]), Path(sys.argv[2]))
