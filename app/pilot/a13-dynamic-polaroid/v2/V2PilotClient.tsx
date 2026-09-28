"use client";

import { useEffect, useRef, useState } from "react";
import { A13_V2_FIXTURES, A13_V2_MANIFESTS, type V2AssignmentId, type V2CaptionState, type V2StateId } from "@/config/gallery-a13-v2-manifests";
import { fixtureSources, masterMediaRatio, masterSelfCheck, solveV2, v2SlotToA13, type V2Result, type V2SelfCheck } from "@/lib/memorial/gallery/gallery-v2";
import { maskRects, measureTitleGlyphMask, type TitleGlyphMeasure } from "@/lib/memorial/gallery/title-glyph-mask";
import { A13_V2_1_TITLE } from "@/config/gallery-a13-v2-manifests";
import { layoutDynamicPolaroid } from "@/lib/memorial/gallery/dynamic-polaroid-layout";
import { layoutCaption } from "@/lib/memorial/gallery/caption-layout";
import { obstaclesAbove } from "@/lib/memorial/gallery/dynamic-polaroid-qa";
import { useCaptionMeasurer } from "@/lib/memorial/gallery/use-caption-measurer";
import { A13_PILOT_TITLE } from "@/lib/memorial/gallery/a13-pilot-fixtures";
import { A13CaptionFontProbe, A13PilotScene, type A13PilotSceneEntry } from "@/components/memorial/gallery/A13PilotScene";
import styles from "../etats/page.module.css";

/**
 * G2→G5 V2 pilot, CONTRACT PATCH V2.1 + QG arbitration "TITLE AUTHORITY
 * FINAL": the title authority is the REAL RENDERED GLYPH MASK (heading and
 * microcopy measured separately with the loaded font at scale 1, dilated
 * 3 px). The only title gate is the font actually being loaded
 * (`TITLE_FONT_NOT_LOADED` STOP); the retired V2.1 reference boxes are
 * reported for information only. The Master self-check is a GRAMMAR check:
 * a valid runtime solution must exist in the territories.
 * Views (`?vue=`):
 * - `selfcheck` (default): each state's Master witness (Master media
 *   ratios, s = 1, no translation) with the measured title zone, and the
 *   runtime Master self-check for the four caption states;
 * - `matrice`: the common fixture matrix (6 assignments × 4 captions per
 *   state). A state whose Master self-check fails is a state-level STOP:
 *   its fixtures are not executed (package QA rule 2). Executed cases are
 *   rendered interactive at 1670 px for the DOM accessibility check;
 * - `planche&cas=G2:mixed-natural:target-24,…`: compact boards.
 */

const STATES = ["G2", "G3", "G4", "G5"] as const;
const BASE = "/pilot/a13-dynamic-polaroid";
const RATIO_IMAGES: Record<string, string> = {
  landscape: `${BASE}/p2-paysage-4x3.jpg`,
  square: `${BASE}/p3-carre-1x1.jpg`,
  portrait: `${BASE}/p1-portrait-3x4.jpg`,
  "narrow-portrait": `${BASE}/p4-portrait-etroit-9x16.jpg`,
  "wide-landscape": `${BASE}/p5-paysage-large-16x9.jpg`,
  "bounded-panorama": `${BASE}/p6b-panorama-239x100.jpg`,
};
const IMAGE_RATIOS = Object.entries(A13_V2_FIXTURES.ratios);

const SHORT = ["Maman", "Tous les deux", "Son chapeau", "Sous l'arche", "Le ponton"];
const C24 = ["Maman, un soir à Gordes.", "Tous deux sur la colline", "Son chapeau, l'été 1982.", "Sous l'arche de la ferme", "Le ponton du lac, été 98"];
const C32 = "MAMAN ET MAMIE, À MIMIZAN, 1966.";
function v2Caption(state: V2CaptionState, i: number): string | null {
  return state === "none" ? null : state === "short-one-line" ? SHORT[i % 5] : state === "target-24" ? C24[i % 5] : C32;
}

/** Master-like fixture media: the nearest test photo, centre-cropped at
 * runtime to the exact Master ratio (the media itself — never distorted). */
