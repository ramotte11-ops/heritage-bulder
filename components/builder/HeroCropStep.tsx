"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Language } from "@/config/languages";
import type { EditorialContext } from "@/config/memorial";
import type { MemorialContent } from "@/types/memorial";
import type { Media } from "@/types/media";
import type { HeroCrop } from "@/types/hero";
import { translate } from "@/lib/i18n/translate";
import { useAutosave } from "@/lib/builder/use-autosave";
import {
  commitPageD,
  heroStepProgress,
  readHeroForEditing,
  reopenPageC,
  writeHeroCrop,
} from "@/lib/builder/guided-flow/hero-step";
import {
  HERO_CROP_MAX_ZOOM,
  HERO_CROP_MIN_ZOOM,
  NEUTRAL_HERO_CROP,
  clampHeroCropZoom,
  panHeroCrop,
  resolveHeroCropGeometry,
  zoomHeroCrop,
  type HeroCropImageSize,
} from "@/lib/memorial/hero-crop-geometry";
import { BuilderScreen } from "./BuilderScreen";
import { PrimaryButton } from "./PrimaryButton";
import screenStyles from "./BuilderScreen.module.css";
import styles from "./HeroCropStep.module.css";

interface HeroCropStepProps {
  language: Language;
  editorialContext: EditorialContext;
  /** The memorial's current draft content — PAGE A/PAGE B/PAGE C are
   * already guaranteed done by the time this renders (see
   * lib/builder/guided-flow/hero-step.ts's `needsPageD` and
   * app/builder/[memorialId]/page.tsx). */
  content: MemorialContent;
  /** The Hero's current photo, already resolved server-side — the exact
   * `Media` this screen re-verifies against at Continue time (mission
   * brief section 16), plus a short-lived signed URL to actually display
   * it (never persisted — Mission 030's private-read mechanism, mission
   * brief section 12). */
  photo: { media: Media; readUrl: string };
  /** A bound Server Action — same seam every Guided Flow screen uses. */
  persist: (content: MemorialContent) => Promise<{ updatedAt: string }>;
}

/** One directional nudge, as a percent of the crop window's own
 * width/height — deliberately small enough for fine control, large
 * enough to be useful from a single press (mission brief section 23:
 * an accessible, keyboard/pointer-independent path to move the focal
 * point). */
const PAN_STEP_PERCENT = 6;

const UNRESOLVED_IMAGE_SIZE: HeroCropImageSize = { naturalWidth: 0, naturalHeight: 0 };

