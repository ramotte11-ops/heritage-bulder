import { A13_ALBUM_DARK_MATERIAL } from "@/config/album-a13-dark-material";

/**
 * A13 Album Desktop Dark V1 — material-only guards (pure, QA and tests).
 *
 * - `darkRuleLeaks`: every CSS rule keyed on `data-a13-theme` must set
 *   material properties only. A geometric property (the contract's
 *   `materialOnlyGuard.forbiddenProperties` plus their shorthands) or a
 *   photo-processing property is a `DARK_TOKEN_GEOMETRY_LEAK_STOP` /
 *   `DARK_PHOTO_PROCESSING_STOP`; a Dark rule targeting the photo or its
 *   window is a `DARK_PHOTO_PROCESSING_STOP`.
 * - `darkBackgroundRepeat`: the Dark body layer must paint the TOP once
 *   (`no-repeat`, first layer) and repeat only the BODY
 *   (`DARK_BACKGROUND_REPEAT_STOP`).
 */

export interface DarkLeak {
  selector: string;
  property: string;
  stop: "DARK_TOKEN_GEOMETRY_LEAK_STOP" | "DARK_PHOTO_PROCESSING_STOP";
}

const FORBIDDEN = new Set<string>(A13_ALBUM_DARK_MATERIAL.materialOnlyGuard.forbiddenProperties);
const GEOMETRY_SHORTHANDS = /^(margin(-.*)?|padding(-.*)?|inset(-.*)?|border(-(top|right|bottom|left))?(-width)?|outline(-width|-offset)?|font(-.*)?|display|position|float|clear|zoom|contain|columns?|flex.*|grid.*|align.*|justify.*|place.*|white-space|word-spacing|text-indent|vertical-align|clip-path|writing-mode)$/;
const PHOTO_PROCESSING = /^(filter|opacity|mix-blend-mode|backdrop-filter|mask.*|-webkit-mask.*|isolation)$/;

export function darkRules(css: string) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map(([, sel, body]) => ({ selector: sel.trim(), props: body.split(";").map((d) => d.split(":")[0].trim()).filter(Boolean) }))
    .filter((r) => r.selector.includes("data-a13-theme"));
}

export function darkRuleLeaks(css: string): DarkLeak[] {
  const out: DarkLeak[] = [];
  for (const r of darkRules(css)) {
    if (/\.photo|\.window|\bimg\b/.test(r.selector)) out.push({ selector: r.selector, property: "(selector)", stop: "DARK_PHOTO_PROCESSING_STOP" });
    for (const p of r.props) {
      if (FORBIDDEN.has(p) || GEOMETRY_SHORTHANDS.test(p)) out.push({ selector: r.selector, property: p, stop: "DARK_TOKEN_GEOMETRY_LEAK_STOP" });
      else if (PHOTO_PROCESSING.test(p)) out.push({ selector: r.selector, property: p, stop: "DARK_PHOTO_PROCESSING_STOP" });
    }
  }
  return out;
}

/** TOP once, BODY repeated: the first background layer is the TOP, not repeated. */
export function darkBackgroundRepeat(css: string): "PASS" | "DARK_BACKGROUND_REPEAT_STOP" {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const body = [...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(([, sel]) => sel.includes("data-a13-theme") && /\.body\b/.test(sel));
  if (!body) return "DARK_BACKGROUND_REPEAT_STOP";
  const decl = (name: string) => new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(body[2])?.[1].replace(/\s+/g, " ").trim() ?? "";
  const images = decl("background-image").split(/,(?![^(]*\))/).map((v) => v.trim());
  const repeats = decl("background-repeat").split(",").map((v) => v.trim());
  const ok = images.length === 2 && /--a13-dark-album-top/.test(images[0]) && /--a13-dark-album-body/.test(images[1]) && repeats[0] === "no-repeat" && repeats[1] === "repeat-y";
  return ok ? "PASS" : "DARK_BACKGROUND_REPEAT_STOP";
}
