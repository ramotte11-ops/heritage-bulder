"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import type { Language } from "@/config/languages";
import type { SkinVariant } from "@/config/skins";
import {
  OFFERINGS_V1_INK,
  OFFERINGS_V1_TOKENS,
  type ImageBase,
  type OfferingKind,
  type OfferingsV1Box,
  type OfferingsV1Composition,
  type OfferingsV1Glow,
  type OfferingsV1Lines,
  type OfferingsV1Shadow,
  type OfferingsV1Text,
} from "@/config/symbolic-offerings-v1-tokens";
import { SkinScope } from "@/components/memorial/SkinScope";
import { ebGaramond, ebGaramondItalic, laBelleAurore, offeringsMediumSerif } from "@/components/builder/fonts";
import {
  MOTION_END,
  VEIL,
  gestureSteps,
  returnSteps,
  statusSteps,
  stepsEnd,
  transitionSteps,
  type AnimationStep,
} from "./choreography";
import { OFFERINGS_V1_TEXTS, type OfferingsV1Texts } from "./texts";
import styles from "./SymbolicOfferingsSceneV1.module.css";

/**
 * Offrandes symboliques V1 — pilote (M1 statique, M2 animé). Branché sur
 * le registre des rubriques en M3 par `SymbolicOfferingsV1Section`, qui ne
 * le dessine que dans la Preview du Builder ; hors parcours client.
 *
 * Trois états :
 *  - « cartes » : décor de sélection validé et trois cartes-boutons. Les
 *    textes posés sur ce décor sont validés (F1 : partie artistique des
 *    cartes close, 4 variantes) ;
 *  - « scène » : après le choix, transition A (fondu enchaîné voilé) vers le
 *    fond de recueillement, une seule offrande et son animation (bougie :
 *    allumage depuis la mèche ; lys : dépôt ; cœur : apparition douce).
 *    La confirmation validée n'apparaît qu'après la réponse favorable de
 *    `transmit` ET la fin du mouvement ; en cas d'échec, l'offrande reste,
 *    sans confirmation, avec « Réessayer ». La scène reste affichée jusqu'à
 *    l'action du visiteur ;
 *  - « retour » : « Poursuivre la visite » ramène aux trois cartes quand
 *    `continueAction` vaut `"returnToCards"` (pilote, future Preview du
 *    Builder : essais libres, rien n'est enregistré).
 *
 * `transmit` est fourni par l'hôte. Ce composant n'écrit jamais rien : le
 * pilote passe une réponse simulée.
 *
 * Réduction des animations (préférence du système, ou `reducedMotion`) :
 * l'état final s'affiche directement, sans fondu ni mouvement.
 *
 * Mobile et Desktop : deux compositions, une seule affichée selon la
 * largeur RÉELLE du conteneur (requête de conteneur à 1024 px) ; l'autre
 * est en `display: none`, ses images différées ne sont pas téléchargées.
 * Géométrie en px de canevas (`--px`), textes posés par leur ligne de base
 * avec un plancher de lecture. Textes FR / EN / ES : `./texts.ts` (mêmes
 * géométrie et lignes de base dans les trois langues).
 */


export type OfferingsV1State =
  | { phase: "cards" }
  | { phase: "scene"; offering: OfferingKind; status: "pending" | "confirmed" | "failed" }
  | { phase: "returning"; offering: OfferingKind };

export interface SymbolicOfferingsV1Props {
  skinVariant: SkinVariant;
  /** Langue des textes (`./texts.ts`) ; la géométrie ne change pas. */
  language?: Language;
  /** `"page"` → titre `<h1>` ; `"section"` → `<h2>`. */
  headingLevel?: "page" | "section";
  /** Scène affichée d'emblée, déjà confirmée et immobile (contrôle des
   * maquettes). Sans valeur : l'état « cartes ». */
  initialOffering?: OfferingKind | null;
  /** Transmission du geste par l'hôte ; `true` = enregistré. Sans valeur :
   * aperçu, confirmation simulée immédiate (aucune écriture). */
  transmit?: (offering: OfferingKind) => Promise<boolean>;
  /** « Poursuivre la visite » : retour aux cartes, action de l'hôte, ou
   * rien (bouton inerte, contrôle statique). */
  continueAction?: "returnToCards" | ((offering: OfferingKind) => void) | null;
  /** Force la réduction des animations (sinon : préférence du système). */
  reducedMotion?: boolean;
  /** Facteur de durée (pilote : 4 = ralenti à 25 %). */
  timeScale?: number;
  onStateChange?: (state: OfferingsV1State) => void;
}

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReduced(onChange: () => void) {
  const mq = window.matchMedia?.(REDUCED_QUERY);
  mq?.addEventListener("change", onChange);
  return () => mq?.removeEventListener("change", onChange);
}

function useSystemReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia?.(REDUCED_QUERY).matches ?? false,
    () => false,
  );
}

type AnimRequest = { type: "enter"; offering: OfferingKind } | { type: "status" } | { type: "return" };

export function SymbolicOfferingsV1({
  skinVariant,
  language = "fr",
  headingLevel = "section",
  initialOffering = null,
  transmit,
  continueAction = "returnToCards",
  reducedMotion,
  timeScale = 1,
  onStateChange,
}: SymbolicOfferingsV1Props) {
  const tokens = OFFERINGS_V1_TOKENS[skinVariant];
  const ink = OFFERINGS_V1_INK[skinVariant];
  const text = OFFERINGS_V1_TEXTS[language];
  const systemReduced = useSystemReducedMotion();
  const reduced = reducedMotion ?? systemReduced;

  const [state, setState] = useState<OfferingsV1State>(
    initialOffering !== null ? { phase: "scene", offering: initialOffering, status: "confirmed" } : { phase: "cards" },
  );
  const [announcement, setAnnouncement] = useState("");
  const [warm, setWarm] = useState<ReadonlySet<OfferingKind>>(() => new Set());
  const warmUp = useCallback((offering: OfferingKind) => setWarm((w) => (w.has(offering) ? w : new Set([...w, offering]))), []);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const runRef = useRef(0);
  const animRequest = useRef<AnimRequest | null>(null);
  const focusRequest = useRef<string | null>(null);
  const animations = useRef<Animation[]>([]);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    onStateChange?.(state);
  }, [state, onStateChange]);

  const clearPending = useCallback(() => {
    animations.current.forEach((a) => a.cancel());
    animations.current = [];
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }, []);
  useEffect(() => clearPending, [clearPending]);

  const wait = useCallback(
    (ms: number) => new Promise<void>((resolve) => timers.current.push(window.setTimeout(resolve, ms))),
    [],
  );

  // Joue les étapes demandées par le dernier changement d'état, avant
  // l'affichage (aucune image de l'état final ne précède l'animation).
  useLayoutEffect(() => {
    const root = rootRef.current;
    const request = animRequest.current;
    animRequest.current = null;
    if (root !== null && request !== null) {
      const steps: AnimationStep[] =
        request.type === "enter"
          ? [...transitionSteps(skinVariant), ...gestureSteps(request.offering)]
          : request.type === "status"
            ? statusSteps()
            : returnSteps();
      for (const step of steps) {
        for (const node of root.querySelectorAll<HTMLElement>(`[data-a~="${step.target}"]`)) {
          // Sans API Web Animations, l'état final statique s'affiche tel quel.
          if (typeof node.animate !== "function") continue;
          const section = node.closest<HTMLElement>("[data-canvas-w]");
          const px = section !== null ? section.clientWidth / Number(section.dataset.canvasW) : 1;
          const keyframes = step.keyframes.map((k) =>
            typeof k.transform === "string" ? { ...k, transform: k.transform.split("{px}").join(`${px}px`) } : k,
          );
          animations.current.push(
            node.animate(keyframes, { duration: step.duration * timeScale, delay: step.delay * timeScale, easing: step.easing, fill: "backwards" }),
          );
        }
      }
    }
    const focusTarget = focusRequest.current;
    focusRequest.current = null;
    if (root !== null && focusTarget !== null) {
      const candidates = [...root.querySelectorAll<HTMLElement>(`[data-focus="${focusTarget}"]`)];
      // La composition affichée (l'autre est en `display: none`) ; à défaut
      // de mise en page, la première.
      (candidates.find((n) => n.getClientRects().length > 0) ?? candidates[0])?.focus({ preventScroll: true });
    }
  });

  const settle = useCallback(
    async (run: number, offering: OfferingKind, motion: Promise<void>) => {
      const send = transmit ?? (async () => true);
      let ok = false;
      try {
        [ok] = await Promise.all([send(offering), motion]);
      } catch {
        await motion;
        ok = false;
      }
      if (run !== runRef.current) return;
      if (!reduced) animRequest.current = { type: "status" };
      focusRequest.current = ok ? "confirmation" : "retry";
      setAnnouncement(ok ? text.layouts.mobile.confirmations[offering].join(" ") : text.failure);
      setState({ phase: "scene", offering, status: ok ? "confirmed" : "failed" });
    },
    [transmit, reduced, text],
  );

  const perform = useCallback(
    (offering: OfferingKind) => {
      if (state.phase !== "cards") return;
      clearPending();
      const run = ++runRef.current;
      if (!reduced) animRequest.current = { type: "enter", offering };
      focusRequest.current = "status";
      setAnnouncement("");
      setState({ phase: "scene", offering, status: "pending" });
      void settle(run, offering, reduced ? Promise.resolve() : wait(MOTION_END[offering] * timeScale));
    },
    [state.phase, clearPending, reduced, settle, wait, timeScale],
  );

  const retry = useCallback(() => {
    if (state.phase !== "scene" || state.status !== "failed") return;
    const run = ++runRef.current;
    focusRequest.current = "status";
    setAnnouncement("");
    setState({ phase: "scene", offering: state.offering, status: "pending" });
    void settle(run, state.offering, Promise.resolve());
  }, [state, settle]);

  const onContinue = useCallback(() => {
    if (state.phase !== "scene" || state.status !== "confirmed" || continueAction === null) return;
    if (typeof continueAction === "function") {
      continueAction(state.offering);
      return;
    }
    clearPending();
    const run = ++runRef.current;
    const offering = state.offering;
    setAnnouncement("");
    const done = () => {
      if (run !== runRef.current) return;
      focusRequest.current = `card-${offering}`;
      setState({ phase: "cards" });
    };
    if (reduced) {
      done();
      return;
    }
    animRequest.current = { type: "return" };
    setState({ phase: "returning", offering });
    void wait(stepsEnd(returnSteps()) * timeScale).then(done);
  }, [state, continueAction, clearPending, reduced, wait, timeScale]);

  return (
    <SkinScope skin="intemporel" skinVariant={skinVariant}>
      <div
        ref={rootRef}
        className={`${styles.wrap} ${offeringsMediumSerif.variable} ${ebGaramond.variable} ${ebGaramondItalic.variable} ${laBelleAurore.variable}`}
        data-variant={skinVariant}
        data-phase={state.phase}
        data-status={state.phase === "scene" ? state.status : undefined}
        data-offering={state.phase === "cards" ? undefined : state.offering}
        lang={language}
        style={
          {
            "--ink-title": ink.title,
            "--ink-lockup": ink.lockup,
            "--ink-body": ink.body,
            "--ink-script": ink.script,
            "--button-line": ink.buttonLine,
            "--button-label": ink.buttonLabel,
            "--veil": VEIL[skinVariant].color,
          } as CSSProperties
        }
      >
        {(["mobile", "desktop"] as const).map((layout) => (
          <Composition
            key={layout}
            layout={layout}
            composition={tokens[layout]}
            text={text}
            state={state}
            headingLevel={headingLevel}
            interactive={continueAction !== null}
            onPerform={perform}
            onRetry={retry}
            onContinue={onContinue}
            warm={warm}
            onWarm={warmUp}
            reduced={reduced}
          />
        ))}
        <p className={styles.srOnly} aria-live="polite">
          {announcement}
        </p>
      </div>
    </SkinScope>
  );
}

