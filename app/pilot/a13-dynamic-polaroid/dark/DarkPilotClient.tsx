"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { A13_DARK_BACKGROUND, A13_DARK_PARITY_CONTRACT, type A13Theme } from "@/config/gallery-a13-dark-material";
import { A13_CTA_7PLUS_PILOT_LABELS } from "@/config/gallery-a13-multi-state-manifests";
import { measureTitleGlyphMask, type TitleGlyphMeasure } from "@/lib/memorial/gallery/title-glyph-mask";
import { useCaptionMeasurer } from "@/lib/memorial/gallery/use-caption-measurer";
import { A13_PILOT_MEDIA_POOL, A13_PILOT_TITLE } from "@/lib/memorial/gallery/a13-pilot-fixtures";
import {
  firstDifference,
  geometrySnapshot,
  parityFixtures,
  runLightEngine,
  snapshotBytes,
  supplementaryParityFixtures,
  type EngineRun,
  type GeometrySnapshot,
  type ParityFixture,
  type ParityMedia,
} from "@/lib/memorial/gallery/theme-parity";
import { domGeometrySnapshot, sceneMaterialReport } from "@/lib/memorial/gallery/theme-dom-snapshot";
import { A13CaptionFontProbe, A13PilotScene } from "@/components/memorial/gallery/A13PilotScene";
import styles from "../etats/page.module.css";

/**
 * A13 Desktop DARK — runtime pilot V1.1.
 *
 * Execution rule (handoff manifest): run the existing Light V2.1 geometry,
 * take the final engine decision, THEN apply the Dark material. The scene
 * receives already-computed entries; `theme` only selects the background
 * asset and the material rules.
 *
 * Parity gate (`parity-and-qa.v1.1.json`): two fully independent pipelines,
 * one per theme — each measures its own caption font metrics and its own
 * title glyph mask from a scene rendered in ITS theme, runs the unchanged
 * Light engine on the same fixture inputs, and captures the geometry
 * snapshot before any material is applied. The 36 Light/Dark snapshot
 * pairs must be byte-identical; the 72 rendered scenes are then measured
 * (DOM geometry, glyph boxes, hit-testing, accessibility) and compared
 * pair by pair. Any difference: THEME_GEOMETRY_PARITY_STOP — reported,
 * never corrected on the Dark side.
 *
 * Four supplementary pairs follow the 36 (G6 exact / Signature 7+ on their
 * GREEN reference media, without and with the pool's 32-char captions);
 * they are reported separately and never counted in the 36.
 *
 * `?cas=G2:master-like:none,…` restricts the run to some fixtures.
 */

const BASE = "/pilot/a13-dynamic-polaroid";
const RATIO_IMAGES: Record<string, string> = {
  landscape: `${BASE}/p2-paysage-4x3.jpg`,
  square: `${BASE}/p3-carre-1x1.jpg`,
  portrait: `${BASE}/p1-portrait-3x4.jpg`,
  "narrow-portrait": `${BASE}/p4-portrait-etroit-9x16.jpg`,
  "wide-landscape": `${BASE}/p5-paysage-large-16x9.jpg`,
  "bounded-panorama": `${BASE}/p6b-panorama-239x100.jpg`,
};
const RATIO_OF: Record<string, number> = { landscape: 4 / 3, square: 1, portrait: 0.75, "narrow-portrait": 0.5625, "wide-landscape": 16 / 9, "bounded-panorama": 2.39 };

/** Master-like media: nearest test photo, centre-cropped to the exact
 * Master window ratio (the V2 pilot's rule — never distorted). Identical
 * bytes are handed to both themes. */
function useMasterImages(fixtures: ParityFixture[]) {
  const [urls, setUrls] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    let alive = true;
    const want = new Map<string, number>();
    for (const f of fixtures) for (const m of f.media) if (m.ratioId.startsWith("master:")) want.set(m.ratioId, m.width / m.height);
    const out: Record<string, string> = {};
    void Promise.all(
      [...want].map(async ([id, r]) => {
        const [near] = Object.entries(RATIO_OF).sort((a, b) => Math.abs(Math.log(a[1] / r)) - Math.abs(Math.log(b[1] / r)))[0];
        const img = new Image();
        img.src = RATIO_IMAGES[near];
        await img.decode();
        const iw = img.naturalWidth;
        const ih = img.naturalHeight;
        const cw = Math.min(iw, ih * r);
        const ch = cw / r;
        const c = document.createElement("canvas");
        c.width = Math.round(1200 * Math.min(1, r));
        c.height = Math.round(c.width / r);
        c.getContext("2d")!.drawImage(img, (iw - cw) / 2, (ih - ch) / 2, cw, ch, 0, 0, c.width, c.height);
        out[id] = c.toDataURL("image/jpeg", 0.9);
      }),
    ).then(() => {
      if (alive) setUrls(out);
    });
    return () => {
      alive = false;
    };
  }, [fixtures]);
  return urls;
}