/**
 * Mission 034 — PAGE D: T07, the Hero photo's crop. A neutral 4:5
 * window (mission brief sections 2-3) the family can move and zoom, but
 * NOT rotate, filter, or have auto-cropped for them (sections 19-20).
 * Structure per the mission brief section 21: a title, a short subtitle
 * ("Ajustez votre photo"), the crop window itself, move + zoom controls,
 * "Réinitialiser", "Changer la photo" and Continue. Never the Hero
 * itself (section 4) — no name, no dates, no shortPhrase, no papier/
 * Polaroid/botanicals/seal, no Light/Dark. T08 stays the first real
 * reveal.
 *
 * ## The geometry is never re-derived here
 *
 * Every pixel of placement math (the "cover" fit, the pan/zoom clamp
 * that guarantees no gap on any photo shape) lives in
 * lib/memorial/hero-crop-geometry.ts — the one shared source of truth
 * this screen and a future T08 renderer both read (mission brief
 * section 18). This component only wires user gestures (pointer drag,
 * the zoom slider, the four directional buttons) into that module's
 * pure `panHeroCrop`/`zoomHeroCrop`, and renders `resolveHeroCropGeometry`'s
 * own output as plain CSS percentages.
 *
 * ## State (mission brief sections 8, 13, 14)
 *
 * The working crop is never a second, parallel piece of state — it is
 * read straight off `content` every render (`hero.photo.crop`,
 * defaulting to `NEUTRAL_HERO_CROP` only for DISPLAY while it is still
 * `null`). Every drag/zoom/nudge/reset calls `writeHeroCrop` and updates
 * `content`, which `useAutosave` then debounces to `persist` — exactly
 * like every other Guided Flow field. That autosaved crop is NOT, by
 * itself, T07 complete: only `commitPageD` at an actual Continue click
 * writes T07's own `StepRecord`. If the family never touched anything
 * and clicks Continue straight away, the submit handler explicitly
 * writes `NEUTRAL_HERO_CROP` first — the neutral framing becomes the
 * family's real, recorded decision, never silently assumed.
 *
 * ## Durability (Mission 034 QG micro-audit)
 *
 * T07's `StepRecord` must never become durable before the crop it
 * corresponds to is itself durably persisted. A React state update
 * followed by a debounced autosave is NOT that guarantee on its own: a
 * drag/zoom edit right before clicking Continue leaves a pending (or
 * already in-flight) autosave of the OLDER, crop-only content that a
 * whole-content, last-write-wins draft save could otherwise apply AFTER
 * this screen's own commit, silently reverting T07. `handleSubmit` (and
 * `handleChangePhoto`, which has the identical exposure for T06) both
 * call `flush()` — `useAutosave`'s own drain-to-quiescence primitive
 * (see lib/builder/autosave-controller.ts's `flush` docstring for the
 * full mechanism) — BEFORE their own explicit `persist(...)` call, and
 * only after disabling every control that could arm a new one in the
 * meantime. If that drain itself fails, the explicit write is never
 * attempted either: a human error is shown and the family stays on this
 * exact screen, never advanced toward T08 on unconfirmed content. The
 * neutral-crop path needs no separate ordering at all — when nothing was
 * ever autosaved, the neutral crop and T07's completion are written
 * together in ONE atomic call, which is strictly stronger than two
 * sequential writes: there is no instant where either could be durable
 * without the other.
 *
 * ## Image dimensions (mission brief section 17)
 *
 * `Media.width`/`Media.height` are never populated by Mission 030 (see
 * types/media.ts) — the real dimensions are read directly off the
 * decoded `<img>` itself (`naturalWidth`/`naturalHeight`, on `onLoad`).
 * Until that fires, geometry renders against a defensive square
 * fallback (`hero-crop-geometry.ts`'s own documented behaviour) rather
 * than crashing or waiting.
 *
 * ## Accessibility (mission brief section 23)
 *
 * Dragging is one path, never the only one: the zoom slider is a real
 * `<input type="range">` (native keyboard support — arrows, Home/End),
 * and four labelled, focusable directional buttons nudge the focal
 * point without ever touching the pointer. `.cropWindow`'s own
 * `touch-action: none` (see its module CSS) only affects gestures
 * starting inside that one box — the page's own scroll is never
 * blocked anywhere else.
 */