/** M1 — la scène finale d'un geste, immobile (contrôle des maquettes). */
export function SymbolicOfferingsSceneV1({
  offering,
  skinVariant,
  language = "fr",
  headingLevel = "section",
}: {
  offering: OfferingKind;
  skinVariant: SkinVariant;
  language?: Language;
  headingLevel?: "page" | "section";
}) {
  return (
    <SymbolicOfferingsV1
      skinVariant={skinVariant}
      language={language}
      headingLevel={headingLevel}
      initialOffering={offering}
      continueAction={null}
    />
  );
}

function boxVars(box: OfferingsV1Box): CSSProperties {
  return { "--l": box.left, "--t": box.top, "--w": box.width, "--h": box.height } as CSSProperties;
}

function textVars(prefix: string, text: OfferingsV1Text): Record<string, number> {
  return {
    [`--${prefix}-size`]: text.size,
    [`--${prefix}-base`]: text.baseline,
    ...(text.trackingEm !== undefined && { [`--${prefix}-track`]: text.trackingEm }),
  };
}

function linesVars(b: OfferingsV1Lines, x: number, floor: number, maxWidth: number): CSSProperties {
  return { "--x": x, "--size": b.size, "--base": b.baseline, "--step": b.step, "--floor": `${floor}px`, "--maxw": maxWidth } as CSSProperties;
}

