#!/usr/bin/env python3
"""Hero Intemporel — Mobile Dark NAME territory (read-only measurement).

Regenerates `HERO_INTEMPOREL_MOBILE_DARK_NAME_TERRITORY.artLowestY` in
config/hero-intemporel-tokens.ts from the FROZEN Mobile Dark overlay
(`HERO_INTEMPOREL_MOBILE_DARK_ALPHA_RUNTIME_ASSET_V2(1).png`, 982×1602,
SHA-256 aab7752a…c1a36c0). The asset is only read, never written.

For every 2-px column band x ∈ [100, 882) of the native scene, the value is
the LOWEST y (largest y) in [600, 978] where the frozen art is present —
i.e. the art's lower boundary above the NAME's bottom anchor (978). A value
of 600 means no art in that band over the whole range.

"Art" = any pixel whose tone departs from the dark paper (luminance > 75 or
< 22, just outside the clean paper's own 1st/99th percentiles, 28 / 65), or
that is transparent (the photo window), after removing COMPACT specks only
(connected components < 40 px AND <= 6 px extent: paper grain). Measured
noise on clean paper: 0 px.

Usage: python3 scripts/pilot/hero-mobile-dark-name-territory.py
Prints the JS array literal. Requires Pillow + numpy.
"""
import hashlib
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ASSET = Path(__file__).resolve().parents[2] / "public/assets/hero/intemporel/runtime/HERO_INTEMPOREL_MOBILE_DARK_ALPHA_RUNTIME_ASSET_V2(1).png"
EXPECTED_SHA256 = "aab7752aad7d707a0db4c46cef344d852b32dfd86ee3dcfa4eeac1e09c1a36c0"
X_START, X_END, X_STEP, Y_TOP, Y_ANCHOR = 100, 882, 2, 600, 978


def drop_compact_specks(m, min_px=40, max_extent=6):
    h, w = m.shape
    seen = np.zeros((h, w), bool)
    keep = np.zeros((h, w), bool)
    for y0, x0 in zip(*np.nonzero(m)):
        if seen[y0, x0]:
            continue
        stack, pts = [(y0, x0)], []
        seen[y0, x0] = True
        while stack:
            y, x = stack.pop()
            pts.append((y, x))
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < h and 0 <= xx < w and m[yy, xx] and not seen[yy, xx]:
                        seen[yy, xx] = True
                        stack.append((yy, xx))
        ys, xs = zip(*pts)
        compact = max(max(ys) - min(ys), max(xs) - min(xs)) <= max_extent
        if len(pts) >= min_px or not compact:
            keep[list(ys), list(xs)] = True
    return keep


def main():
    digest = hashlib.sha256(ASSET.read_bytes()).hexdigest()
    if digest != EXPECTED_SHA256:
        sys.exit(f"frozen asset changed: {digest}")
    rgba = np.asarray(Image.open(ASSET).convert("RGBA")).astype(float)
    lum = rgba[..., :3].mean(axis=2)

    def despeckle(m):
        return np.asarray(Image.fromarray((m * 255).astype("uint8")).filter(ImageFilter.MedianFilter(3))) > 127

    art = drop_compact_specks(despeckle((lum > 75) | (lum < 22)) | (rgba[..., 3] < 200))
    lowest = []
    for x in range(X_START, X_END, X_STEP):
        rows = np.nonzero(art[Y_TOP : Y_ANCHOR + 1, x : x + X_STEP].any(axis=1))[0]
        lowest.append(int(Y_TOP + rows.max()) if len(rows) else Y_TOP)
    print("[" + ", ".join(map(str, lowest)) + "]")


if __name__ == "__main__":
    main()