export function HeroCropStep({ language, editorialContext, content: initialContent, photo, persist }: HeroCropStepProps) {
  const router = useRouter();

  const [content, setContent] = useState(initialContent);
  const [imageSize, setImageSize] = useState<HeroCropImageSize>(UNRESOLVED_IMAGE_SIZE);
  const [submitError, setSubmitError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReturning, setIsReturning] = useState(false);

  const { flush } = useAutosave({ content, persist });

  const windowRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(null);

  const read = readHeroForEditing(content);
  const controlsDisabled = isSubmitting || isReturning;

  function applyCrop(nextCrop: HeroCrop) {
    const written = writeHeroCrop(content, nextCrop);
    if (written.ok) setContent(written.content);
  }

  function pan(deltaXPercent: number, deltaYPercent: number, crop: HeroCrop) {
    applyCrop(panHeroCrop(imageSize, crop, deltaXPercent, deltaYPercent));
  }

  function handleImageLoad(event: React.SyntheticEvent<HTMLImageElement>) {
    const img = event.currentTarget;
    setImageSize({ naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight });
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (controlsDisabled) return;
    // Optional call: not every test/older environment implements Pointer
    // Capture — the drag still works without it, just without the
    // "keep tracking even if the pointer leaves the box" guarantee.
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragState.current = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY };
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>, crop: HeroCrop) {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const rect = windowRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;

    const deltaXPercent = ((event.clientX - drag.lastX) / rect.width) * 100;
    const deltaYPercent = ((event.clientY - drag.lastY) / rect.height) * 100;
    dragState.current = { pointerId: drag.pointerId, lastX: event.clientX, lastY: event.clientY };
    pan(deltaXPercent, deltaYPercent, crop);
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (dragState.current?.pointerId === event.pointerId) dragState.current = null;
  }

  function handleZoomChange(event: React.ChangeEvent<HTMLInputElement>, crop: HeroCrop) {
    applyCrop(zoomHeroCrop(imageSize, crop, Number(event.target.value)));
  }

  function handleReset() {
    applyCrop(NEUTRAL_HERO_CROP);
  }

  async function handleChangePhoto() {
    if (controlsDisabled) return;

    const reopened = reopenPageC(content);
    if (!reopened.ok) {
      setSubmitError(true);
      return;
    }

    // Disabled FIRST — before flush() ever awaits anything — so no new
    // drag/zoom/nudge can arm a further debounce while this drains (see
    // this component's own docstring, "Durability", and
    // autosave-controller.ts's `flush` docstring for the full
    // invariant this closes: a stale, still-pending/in-flight autosave
    // of an EARLIER content snapshot must never be able to land AFTER
    // this write and silently resurrect T06 as completed for the photo
    // the family is about to replace).
    setIsReturning(true);
    try {
      await flush();
    } catch {
      setSubmitError(true);
      setIsReturning(false);
      return;
    }

    try {
      await persist(reopened.content);
    } catch {
      setSubmitError(true);
      setIsReturning(false);
      return;
    }

    router.refresh();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    let toCommit = content;
    if (read.status === "ready" && read.hero.photo?.crop === null) {
      // Mission brief section 8 — the family accepted the neutral
      // framing without ever touching it: it becomes the explicit,
      // recorded crop right now, never silently assumed.
      const written = writeHeroCrop(content, NEUTRAL_HERO_CROP);
      if (!written.ok) {
        setSubmitError(true);
        return;
      }
      toCommit = written.content;
    }

    // Disabled FIRST — before flush() ever awaits anything — so nothing
    // else can arm a NEW debounce in the window below (same reasoning as
    // handleChangePhoto above).
    setIsSubmitting(true);

    // ## Durability invariant (Mission 034 QG micro-audit)
    //
    // T07's `StepRecord` must never become durable before the crop it
    // corresponds to is itself durably persisted — a whole-content,
    // last-write-wins draft save has no version guard of its own, so a
    // STALE autosave (still pending, or already mid-flight, from a drag
    // or zoom that just happened) landing AFTER this commit would
    // silently revert it. `flush()` drains the autosave controller to
    // durable quiescence FIRST — cancelling any pending debounce timer
    // and awaiting whatever save is already in flight — so by the time
    // `commitPageD`'s own write goes out below, the controller is idle
    // and nothing stale is left that could ever land after it. If that
    // drain itself fails, T07 must never be considered completed either:
    // fail the same way persist's own failure already does (an error
    // notice, isSubmitting cleared, the family stays on this exact
    // screen — never advanced toward T08 on unconfirmed data).
    try {
      await flush();
    } catch {
      setSubmitError(true);
      setIsSubmitting(false);
      return;
    }

    const committed = commitPageD(toCommit, photo.media);
    if (!committed.ok) {
      setSubmitError(true);
      setIsSubmitting(false);
      return;
    }

    try {
      await persist(committed.content);
    } catch {
      setSubmitError(true);
      setIsSubmitting(false);
      return;
    }

    router.refresh();
  }

  if (read.status !== "ready" || read.hero.photo === null) {
    return (
      <BuilderScreen progress={0}>
        <p role="alert" className={styles.error}>
          {translate(language, "hero.dataUnavailable")}
        </p>
      </BuilderScreen>
    );
  }

  const crop = read.hero.photo.crop ?? NEUTRAL_HERO_CROP;
  const geometry = resolveHeroCropGeometry(imageSize, crop);
  const progress = heroStepProgress(editorialContext, content, read.hero);

  return (
    <BuilderScreen progress={progress}>
      <div className={styles.copy}>
        <h1 className={styles.title}>{translate(language, "hero.cropTitle")}</h1>
        <p className={styles.subtitle}>{translate(language, "hero.cropSubtitle")}</p>
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        <div
          ref={windowRef}
          className={styles.cropWindow}
          onPointerDown={handlePointerDown}
          onPointerMove={(event) => handlePointerMove(event, crop)}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {/* A signed/blob URL, never a static asset next/image can optimize, and never persisted. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.readUrl}
            alt={translate(language, "hero.photoAlt")}
            className={styles.image}
            draggable={false}
            onLoad={handleImageLoad}
            style={{
              left: `${geometry.leftPercent}%`,
              top: `${geometry.topPercent}%`,
              width: `${geometry.widthPercent}%`,
              height: `${geometry.heightPercent}%`,
            }}
          />
        </div>

        <div className={styles.moveControls} role="group" aria-label={translate(language, "hero.cropTitle")}>
          <button
            type="button"
            className={`${styles.moveButton} ${styles.moveUp}`}
            disabled={controlsDisabled}
            aria-label={translate(language, "hero.cropMoveUp")}
            onClick={() => pan(0, -PAN_STEP_PERCENT, crop)}
          >
            <span aria-hidden="true">↑</span>
          </button>
          <button
            type="button"
            className={`${styles.moveButton} ${styles.moveLeft}`}
            disabled={controlsDisabled}
            aria-label={translate(language, "hero.cropMoveLeft")}
            onClick={() => pan(-PAN_STEP_PERCENT, 0, crop)}
          >
            <span aria-hidden="true">←</span>
          </button>
          <button
            type="button"
            className={`${styles.moveButton} ${styles.moveRight}`}
            disabled={controlsDisabled}
            aria-label={translate(language, "hero.cropMoveRight")}
            onClick={() => pan(PAN_STEP_PERCENT, 0, crop)}
          >
            <span aria-hidden="true">→</span>
          </button>
          <button
            type="button"
            className={`${styles.moveButton} ${styles.moveDown}`}
            disabled={controlsDisabled}
            aria-label={translate(language, "hero.cropMoveDown")}
            onClick={() => pan(0, PAN_STEP_PERCENT, crop)}
          >
            <span aria-hidden="true">↓</span>
          </button>
        </div>

        <label className={styles.zoomControl}>
          <span className={styles.zoomLabel}>{translate(language, "hero.cropZoomLabel")}</span>
          <input
            type="range"
            className={styles.zoomInput}
            min={HERO_CROP_MIN_ZOOM}
            max={HERO_CROP_MAX_ZOOM}
            step={0.01}
            value={clampHeroCropZoom(crop.zoom)}
            disabled={controlsDisabled}
            aria-label={translate(language, "hero.cropZoomLabel")}
            onChange={(event) => handleZoomChange(event, crop)}
          />
        </label>

        <div className={styles.secondaryActions}>
          <button type="button" className={styles.secondaryLink} disabled={controlsDisabled} onClick={handleReset}>
            {translate(language, "hero.cropReset")}
          </button>
          <button
            type="button"
            className={styles.secondaryLink}
            disabled={controlsDisabled}
            onClick={() => void handleChangePhoto()}
          >
            {translate(language, "hero.cropChangePhoto")}
          </button>
        </div>

        <div className={screenStyles.ctaWrap}>
          <PrimaryButton type="submit" disabled={controlsDisabled}>
            {translate(language, "common.continue")}
          </PrimaryButton>
        </div>

        {submitError && (
          <p role="alert" className={styles.error}>
            {translate(language, "errors.generic")}
          </p>
        )}
      </form>
    </BuilderScreen>
  );
}