function useMasterImages() {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    const out: Record<string, string> = {};
    const jobs = STATES.flatMap((st) =>
      A13_V2_MANIFESTS[st].slots.map(async (s) => {
        const r = masterMediaRatio(s);
        const [id] = [...IMAGE_RATIOS].sort((a, b) => Math.abs(Math.log(a[1] / r)) - Math.abs(Math.log(b[1] / r)))[0];
        const img = new Image();
        img.src = RATIO_IMAGES[id];
        await img.decode();
        const iw = img.naturalWidth;
        const ih = img.naturalHeight;
        const cw = Math.min(iw, ih * r);
        const ch = cw / r;
        const c = document.createElement("canvas");
        c.width = Math.round(1200 * Math.min(1, r));
        c.height = Math.round(c.width / r);
        c.getContext("2d")!.drawImage(img, (iw - cw) / 2, (ih - ch) / 2, cw, ch, 0, 0, c.width, c.height);
        out[s.slotId] = c.toDataURL("image/jpeg", 0.9);
      }),
    );
    void Promise.all(jobs).then(() => {
      if (alive) setUrls(out);
    });
    return () => {
      alive = false;
    };
  }, []);
  return urls;
}

function imageFor(state: V2StateId, assignment: V2AssignmentId, i: number, master: Record<string, string>) {
  const a = A13_V2_FIXTURES.assignments.find((x) => x.id === assignment)!;
  return a.cycle ? RATIO_IMAGES[a.cycle[i % a.cycle.length]] : master[A13_V2_MANIFESTS[state].slots[i].slotId];
}

interface Case {
  state: V2StateId;
  assignment: V2AssignmentId;
  captions: V2CaptionState;
  result: V2Result | null;
  ms: number;
}

type Font = ReturnType<typeof useCaptionMeasurer>;

function entriesFor(c: Case, master: Record<string, string>): A13PilotSceneEntry[] {
  return (c.result?.slots ?? []).map((s, i) => ({
    slot: s.slot,
    layout: s.layout,
    src: imageFor(c.state, c.assignment, i, master) ?? null,
    alt: `Souvenir ${i + 1}`,
    caption: s.caption,
  }));
}

/** Master media ratios at given transforms (witness: Δ 0, s 1). */
function witnessEntries(state: V2StateId, captions: V2CaptionState, font: Font, master: Record<string, string>, solution?: V2SelfCheck["solution"]): A13PilotSceneEntry[] {
  const m = A13_V2_MANIFESTS[state];
  const placed = m.slots.map((s, i) => {
    const t = solution?.[i]?.translation ?? { x: 0, y: 0 };
    const k = solution?.[i]?.scale ?? 1;
    const slot = v2SlotToA13(s, { x: s.witness.center.x + t.x, y: s.witness.center.y + t.y });
    return { slot, layout: layoutDynamicPolaroid(slot, { width: masterMediaRatio(s) * 1000, height: 1000 }, k * k) };
  });
  return placed.map(({ slot, layout }, i) => {
    const text = v2Caption(captions, i);
    return { slot, layout, src: master[slot.slotId] ?? null, alt: `Souvenir ${i + 1}`, caption: font && text ? layoutCaption(slot, layout, text, font.measurer, obstaclesAbove(placed, slot)) : null };
  });
}

