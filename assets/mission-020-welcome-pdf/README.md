# HERITAGE Hommage — welcome PDF (Mission 020)

A single static, one-page PDF delivered to Etsy V1 buyers. Common to
every purchase — no per-order personalization, no activation key, no
Etsy listing/order reference anywhere in it.

## Files

- `welcome-source.png` — the Product-Owner-validated final design, exactly
  as delivered. Never redrawn, recomposed, or edited: no text, color,
  typography, layout, or graphic element was changed from this source.
- `heritage-hommage-welcome.pdf` — the deliverable: `welcome-source.png`
  wrapped into a single PDF page at its native proportions, with exactly
  one interactive element added — a clickable link over the visual
  "Begin my memorial" button.

## The one interactive element

The button links to:

```
https://hommages.netlify.app/activate
```

This is the real Netlify production URL for the `hommages` site,
explicitly authorized by HQ for this Etsy V1 artifact (Mission 020's
brief originally required a stable HERITAGE-owned domain and blocked on
one not being provable from the repository; HQ's follow-up decision
scoped this PDF as an Etsy-V1-only artifact and authorized the Netlify
production URL for it specifically — see the mission's own report for
that exchange). No activation key, order id, or tracking parameter is
in this URL, and it never redirects to the demo `/builder` fixtures.

## How it was built (and how to rebuild it)

```bash
pip install img2pdf pypdf pillow
python3 scripts/pdf/generate-welcome-pdf.py
python3 scripts/pdf/check-welcome-pdf.py
```

`generate-welcome-pdf.py` wraps `welcome-source.png` into a PDF page with
`img2pdf` (the original image bytes are embedded, never re-rendered or
re-encoded — this is what "no redraw" means at the file-format level),
then adds one `/Link` annotation with `pypdf`. The annotation's
rectangle is computed from the source image's own pixel data (isolating
the one wide, solid dark-brown region that is the button), not chosen by
eye — see the script's own docstring for the exact method.

Re-run `generate-welcome-pdf.py` only if the source asset changes, or if
HQ ever needs the CTA destination changed (edit the `CTA_URL` constant at
the top of the script). Always re-run `check-welcome-pdf.py` afterwards.

## What the checks prove

`check-welcome-pdf.py` verifies, automatically: the file exists and opens
as a valid PDF; it has exactly one page whose aspect ratio matches the
source image (so nothing was cropped or stretched); it carries exactly
one link annotation, whose URI is exactly the expected destination; no
other URL of any kind is embedded anywhere in the file (metadata,
annotations, or otherwise); and none of a list of forbidden substrings
(Etsy order/listing references, a HERITAGE activation key prefix,
Supabase/GitHub hostnames, the deploy-preview test fixture domain) appear
anywhere in the file.