function maskVars(base: ImageBase): CSSProperties {
  return { "--mask-avif": `url("${base}.avif")`, "--mask-webp": `url("${base}.webp")` } as CSSProperties;
}

/** Ombre portée : silhouette de l'objet, décalée et floutée (σ en px de canevas). */
function Shadow({ base, box, shadow, target }: { base: ImageBase; box: OfferingsV1Box; shadow: OfferingsV1Shadow; target: string }) {
  return (
    <div
      className={`${styles.box} ${styles.blur}`}
      data-a={target}
      style={{ ...boxVars({ ...box, left: box.left + shadow.dx, top: box.top + shadow.dy }), "--sigma": shadow.sigma } as CSSProperties}
    >
      <div className={`${styles.fill} ${styles.masked}`} style={{ ...maskVars(base), background: shadow.color }} />
    </div>
  );
}

/** Lueur radiale, décroissance (1 − d)^1,6 jusqu'au bord de l'ellipse. */
function glowStyle(g: OfferingsV1Glow): CSSProperties {
  const stops = Array.from({ length: 11 }, (_, i) => {
    const d = i / 10;
    const alpha = g.peak * Math.pow(1 - d, 1.6);
    return `rgb(${g.rgb.join(" ")} / ${alpha.toFixed(4)}) ${(d * 100).toFixed(0)}%`;
  });
  return {
    ...boxVars({ left: g.cx - g.rx, top: g.cy - g.ry, width: 2 * g.rx, height: 2 * g.ry }),
    backgroundImage: `radial-gradient(closest-side, ${stops.join(", ")})`,
  };
}

/** AVIF 4:4:4 principal, WebP sans perte en repli ; décoratif (alt vide). */
function Picture({
  base,
  className,
  style,
  target,
  eager,
  syncDecode,
}: {
  base: ImageBase;
  className: string;
  style?: CSSProperties;
  target?: string;
  eager?: boolean;
  /** Réduction des animations : l'image paraît avec le reste de l'état final. */
  syncDecode?: boolean;
}) {
  return (
    <picture>
      <source type="image/avif" srcSet={`${base}.avif`} />
      <img
        src={`${base}.webp`}
        alt=""
        className={className}
        style={style}
        data-a={target}
        loading={eager ? "eager" : "lazy"}
        decoding={syncDecode ? "sync" : "async"}
        draggable={false}
      />
    </picture>
  );
}

/** Préchargement d'une offrande (survol, focus, appui sur sa carte) : la même
 * `<picture>` que la scène, cachée, pour que le navigateur télécharge le
 * format qu'il affichera (AVIF ou WebP). */
function Warm({ composition, offering }: { composition: OfferingsV1Composition; offering: OfferingKind }) {
  const scene = composition.scenes[offering];
  return (
    <div hidden data-warm={offering}>
      <Picture base={scene.object} className={styles.box} eager />
      {scene.flame !== undefined && <Picture base={scene.flame.image} className={styles.box} eager />}
    </div>
  );
}