/** One independent measuring pipeline (caption font + title glyph mask),
 * rendered in its own theme. */
function usePipeline(theme: A13Theme) {
  const rootRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const font = useCaptionMeasurer(rootRef);
  const [title, setTitle] = useState<TitleGlyphMeasure | null>(null);
  useEffect(() => {
    if (!font?.fontCheck || !titleRef.current) return;
    let alive = true;
    void measureTitleGlyphMask(titleRef.current).then((t) => {
      if (alive && t) setTitle(t);
    });
    return () => {
      alive = false;
    };
  }, [font]);
  const probe: ReactNode = (
    <div ref={rootRef} data-pipeline={theme}>
      <A13CaptionFontProbe />
      <div ref={titleRef} style={{ position: "absolute", width: 1670, left: -20000, top: 0 }} aria-hidden="true">
        <A13PilotScene stateId={`title-${theme}`} theme={theme} title={A13_PILOT_TITLE.title} subtitle={A13_PILOT_TITLE.subtitle} entries={[]} />
      </div>
    </div>
  );
  return { font, title, probe };
}

interface Pair {
  fixture: ParityFixture;
  light: EngineRun;
  dark: EngineRun;
  snapLight: GeometrySnapshot;
  engineIdentical: boolean;
  engineDiff: string | null;
  bytes: number;
}

type Material = ReturnType<typeof sceneMaterialReport> & { fixture: string };

interface DomPair {
  id: string;
  identical: boolean;
  diff: string | null;
  bytes: number;
}

