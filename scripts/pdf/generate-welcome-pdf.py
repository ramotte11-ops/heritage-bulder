#!/usr/bin/env python3
"""
Mission 020 — generates the static HERITAGE Hommage welcome PDF from the
Product-Owner-validated source image, with exactly one interactive
element: a clickable link annotation over the visual "Begin my memorial"
button, pointing to HERITAGE's generic /activate entry point.

This is a build-time tool, not part of the Next.js application: it is run
once (or re-run only if the source asset or the destination URL changes)
to produce a static file that is committed to the repository. It has no
dependency on Node/npm, and nothing in app/, components/ or lib/ imports
it or anything it produces at runtime.

WHY img2pdf + pypdf, and nothing heavier
------------------------------------------------------------------------
- img2pdf wraps the ORIGINAL image bytes into a single-page PDF container
  without re-encoding or re-rendering them: no HTML/CSS engine, no
  headless browser, no redrawing of the design in any form. This is the
  literal requirement of Mission 020 ("ne pas redessiner cette image").
- pypdf is used for exactly one further, minimal edit: attaching one
  `/Link` annotation (a clickable rectangle + a URI) to the page pypdf
  produced. It touches no pixel of the page's visual content.
- Both are small, single-purpose libraries — not a "dynamic PDF engine".

WHY the button's rectangle is computed, not eyeballed
------------------------------------------------------------------------
`find_button_bbox()` below locates the CTA button's own bounding box by
thresholding the source image for its solid dark-brown fill and isolating
the one wide, tall, contiguous band of dark pixels that fill represents —
distinct from thin text/icon strokes (a handful of pixels tall) and from
the unrelated dark decorative elements elsewhere on the page (top-left
leaves, bottom-right ribbon/wax seal), which sit outside the button's row
range entirely. This makes the link's exact position reproducible and
auditable from the pixel data itself, rather than a manually guessed
rectangle that could drift from the actual artwork.
"""

from __future__ import annotations

import sys
from pathlib import Path

import img2pdf
from PIL import Image
from pypdf import PdfReader, PdfWriter
from pypdf.annotations import Link
from pypdf.generic import NameObject, TextStringObject

REPO_ROOT = Path(__file__).resolve().parents[2]
ASSET_DIR = REPO_ROOT / "assets" / "mission-020-welcome-pdf"
SOURCE_IMAGE = ASSET_DIR / "welcome-source.png"
OUTPUT_PDF = ASSET_DIR / "heritage-hommage-welcome.pdf"

# The exact, QG-confirmed production destination for this Etsy V1
# delivery PDF. Never a listing id, order number, activation key, or
# tracking query string — see Mission 020's brief, section 5.
CTA_URL = "https://hommages.netlify.app/activate"

# Fixed, explicit DPI for the page-size mapping. The source PNG carries
# no DPI metadata, so img2pdf would otherwise fall back to its own
# default (96 dpi) implicitly; making the choice explicit here means the
# resulting page size is a documented decision, not an accident of a
# library default. Proportions are unaffected either way — DPI only
# scales pixels to points uniformly.
DPI = 150.0
POINTS_PER_INCH = 72.0

# A pixel is considered part of a dark (button-fill or ink) region below
# this mean-channel brightness. Conservative: the button's fill measured
# well under this (see the script's own diagnostic run), and the cream
# background/paper texture sits far above it.
DARK_BRIGHTNESS_THRESHOLD = 110
# A "button row" must have at least this fraction of the image width
# covered by dark pixels — high enough to exclude thin text/icon strokes,
# low enough to tolerate anti-aliased edges and the arrow glyph cut-out.
BUTTON_ROW_MIN_COVERAGE = 300  # pixels, out of 1024-wide source
# Decorative dark elements elsewhere on the page (top-left leaves,
# bottom-right ribbon and wax seal) are excluded by restricting the
# column search to the left ~88% of the image — verified against this
# exact source asset (see the diagnostic column profile in the mission
# report) to sit entirely outside the button's own horizontal extent.
COLUMN_SEARCH_LIMIT_FRACTION = 0.88