export function V2PilotClient() {
  const rootRef = useRef<HTMLDivElement>(null);
  const titleSceneRef = useRef<HTMLDivElement>(null);
  const font = useCaptionMeasurer(rootRef);
  const master = useMasterImages();
  const [view, setView] = useState<"selfcheck" | "matrice" | "planche">("selfcheck");
  const [picked, setPicked] = useState<string[]>([]);
  const [title, setTitle] = useState<TitleGlyphMeasure | null>(null);
  const [checks, setChecks] = useState<(V2SelfCheck & { captions: V2CaptionState })[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [done, setDone] = useState(false);
  const [activated, setActivated] = useState<string>("");

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    /* eslint-disable react-hooks/set-state-in-effect -- one-shot hydration of URL presets */
    const v = q.get("vue");
    if (v === "matrice" || v === "planche") setView(v);
    setPicked((q.get("cas") ?? "").split(",").filter(Boolean));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Title (V2.1): real glyph masks at the canonical 1670 px, scale 1.
  useEffect(() => {
    if (!font?.fontCheck || !titleSceneRef.current) return;
    let alive = true;
    void measureTitleGlyphMask(titleSceneRef.current).then((t) => {
      if (alive && t) setTitle(t);
    });
    return () => {
      alive = false;
    };
  }, [font]);

  // Master self-check (every state × caption state), then the cases.
  useEffect(() => {
    if (!font?.fontCheck || !title) return;
    // TITLE_FONT_METRICS_MISMATCH: STOP before anything else.
    // The font must really be loaded; nothing else about the title is predicted.
    const offContract = !title.fontsChecked;
    if (offContract) {
      /* eslint-disable-next-line react-hooks/set-state-in-effect -- terminal STOP state */
      setDone(true);
      return;
    }
    const mask = title.mask;
    const sc = STATES.flatMap((st) => A13_V2_FIXTURES.captions.map((c) => ({ ...masterSelfCheck(st, A13_V2_MANIFESTS[st].slots.map((_, i) => v2Caption(c, i)), font.measurer, mask), captions: c })));
    const failing = new Set(sc.filter((x) => x.result !== "MASTER SELF-CHECK: PASS").map((x) => x.state));
    const todo: Omit<Case, "result" | "ms">[] =
      offContract
        ? []
        : view === "matrice"
        ? STATES.flatMap((state) => A13_V2_FIXTURES.assignments.flatMap((a) => A13_V2_FIXTURES.captions.map((c) => ({ state, assignment: a.id, captions: c }))))
        : view === "planche"
          ? picked.map((p) => {
              const [state, assignment, captions] = p.split(":");
              return { state: state as V2StateId, assignment: assignment as V2AssignmentId, captions: captions as V2CaptionState };
            })
          : [];
    let alive = true;
    const out: Case[] = [];
    setChecks(sc);
    setCases([]);
    setDone(false);
    const step = (i: number) => {
      if (!alive) return;
      if (i >= todo.length) {
        setDone(true);
        return;
      }
      const t = todo[i];
      const t0 = performance.now();
      // Package QA rule 2: a state whose Master fails is not executed.
      const result = failing.has(t.state)
        ? null
        : solveV2({ state: t.state, sources: fixtureSources(t.state, t.assignment), captions: A13_V2_MANIFESTS[t.state].slots.map((_, k) => v2Caption(t.captions, k)), measurer: font.measurer, titleMask: mask });
      out.push({ ...t, result, ms: Math.round(performance.now() - t0) });
      setCases([...out]);
      setTimeout(() => step(i + 1), 0);
    };
    setTimeout(() => step(0), 0);
    return () => {
      alive = false;
    };
  }, [font, title, view, picked]);

  const maskOverlay = title ? maskRects(title.mask) : [];
  const scene = (key: string, label: string, entries: A13PilotSceneEntry[], stop: boolean, interactive: boolean, qa: boolean) => (
    <section key={key} className={styles.cell} data-testid={`v2-${key}`}>
      <h2 className={stop ? `${styles.label} ${styles.stop}` : styles.label}>{label}</h2>
      <A13PilotScene
        stateId={key}
        title={A13_PILOT_TITLE.title}
        subtitle={A13_PILOT_TITLE.subtitle}
        entries={entries}
        qa={qa}
        qaTitleMaskRects={qa ? maskOverlay : []}
        language="fr"
        {...(interactive ? { onActivate: (id: string) => setActivated(`${key}|${id}`) } : {})}
      />
    </section>
  );

  const caseLabel = (c: Case) => {
    const r = c.result;
    const head = `${c.state} · ${c.assignment} · ${c.captions}`;
    if (!r) return `${head} · NON EXÉCUTÉ — MANIFEST_REJECTS_OWN_MASTER_STOP (état)`;
    if (r.status !== "PASS") return `${head} · ${r.status} · ${r.stop?.rule} · ${r.stop?.detail}`;
    return `${head} · PASS · ${r.slots.map((s) => `${s.slotId.slice(3)} s ${s.scale.toFixed(3)} Δ(${s.translation.x}, ${s.translation.y})`).join(" · ")}`;
  };

  return (
    <main className={styles.page} ref={rootRef}>
      <A13CaptionFontProbe />
      <div ref={titleSceneRef} style={{ position: "absolute", width: 1670, left: -20000, top: 0 }} aria-hidden="true">
        <A13PilotScene stateId="title" title={A13_PILOT_TITLE.title} subtitle={A13_PILOT_TITLE.subtitle} entries={[]} />
      </div>
      <header className={styles.head}>
        <h1 className={styles.h1}>A13 · Desktop Light · G2→G5 · manifests simplifiés V2 — {view}</h1>
        <div className={styles.controls}>
          <span data-testid="v2-font">{font?.fontCheck ? "La Belle Aurore chargée" : "police en attente…"}</span>
          <span data-testid="v2-title">
            {title
              ? `titre ${title.heading.xMin}…${title.heading.xMax} × ${title.heading.yMin}…${title.heading.yMax} · microcopy ${title.microcopy.xMin}…${title.microcopy.xMax} × ${title.microcopy.yMin}…${title.microcopy.yMax} · masque réel + ${A13_V2_1_TITLE.dilationPx} px · ${title.fontsChecked ? "police chargée" : "TITLE_FONT_NOT_LOADED"} · (info : écart à l’ancienne référence V2.1 ${title.deviationPx.heading} / ${title.deviationPx.microcopy} px)`
              : "titre en mesure…"}
          </span>
          <span data-testid="v2-progress">{done ? `terminé (${cases.length})` : `calcul ${cases.length}…`}</span>
          <span data-testid="v2-activated">{activated}</span>
        </div>
      </header>

      <table className={styles.matrix} data-testid="v2-selfcheck">
        <thead>
          <tr>
            <th>État</th>
            <th>Captions</th>
            <th>Master grammar self-check (solution runtime dans les territoires)</th>
            <th>Témoin exact (information)</th>
          </tr>
        </thead>
        <tbody>
          {checks.map((c) => (
            <tr key={`${c.state}-${c.captions}`}>
              <td>{c.state}</td>
              <td>{c.captions}</td>
              <td>
                {c.result} {c.failures.join(" ; ")}
                {c.solution.length ? ` · ${c.solution.map((x) => `${x.slotId.slice(3)} Δ(${x.translation.x}, ${x.translation.y}) s ${x.scale.toFixed(3)}`).join(" · ")}` : ""}
              </td>
              <td>{c.witnessExact.ok ? "sans collision" : c.witnessExact.failures.join(" ; ")}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className={styles.grid}>
        {view === "selfcheck"
          ? STATES.map((st) => {
              const chk = checks.find((c) => c.state === st && c.captions === "none");
              return scene(
                `master-${st}`,
                `${st} · Master grammar (ratios Master) · ${chk?.result ?? "…"}${chk?.solution.length ? ` · ${chk.solution.map((x) => `${x.slotId.slice(3)} Δ(${x.translation.x}, ${x.translation.y}) s ${x.scale.toFixed(3)}`).join(" · ")}` : ""}`,
                witnessEntries(st, "none", font, master, chk?.solution),
                checks.some((c) => c.state === st && c.result !== "MASTER SELF-CHECK: PASS"),
                true,
                true,
              );
            })
          : cases.map((c) => {
              const key = `${c.state}-${c.assignment}-${c.captions}`;
              return c.result && c.result.status === "PASS"
                ? scene(key, caseLabel(c), entriesFor(c, master), false, true, false)
                : (
                    <section key={key} className={styles.cell} data-testid={`v2-${key}`}>
                      <h2 className={`${styles.label} ${styles.stop}`}>{caseLabel(c)}</h2>
                    </section>
                  );
            })}
      </div>

      {view === "selfcheck" && checks.length ? (
        <pre hidden data-testid="v2-selfcheck-json">{JSON.stringify({ fontNotLoaded: !!title && !title.fontsChecked, checks, mask: title?.mask ?? null })}</pre>
      ) : null}
      {done ? (
        <pre hidden data-testid="v2-json">
          {JSON.stringify({
            title: title ? { heading: title.heading, microcopy: title.microcopy, deviationPx: title.deviationPx, fontsChecked: title.fontsChecked, maskBounds: title.mask.bounds } : null,
            selfCheck: checks,
            cases: cases.map((c) => ({
              state: c.state,
              assignment: c.assignment,
              captions: c.captions,
              ms: c.ms,
              status: c.result ? c.result.status : "MANIFEST_REJECTS_OWN_MASTER_STOP",
              executed: !!c.result,
              stop: c.result?.stop ?? null,
              signals: c.result?.signals ?? [],
              masterCost: c.result?.masterCost ?? null,
              jointCandidates: c.result?.jointCandidates ?? null,
              search: c.result?.search ?? null,
              relations: c.result?.relations ?? null,
              slots: (c.result?.slots ?? []).map((s) => ({
                slotId: s.slotId,
                role: s.role,
                mediaRatio: s.layout.mediaRatio,
                mediaClass: s.layout.mediaClass,
                scale: s.scale,
                scaleInPreferred: s.scaleInPreferred,
                translation: s.translation,
                center: s.center,
                area: s.area,
                visiblePhoto: s.visiblePhoto,
                visibleOuter: s.visibleOuter,
                captionVisibleInk: s.captionVisibleInk,
                captionLines: s.caption?.lines.length ?? null,
                captionStatus: s.caption?.status ?? null,
                captionShift: s.caption?.shiftX ?? null,
                captionExceedsWidth: s.caption?.exceedsUsefulWidth ?? null,
                minima: s.minima,
                hitTarget: s.hitTarget,
              })),
            })),
          })}
        </pre>
      ) : null}
    </main>
  );
}