async function sha256(text: string | ArrayBuffer) {
  const buf = typeof text === "string" ? new TextEncoder().encode(text) : text;
  const d = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function DarkPilotClient() {
  const light = usePipeline("light");
  const dark = usePipeline("dark");
  const [filter, setFilter] = useState<string[] | null>(null);
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [done, setDone] = useState(false);
  const [dom, setDom] = useState<{ pairs: DomPair[]; material: Material[]; hashes: Record<string, { light: string; dark: string }> } | null>(null);
  const [bg, setBg] = useState<{ sha256: string; width: number; height: number } | null>(null);
  const [activated, setActivated] = useState("");
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("cas");
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot hydration of URL presets */
    setFilter(q ? q.split(",").filter(Boolean) : []);
  }, []);

  const fixtures = useMemo(() => {
    const all = [...parityFixtures(), ...supplementaryParityFixtures()];
    return filter && filter.length ? all.filter((f) => filter.includes(f.id)) : all;
  }, [filter]);
  const master = useMasterImages(fixtures);

  // Dark background: the asset actually served, hashed and measured.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const buf = await (await fetch(A13_DARK_BACKGROUND.src)).arrayBuffer();
      const img = new Image();
      img.src = A13_DARK_BACKGROUND.src;
      await img.decode();
      const h = await sha256(buf);
      if (alive) setBg({ sha256: h, width: img.naturalWidth, height: img.naturalHeight });
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Engine: the unchanged Light V2.1 engine, once per pipeline per fixture.
  const ready = filter !== null && !!light.font?.fontCheck && !!dark.font?.fontCheck && !!light.title?.fontsChecked && !!dark.title?.fontsChecked;
  useEffect(() => {
    if (!ready) return;
    const L = { measurer: light.font!.measurer, title: light.title! };
    const D = { measurer: dark.font!.measurer, title: dark.title! };
    let alive = true;
    const out: Pair[] = [];
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- restart of the stepped run */
    setPairs([]);
    setDone(false);
    const step = (i: number) => {
      if (!alive) return;
      if (i >= fixtures.length) {
        setDone(true);
        return;
      }
      const fx = fixtures[i];
      const lr = runLightEngine(fx, L.measurer, L.title.mask);
      const dr = runLightEngine(fx, D.measurer, D.title.mask);
      const sl = geometrySnapshot(lr, L.title);
      const sd = geometrySnapshot(dr, D.title);
      const bl = snapshotBytes(sl);
      const bd = snapshotBytes(sd);
      out.push({ fixture: fx, light: lr, dark: dr, snapLight: sl, engineIdentical: bl === bd, engineDiff: bl === bd ? null : firstDifference(JSON.parse(bl), JSON.parse(bd)), bytes: bl.length });
      setPairs([...out]);
      setTimeout(() => step(i + 1), 0);
    };
    setTimeout(() => step(0), 0);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pipelines are read once they are ready
  }, [ready, fixtures]);

  // Rendered scenes: DOM geometry parity, once every scene is laid out.
  useEffect(() => {
    if (!done || !master || !gridRef.current) return;
    let alive = true;
    void (async () => {
      await document.fonts.ready;
      const imgs = [...gridRef.current!.querySelectorAll("img")];
      await Promise.all(imgs.map((i) => (i.complete ? null : i.decode().catch(() => null))));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const cells = [...gridRef.current!.querySelectorAll<HTMLElement>("[data-parity-scene]")];
      const byId = new Map<string, Partial<Record<A13Theme, { bytes: string; material: ReturnType<typeof sceneMaterialReport> }>>>();
      for (const cell of cells) {
        const [id, theme] = cell.dataset.parityScene!.split("|") as [string, A13Theme];
        const scene = cell.querySelector<HTMLElement>("[data-testid=a13-pilot-scene]")!;
        // Both themes are measured at the SAME viewport origin (0, 0), at
        // 1670 px: rotated boxes are then compared without the float noise
        // of different page positions, and hit-testing sees this scene on top.
        scene.style.cssText = "position:fixed;left:0;top:0;width:1670px;margin:0;z-index:100000";
        const bytes = snapshotBytes(domGeometrySnapshot(scene));
        scene.removeAttribute("style");
        const e = byId.get(id) ?? {};
        e[theme] = { bytes, material: sceneMaterialReport(scene) };
        byId.set(id, e);
      }
      const out: DomPair[] = [];
      const material: Material[] = [];
      const hashes: Record<string, { light: string; dark: string }> = {};
      for (const [id, e] of byId) {
        const l = e.light!;
        const d = e.dark!;
        out.push({ id, identical: l.bytes === d.bytes, diff: l.bytes === d.bytes ? null : firstDifference(JSON.parse(l.bytes), JSON.parse(d.bytes)), bytes: l.bytes.length });
        material.push({ ...l.material, fixture: id }, { ...d.material, fixture: id });
        hashes[id] = { light: await sha256(l.bytes), dark: await sha256(d.bytes) };
      }
      if (alive) setDom({ pairs: out, material, hashes });
    })();
    return () => {
      alive = false;
    };
  }, [done, master]);

  const [engineHashes, setEngineHashes] = useState<Record<string, { light: string; dark: string }>>({});
  useEffect(() => {
    if (!done) return;
    let alive = true;
    void (async () => {
      const out: Record<string, { light: string; dark: string }> = {};
      for (const p of pairs) out[p.fixture.id] = { light: await sha256(snapshotBytes(p.snapLight)), dark: await sha256(snapshotBytes(geometrySnapshot(p.dark, dark.title!))) };
      if (alive) setEngineHashes(out);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- computed once the run is complete
  }, [done]);

  const srcFor = (m: ParityMedia) =>
    (m.ratioId.startsWith("master:") ? master?.[m.ratioId] : m.ratioId.startsWith("pool:") ? A13_PILOT_MEDIA_POOL[Number(m.ratioId.slice(5))].src : RATIO_IMAGES[m.ratioId]) ?? null;

  const scene = (p: Pair, theme: A13Theme) => {
    const run = theme === "light" ? p.light : p.dark;
    const interactive = run.v2 !== null;
    return (
      <section key={`${p.fixture.id}|${theme}`} className={styles.cell} data-parity-scene={`${p.fixture.id}|${theme}`} data-testid={`dark-${p.fixture.id}-${theme}`}>
        <h2 className={styles.label}>
          {theme.toUpperCase()} · {p.fixture.id} · {run.status}
          {run.hasCta ? " · CTA" : ""}
        </h2>
        <A13PilotScene
          stateId={run.stateId}
          theme={theme}
          title={A13_PILOT_TITLE.title}
          subtitle={A13_PILOT_TITLE.subtitle}
          entries={run.entries.map((e, i) => ({ slot: e.slot, layout: e.layout, src: srcFor(e.media), alt: `Souvenir ${i + 1}`, caption: e.caption }))}
          cta={run.hasCta ? { label: A13_CTA_7PLUS_PILOT_LABELS.fr.text, lang: "fr", onActivate: () => setActivated(`${p.fixture.id}|${theme}|CTA`) } : null}
          {...(interactive ? { onActivate: (id: string) => setActivated(`${p.fixture.id}|${theme}|${id}`) } : {})}
        />
      </section>
    );
  };

  const engineOk = done && pairs.every((p) => p.engineIdentical);
  const domOk = !!dom && dom.pairs.every((p) => p.identical);
  const bgOk = !!bg && bg.sha256 === A13_DARK_BACKGROUND.sha256;
  const bgDimOk = !!bg && bg.width === A13_DARK_BACKGROUND.width && bg.height === A13_DARK_BACKGROUND.height;
  const photoOk = !!dom && dom.material.every((m) => m.photos.every((ph) => !ph.processed));

  return (
    <main className={styles.page}>
      {light.probe}
      {dark.probe}
      <header className={styles.head}>
        <h1 className={styles.h1}>A13 · Desktop Dark · pilote runtime V1.1 — parité Light/Dark ({fixtures.length} paires)</h1>
        <div className={styles.controls}>
          <span data-testid="dark-pipelines">
            Light {light.font?.fontCheck && light.title?.fontsChecked ? "prêt" : "…"} · Dark {dark.font?.fontCheck && dark.title?.fontsChecked ? "prêt" : "…"}
          </span>
          <span data-testid="dark-progress">{dom ? `terminé (${pairs.length})` : done ? `rendu ${pairs.length}…` : `calcul ${pairs.length}…`}</span>
          <span data-testid="dark-verdict">
            {dom
              ? engineOk && domOk
                ? "BYTE_IDENTICAL_GEOMETRY_SNAPSHOT"
                : A13_DARK_PARITY_CONTRACT.failure
              : "…"}
            {bg ? ` · fond ${bgOk ? "hash OK" : "DARK_BACKGROUND_HASH_MISMATCH_STOP"} · ${bgDimOk ? `${bg.width}×${bg.height}` : "DARK_BACKGROUND_DIMENSION_MISMATCH_STOP"}` : ""}
            {dom ? ` · photos ${photoOk ? "naturelles" : "DARK_PHOTO_PROCESSING_STOP"}` : ""}
          </span>
          <span data-testid="dark-activated">{activated}</span>
        </div>
      </header>

      <table className={styles.matrix} data-testid="dark-parity">
        <thead>
          <tr>
            <th>Paire</th>
            <th>Statut moteur</th>
            <th>Snapshot moteur L/D</th>
            <th>Snapshot DOM rendu L/D</th>
          </tr>
        </thead>
        <tbody>
          {pairs.map((p) => {
            const d = dom?.pairs.find((x) => x.id === p.fixture.id);
            return (
              <tr key={p.fixture.id}>
                <td>{p.fixture.id}</td>
                <td>{p.light.status}</td>
                <td className={p.engineIdentical ? undefined : styles.stop}>{p.engineIdentical ? `identique (${p.bytes} octets)` : `THEME_GEOMETRY_PARITY_STOP ${p.engineDiff}`}</td>
                <td className={!d || d.identical ? undefined : styles.stop}>{d ? (d.identical ? `identique (${d.bytes} octets)` : `THEME_GEOMETRY_PARITY_STOP ${d.diff}`) : "…"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className={styles.grid} ref={gridRef}>
        {master ? pairs.flatMap((p) => [scene(p, "light"), scene(p, "dark")]) : null}
      </div>

      {dom ? (
        <pre hidden data-testid="dark-json">
          {JSON.stringify({
            contract: { required: A13_DARK_PARITY_CONTRACT.required, pairs: A13_DARK_PARITY_CONTRACT.minimalPilotMatrix.geometryPairs },
            pipelines: Object.fromEntries(
              (["light", "dark"] as const).map((t) => {
                const p = t === "light" ? light : dark;
                return [t, { fontFamily: p.font?.fontFamily, fontCheck: p.font?.fontCheck, title: p.title ? { heading: p.title.heading, microcopy: p.title.microcopy, maskBounds: p.title.mask.bounds, fontsChecked: p.title.fontsChecked } : null }];
              }),
            ),
            background: bg,
            verdict: { engine: engineOk, dom: domOk, background: bgOk && bgDimOk, photos: photoOk },
            pairs: pairs.map((p) => ({
              id: p.fixture.id,
              supplementary: p.fixture.ratioSet === "reference-green",
              status: p.light.status,
              engineIdentical: p.engineIdentical,
              engineDiff: p.engineDiff,
              engineBytes: p.bytes,
              engineSha256: engineHashes[p.fixture.id] ?? null,
              dom: dom.pairs.find((x) => x.id === p.fixture.id) ?? null,
              domSha256: dom.hashes[p.fixture.id] ?? null,
              hasCta: p.light.hasCta,
              captionLines: p.light.entries.map((e) => e.caption?.lines.length ?? 0),
              captionStatus: p.light.entries.map((e) => e.caption?.status ?? null),
            })),
            snapshots: pairs.map((p) => p.snapLight),
            material: dom.material,
          })}
        </pre>
      ) : null}
    </main>
  );
}