def find_button_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    """Returns (left, top, right, bottom) pixel coordinates of the
    single wide, solid dark region on the page — the "Begin my memorial"
    button. Raises if the page's shape does not match what this script
    expects, rather than silently returning a wrong rectangle."""
    rgb = image.convert("RGB")
    width, height = rgb.size
    pixels = rgb.load()

    # Row-wise dark-pixel counts, cheaply, without adding a numpy
    # dependency for a single one-off script.
    row_counts = []
    for y in range(height):
        count = 0
        for x in range(width):
            r, g, b = pixels[x, y]
            if (r + g + b) / 3.0 < DARK_BRIGHTNESS_THRESHOLD:
                count += 1
        row_counts.append(count)

    # Isolate contiguous runs of rows whose dark-pixel count clears the
    # button threshold, then keep the run that is both wide (a filled
    # button, not a stroke) and tall enough to be a real button body.
    runs: list[tuple[int, int]] = []
    start = None
    for y, count in enumerate(row_counts):
        if count > BUTTON_ROW_MIN_COVERAGE and start is None:
            start = y
        elif count <= BUTTON_ROW_MIN_COVERAGE and start is not None:
            runs.append((start, y - 1))
            start = None
    if start is not None:
        runs.append((start, height - 1))

    candidates = [(s, e) for s, e in runs if (e - s + 1) >= 20]
    if len(candidates) != 1:
        raise RuntimeError(
            f"expected exactly one wide dark band (the button), found {len(candidates)}: {candidates}. "
            "Refusing to guess — re-check the source asset or these thresholds."
        )
    top, bottom = candidates[0]

    column_limit = int(width * COLUMN_SEARCH_LIMIT_FRACTION)
    band_height = bottom - top + 1
    col_counts = [0] * width
    for y in range(top, bottom + 1):
        for x in range(column_limit):
            r, g, b = pixels[x, y]
            if (r + g + b) / 3.0 < DARK_BRIGHTNESS_THRESHOLD:
                col_counts[x] += 1

    button_columns = [x for x in range(column_limit) if col_counts[x] > band_height * 0.5]
    if not button_columns:
        raise RuntimeError("could not locate the button's horizontal extent")
    left, right = min(button_columns), max(button_columns)

    return left, top, right, bottom


def pixel_bbox_to_pdf_rect(
    bbox: tuple[int, int, int, int], image_size: tuple[int, int], dpi: float
) -> tuple[float, float, float, float]:
    """Converts a (left, top, right, bottom) pixel box — image
    coordinates, y growing downward — into a PDF annotation rectangle
    (llx, lly, urx, ury) in points, where y grows upward from the page's
    bottom edge, at the given DPI."""
    left, top, right, bottom = bbox
    _, image_height_px = image_size
    scale = POINTS_PER_INCH / dpi
    page_height_pt = image_height_px * scale

    llx = left * scale
    urx = right * scale
    lly = page_height_pt - bottom * scale
    ury = page_height_pt - top * scale
    return llx, lly, urx, ury


def main() -> None:
    if not SOURCE_IMAGE.exists():
        sys.exit(f"source asset not found: {SOURCE_IMAGE}")

    image = Image.open(SOURCE_IMAGE)
    image_size = image.size

    bbox = find_button_bbox(image)
    print(f"detected button bbox (pixels): {bbox}")

    # img2pdf reads the ORIGINAL file bytes directly — no Pillow
    # re-encoding of the pixel data happens on this path at all.
    layout_fun = img2pdf.get_fixed_dpi_layout_fun((DPI, DPI))
    pdf_bytes = img2pdf.convert(str(SOURCE_IMAGE), layout_fun=layout_fun)

    tmp_path = OUTPUT_PDF.with_suffix(".base.pdf")
    tmp_path.write_bytes(pdf_bytes)

    reader = PdfReader(str(tmp_path))
    if len(reader.pages) != 1:
        sys.exit(f"expected exactly 1 page from img2pdf, got {len(reader.pages)}")

    writer = PdfWriter()
    writer.append(reader)

    rect = pixel_bbox_to_pdf_rect(bbox, image_size, DPI)
    print(f"link annotation rect (pt): {rect}")

    link = Link(rect=rect, url=CTA_URL, border=[0, 0, 0])
    writer.add_annotation(page_number=0, annotation=link)

    # Minimal, clean document metadata: no tool fingerprint beyond a
    # generic HERITAGE label, no personal data, no Etsy/order/activation
    # reference, no internal hostnames or secrets of any kind.
    writer.add_metadata(
        {
            NameObject("/Title"): TextStringObject("HERITAGE Hommage — Welcome"),
            NameObject("/Author"): TextStringObject("HERITAGE"),
            NameObject("/Producer"): TextStringObject("HERITAGE"),
            NameObject("/Creator"): TextStringObject("HERITAGE"),
        }
    )

    with open(OUTPUT_PDF, "wb") as f:
        writer.write(f)

    tmp_path.unlink()

    print(f"wrote {OUTPUT_PDF} ({OUTPUT_PDF.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