function Composition({
  layout,
  composition: C,
  text,
  state,
  headingLevel,
  interactive,
  onPerform,
  onRetry,
  onContinue,
  warm,
  onWarm,
  reduced,
}: {
  layout: "mobile" | "desktop";
  composition: OfferingsV1Composition;
  text: OfferingsV1Texts;
  state: OfferingsV1State;
  headingLevel: "page" | "section";
  interactive: boolean;
  onPerform: (offering: OfferingKind) => void;
  onRetry: () => void;
  onContinue: () => void;
  warm: ReadonlySet<OfferingKind>;
  onWarm: (offering: OfferingKind) => void;
  reduced: boolean;
}) {
  const TitleTag = headingLevel === "page" ? "h1" : "h2";
  const offering = state.phase === "cards" ? null : state.offering;
  const scene = offering !== null ? C.scenes[offering] : null;
  const inCards = state.phase === "cards";
  const status = state.phase === "scene" ? state.status : null;
  const sel = C.selection;
  const lines = text.layouts[layout];
  const confirmation = offering !== null ? lines.confirmations[offering] : [];
  const vars = {
    "--canvas-w": C.canvas.width,
    "--canvas-h": C.canvas.height,
    "--axis": C.axis,
    ...textVars("her", C.header.heritage),
    ...textVars("sub", C.header.subtitle),
    ...textVars("title", C.header.title),
    ...textVars("script", C.header.script),
    ...(scene !== null && {
      "--conf-size": scene.confirmation.size,
      "--conf-base": scene.confirmation.baseline,
      "--conf-lh": scene.confirmation.lineHeight,
      "--conf-max": scene.confirmation.textMaxWidth,
      "--button-gap": scene.buttonGap,
      "--button-max": scene.buttonMaxWidth,
    }),
  } as CSSProperties;

  return (
    <section
      className={styles.scene}
      data-layout={layout}
      data-testid={`offerings-v1-${layout}`}
      data-canvas-w={C.canvas.width}
      style={vars}
    >
      <Picture base={sel.decor} className={styles.fond} />
      <Picture base={C.fond} className={styles.fond} target="fond" style={{ opacity: state.phase === "scene" ? 1 : 0 }} syncDecode={reduced} />

      {scene !== null && offering !== null && (
        <div className={styles.offering} aria-hidden="true" data-a="offering" style={{ opacity: state.phase === "returning" ? 0 : 1 }}>
          <Shadow base={scene.object} box={scene.box} shadow={scene.shadows[0]} target="shadowLarge" />
          <Shadow base={scene.object} box={scene.box} shadow={scene.shadows[1]} target="shadowContact" />
          <Picture base={scene.object} className={styles.box} style={boxVars(scene.box)} target="object" eager syncDecode={reduced} />
          {scene.wax !== undefined && (
            <div className={`${styles.box} ${styles.wax} ${styles.masked}`} style={{ ...boxVars(scene.box), ...maskVars(scene.object) }} data-a="wax">
              <span className={`${styles.box} ${styles.glow}`} style={glowStyle(scene.wax)} />
            </div>
          )}
          {scene.halo !== undefined && <span className={`${styles.box} ${styles.glow}`} style={glowStyle(scene.halo)} data-a="halo" />}
          {scene.flame !== undefined && (
            <Picture
              base={scene.flame.image}
              className={styles.box}
              target="flame"
              eager
              syncDecode={reduced}
              style={{
                ...boxVars(scene.flame.box),
                transformOrigin: `calc(var(--px) * ${scene.flame.wick[0] - scene.flame.box.left}) calc(var(--px) * ${scene.flame.wick[1] - scene.flame.box.top})`,
              }}
            />
          )}
          {offering === "coeur" && (
            <div className={`${styles.box} ${styles.blur} ${styles.glow} ${styles.heartGlow}`} style={{ ...boxVars(scene.box), "--sigma": 18 } as CSSProperties} data-a="glow">
              <div className={`${styles.fill} ${styles.masked}`} style={{ ...maskVars(scene.object), background: "var(--heart-glow)" }} />
            </div>
          )}
        </div>
      )}

      {[...warm].map((k) => (
        <Warm key={k} composition={C} offering={k} />
      ))}

      <div className={styles.veil} data-a="veil" aria-hidden="true" />

      <header className={styles.header}>
        <p className={`${styles.text} ${styles.heritage}`}>{text.heritage}</p>
        <p className={`${styles.text} ${styles.subtitle}`}>{text.subtitle}</p>
        <TitleTag className={styles.heading}>
          <span className={`${styles.text} ${styles.title}`}>{text.title}</span>{" "}
          <span className={`${styles.text} ${styles.script}`}>{text.script}</span>
        </TitleTag>
      </header>

      {/* État « cartes » — validé (F1). `data-provisional` n'est plus qu'un
          repère de test, conservé tel quel. */}
      <div
        className={styles.layer}
        data-a="selectionText"
        style={{ opacity: inCards || state.phase === "returning" ? 1 : 0 }}
        aria-hidden={inCards ? undefined : true}
        inert={!inCards}
        data-provisional="cards-state"
      >
        <p className={`${styles.lines} ${styles.intro}`} style={linesVars(sel.intro, C.axis, 14, C.canvas.width * 0.62)}>
          {lines.intro.map((line) => (
            <span key={line} className={styles.line}>
              {line}{" "}
            </span>
          ))}
        </p>
        <ul className={styles.cards}>
          {sel.cards.map((card) => {
            const cx = card.box.left + card.box.width / 2;
            // Cartes fixes du décor : marges et planchers resserrés (12–13 px)
            // pour que les textes restent dans la carte jusqu'à 320 px.
            const inner = card.box.width - 24;
            const words = text.cards[card.kind];
            const label = `${words.title} — ${words.description.join(" ")}`;
            return (
              <li key={card.kind}>
                <button
                  type="button"
                  className={`${styles.box} ${styles.card}`}
                  style={boxVars(card.box)}
                  aria-label={label}
                  data-focus={`card-${card.kind}`}
                  data-card={card.kind}
                  onClick={() => onPerform(card.kind)}
                  onPointerEnter={() => onWarm(card.kind)}
                  onPointerDown={() => onWarm(card.kind)}
                  onFocus={() => onWarm(card.kind)}
                />
                <span
                  className={`${styles.lines} ${styles.cardTitle}`}
                  aria-hidden="true"
                  style={{ ...linesVars(card.title, cx, 13, inner), ...(card.ink !== undefined && { color: card.ink.title }) }}
                >
                  <span className={styles.line}>{words.title}</span>
                </span>
                <span
                  className={`${styles.lines} ${styles.cardText}`}
                  aria-hidden="true"
                  style={{ ...linesVars(card.description, cx, 12, inner), ...(card.ink !== undefined && { color: card.ink.body }) }}
                >
                  {words.description.map((line) => (
                    <span key={line} className={styles.line}>
                      {line}{" "}
                    </span>
                  ))}
                </span>
              </li>
            );
          })}
        </ul>
        <p className={`${styles.lines} ${styles.intro}`} style={linesVars(sel.footer, C.axis, 13, C.canvas.width * 0.62)}>
          {lines.footer.map((line) => (
            <span key={line} className={styles.line}>
              {line}{" "}
            </span>
          ))}
        </p>
      </div>

      {scene !== null && (
        <div className={styles.confirm} data-a="status" tabIndex={-1} data-focus="status" style={{ opacity: state.phase === "returning" ? 0 : 1 }}>
          {status !== "failed" && (
            <p className={styles.confirmText} tabIndex={-1} data-focus="confirmation" hidden={status === "pending"}>
              {confirmation.map((line) => (
                <span key={line} className={styles.line}>
                  {line}{" "}
                </span>
              ))}
            </p>
          )}
          {status === "failed" && <p className={styles.confirmText}>{text.failure}</p>}
          {status === "failed" ? (
            <button type="button" className={styles.continue} data-a="continue" data-focus="retry" data-interactive="" onClick={onRetry}>
              {text.retry}
            </button>
          ) : (
            <button
              type="button"
              className={styles.continue}
              data-a="continue"
              data-interactive={interactive ? "" : undefined}
              hidden={status === "pending"}
              onClick={onContinue}
            >
              {text.continue}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
