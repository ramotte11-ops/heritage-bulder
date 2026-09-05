#!/usr/bin/env python3
"""
Mission 020 — minimal automated checks for the generated welcome PDF.
Not a general-purpose PDF test suite: exactly the handful of properties
Mission 020's brief calls out as mandatory before this file may be
considered done — page count, proportions, and the one expected link.

Run: python3 scripts/pdf/check-welcome-pdf.py
Exits non-zero (and prints which check failed) on any violation.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

from PIL import Image
from pypdf import PdfReader

REPO_ROOT = Path(__file__).resolve().parents[2]
ASSET_DIR = REPO_ROOT / "assets" / "mission-020-welcome-pdf"
SOURCE_IMAGE = ASSET_DIR / "welcome-source.png"
PDF_PATH = ASSET_DIR / "heritage-hommage-welcome.pdf"

EXPECTED_URL = "https://hommages.netlify.app/activate"

# Substrings that must never appear anywhere in the PDF's raw bytes,
# outside of the one expected link URI above — a coarse but effective
# net for anything Etsy/order/activation-key/internal-infra shaped
# leaking into metadata, comments, or object streams.
FORBIDDEN_SUBSTRINGS = [
    b"etsy",
    b"listing",
    # Not a bare "order": PDF's own /Border annotation key legitimately
    # contains that substring, which made this check false-positive
    # against this file's own, entirely expected, link border array. The
    # real risk this guards against is an Etsy order reference, which
    # would actually look like one of these.
    b"external_order",
    b"order_id",
    b"orderid",
    b"HH1-",  # HERITAGE activation key prefix
    b"activation_key",
    b"supabase",
    b"github.com",
    b"netlify.app/deploy",
    b"--heritage-hommage.netlify.app",  # the deploy-preview test fixture
]

PASS = "PASS"
FAIL = "FAIL"

failures: list[str] = []


def decode_pdf_literal_escapes(raw: bytes) -> bytes:
    """Replaces PDF literal-string backslash escapes (`\\ddd` octal,
    `\\(`, `\\)`, `\\\\`) with their real byte value, everywhere in the
    file — a coarse, whole-file pass rather than a real PDF string
    parser, but sufficient (and safe) for a byte-content audit: it never
    needs to know which bytes are inside a string object versus a stream,
    because collapsing an escape sequence that happens to sit outside a
    string is harmless (PDF syntax never uses a bare backslash outside a
    literal string or a name in a way this would corrupt)."""
    import re

    def replace(match: "re.Match[bytes]") -> bytes:
        token = match.group(1)
        if token in b"()\\":
            return token
        if token.isdigit():
            return bytes([int(token, 8) & 0xFF])
        return match.group(0)

    return re.sub(rb"\\([0-7]{1,3}|[()\\])", replace, raw)


def check(label: str, ok: bool, detail: str = "") -> None:
    status = PASS if ok else FAIL
    print(f"[{status}] {label}" + (f" — {detail}" if detail else ""))
    if not ok:
        failures.append(label)


def main() -> int:
    check("PDF file exists", PDF_PATH.exists(), str(PDF_PATH))
    if not PDF_PATH.exists():
        return report()

    size_bytes = PDF_PATH.stat().st_size
    check(
        "PDF size is reasonable (under 15 MB)",
        size_bytes < 15 * 1024 * 1024,
        f"{size_bytes} bytes",
    )

    reader = PdfReader(str(PDF_PATH))
    check("PDF has exactly 1 page", len(reader.pages) == 1, f"{len(reader.pages)} page(s)")

    page = reader.pages[0]
    box = page.mediabox
    page_w, page_h = float(box.width), float(box.height)

    if SOURCE_IMAGE.exists():
        with Image.open(SOURCE_IMAGE) as im:
            img_w, img_h = im.size
        image_ratio = img_w / img_h
        page_ratio = page_w / page_h
        check(
            "page aspect ratio matches the source image (undistorted)",
            abs(image_ratio - page_ratio) < 0.001,
            f"image {img_w}x{img_h} ({image_ratio:.4f}) vs page {page_w:.2f}x{page_h:.2f}pt ({page_ratio:.4f})",
        )
    else:
        check("source image present to compare proportions against", False, str(SOURCE_IMAGE))

    annotations = page.get("/Annots") or []
    links = []
    for ref in annotations:
        obj = ref.get_object()
        if obj.get("/Subtype") == "/Link":
            links.append(obj)

    check("exactly one link annotation on the page", len(links) == 1, f"{len(links)} found")

    if len(links) == 1:
        action = links[0].get("/A") or {}
        uri = action.get("/URI")
        check("the link's URI is exactly the expected destination", uri == EXPECTED_URL, str(uri))
    else:
        check("the link's URI is exactly the expected destination", False, "no single link to check")

    raw = PDF_PATH.read_bytes()
    # pypdf writes literal PDF strings with octal escapes for punctuation
    # (e.g. "https\072\057\057..." for "https://...") — valid PDF syntax
    # that a viewer decodes back to the real URI (already proven above by
    # PdfReader parsing it correctly), but invisible to a plain substring
    # search on the raw bytes. Decode those escapes before scanning, so
    # "what's actually in the file" is compared against the same text a
    # PDF-aware reader — or a human opening it in a viewer's dev tools —
    # would see.
    decoded = decode_pdf_literal_escapes(raw)

    check(
        "the expected URL appears in the file (decoded from its PDF string escaping)",
        decoded.count(EXPECTED_URL.encode()) >= 1,
        f"{decoded.count(EXPECTED_URL.encode())} occurrence(s)",
    )

    for needle in FORBIDDEN_SUBSTRINGS:
        check(
            f"no forbidden substring {needle!r} anywhere in the file",
            needle not in decoded.lower(),
        )

    # Every http(s) URL byte-string found anywhere in the file must be
    # exactly the expected one — this is the strongest form of "no other
    # external URL is embedded" the brief asks for.
    all_urls = sorted(
        set(m.group(0).decode(errors="replace") for m in re.finditer(rb"https?://[^\s()<>\]\)\"'\\]+", decoded))
    )
    unexpected = [u for u in all_urls if u.rstrip(">)") != EXPECTED_URL]
    check(
        "no URL other than the expected CTA destination is embedded",
        len(unexpected) == 0,
        f"found: {all_urls}",
    )

    return report()


def report() -> int:
    print()
    if failures:
        print(f"{len(failures)} check(s) FAILED: {failures}")
        return 1
    print("All checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
