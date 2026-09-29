"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { Language } from "@/config/languages";
import { ALLOWED_IMAGE_MIME_TYPES, MEDIA_BUCKET } from "@/config/media";
import { selectGalleryState } from "@/config/gallery-a13-multi-state-manifests";
import type { MemorialContent } from "@/types/memorial";
import type { Media } from "@/types/media";
import type { GalleryContent } from "@/types/gallery";
import type { MediaResult } from "@/lib/media/media-errors";
import type { ReservedUpload } from "@/lib/media/upload-lifecycle";
import type { GalleryRetirement } from "@/lib/memorial/gallery-media";
import type { GalleryStepThumbnails } from "@/lib/builder/guided-flow/resolve-gallery-step";
import { translate, translateWith } from "@/lib/i18n/translate";
import { precheckPhotoFile } from "@/lib/media/precheck-upload";
import { MediaActionError, mediaErrorTranslationKey } from "@/lib/media/media-error-copy";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser-client";
import {
  GALLERY_CAPTION_MAX_CHARACTERS,
  addGalleryMedia,
  clampGalleryCaptionInput,
  galleryCaptionLength,
  inspectGallery,
  moveGalleryMedia,
  removeGalleryMedia,
  replaceGalleryMedia,
  setGalleryCaption,
  updateGallery,
  type GalleryEditResult,
} from "@/lib/memorial/gallery-content";
import styles from "./GalleryWorkshop.module.css";

/**
 * A13 — the family's photographic register ("registre photographique
 * familial continu"): add, see, order, caption, replace, remove. The
 * Builder is the workshop, never the work — no composition, crop, zoom,
 * rotation, size, position or "main photo" exists here; HERITAGE lays the
 * photographs out in the Memorial (Gallery / Album / Viewer).
 *
 * ## Why this is its own component
 *
 * It edits `content.gallery` — section-based content — and nothing else:
 * it never reads or writes A13's `StepRecord`, never knows about the
 * Guided Flow, Continue or Skip. Its host owns the draft (`content` +
 * `setContent`, the one `useAutosave`) and the step's own actions:
 * today `GalleryStep` (the A13 Guided Flow screen); tomorrow, a revision
 * surface can host the very same workshop with a different footer.
 *
 * ## Two write paths, one autosave
 *
 *  - Captions and order go through `setContent` — the existing debounced
 *    autosave, exactly like every other Guided Flow field.
 *  - Structural writes that a physical media operation depends on (add
 *    after finalize, replace, remove) are EXPLICIT: drain the autosave
 *    (`flush`), compute the next content from the latest one, `persist`
 *    it and wait — only a successful save lets the draft adopt the change
 *    and, for replace/remove, only then is the previous media retired
 *    (best effort, never surfaced; `retireGalleryMedia` itself refuses a
 *    media the saved draft still references). A failed save changes
 *    nothing: the photograph the draft references stays.
 *    While such a write is in flight, captions are read-only and the
 *    other structural controls disabled, so no stale autosave can race
 *    it.
 *
 * ## Uploads
 *
 * Several files at once, processed one after another in the order chosen
 * (a plain promise chain — deterministic, no new infrastructure). Each
 * file has its own state; a refused or failed file never undoes the
 * photographs already added. The purpose is never the browser's to
 * choose: the bound Gallery actions fix it server-side.
 */

export interface GalleryWorkshopProps {
  language: Language;
  /** The host's draft (owner of the one `useAutosave`). */
  content: MemorialContent;
  setContent: Dispatch<SetStateAction<MemorialContent>>;
  /** `useAutosave(...).flush` — drains the debounced path before an explicit write. */
  flush: () => Promise<void>;
  /** The bound `saveDraftAction` — the explicit, awaited write. */
  persist: (content: MemorialContent) => Promise<{ updatedAt: string }>;
  /** Short-lived read URLs resolved server-side for the photographs already in the draft. */
  initialThumbnails: GalleryStepThumbnails;
  reserveUpload: (declaredMimeType: string) => Promise<MediaResult<ReservedUpload>>;
  finalizeUpload: (mediaId: string) => Promise<MediaResult<Media>>;
  retirePhoto: (mediaId: string) => Promise<MediaResult<GalleryRetirement>>;
  /** The host is submitting (Continue/Skip): every control is frozen. */
  frozen: boolean;
  /** Reports whether an upload, a replacement or an explicit write is in progress. */
  onBusyChange: (busy: boolean) => void;
}

const ACCEPT = ALLOWED_IMAGE_MIME_TYPES.join(",");
/** The counter appears only when it becomes useful — the last 8 characters before the limit. */
const COUNTER_THRESHOLD = GALLERY_CAPTION_MAX_CHARACTERS - 8;

type PendingUpload = { localId: string; fileName: string; previewUrl: string | null; status: "queued" | "uploading" | "error"; error: string | null };

type Focus = { mediaId: string; control: "up" | "down" | "replace" } | { mediaId: null; control: "add" };

function applyToContent(content: MemorialContent, edit: (gallery: GalleryContent) => GalleryEditResult): MemorialContent | null {
  const read = inspectGallery(content);
  if (read.status === "corrupted") return null;
  const edited = edit(read.gallery);
  if (!edited.ok) return null;
  const written = updateGallery(content, edited.gallery);
  return written.ok ? written.content : null;
}

async function uploadPhoto(file: File, reserveUpload: GalleryWorkshopProps["reserveUpload"], finalizeUpload: GalleryWorkshopProps["finalizeUpload"]): Promise<Media> {
  const reserved = await reserveUpload(file.type);
  if (!reserved.ok) throw new MediaActionError(reserved.code);
  const { error } = await getBrowserSupabaseClient()
    .storage.from(MEDIA_BUCKET)
    .uploadToSignedUrl(reserved.value.storagePath, reserved.value.uploadToken, file, { contentType: file.type });
  if (error) throw new MediaActionError("storage_unavailable");
  const finalized = await finalizeUpload(reserved.value.mediaId);
  if (!finalized.ok) throw new MediaActionError(finalized.code);
  return finalized.value;
}

function omit(record: Record<string, string>, key: string): Record<string, string> {
  const rest = { ...record };
  delete rest[key];
  return rest;
}

function errorText(language: Language, error: unknown): string {
  return translate(language, mediaErrorTranslationKey(error instanceof MediaActionError ? error.code : "storage_unavailable"));
}

export function GalleryWorkshop({
  language,
  content,
  setContent,
  flush,
  persist,
  initialThumbnails,
  reserveUpload,
  finalizeUpload,
  retirePhoto,
  frozen,
  onBusyChange,
}: GalleryWorkshopProps) {
  const [thumbnails, setThumbnails] = useState<Record<string, string | null>>(() => ({ ...initialThumbnails }));
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [replacing, setReplacing] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [announcement, setAnnouncement] = useState("");
  // A replaced photograph keeps its row (and the focus inside it): the React key follows the memory, not the file.
  const [rowKeys, setRowKeys] = useState<Record<string, string>>({});

  const contentRef = useRef(content);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const blobUrls = useRef(new Set<string>());
  const focusTarget = useRef<Focus | null>(null);
  const controls = useRef(new Map<string, HTMLElement>());
  const localIds = useRef(0);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    const urls = blobUrls.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const uploading = pending.some((upload) => upload.status !== "error");
  const busy = uploading || replacing !== null || committing;
  useEffect(() => onBusyChange(busy), [busy, onBusyChange]);

  const read = inspectGallery(content);
  const items = read.status === "corrupted" ? [] : read.gallery.items;
  const count = items.length;
  const galleryState = selectGalleryState(count);

  // Focus follows the memory the family just acted on (after a move, a removal, a replacement).
  useEffect(() => {
    const target = focusTarget.current;
    if (!target) return;
    focusTarget.current = null;
    const key = target.mediaId === null ? "add" : `${target.mediaId}:${target.control}`;
    let element = controls.current.get(key);
    if (element instanceof HTMLButtonElement && element.disabled && target.mediaId !== null) {
      element = controls.current.get(`${target.mediaId}:${target.control === "up" ? "down" : "up"}`);
    }
    element?.focus();
  });

  const register = useCallback(
    (key: string) => (element: HTMLElement | null) => {
      if (element) controls.current.set(key, element);
      else controls.current.delete(key);
    },
    [],
  );

  function track(url: string): string {
    blobUrls.current.add(url);
    return url;
  }

  function forget(mediaId: string) {
    const url = thumbnails[mediaId];
    if (url && blobUrls.current.has(url)) {
      URL.revokeObjectURL(url);
      blobUrls.current.delete(url);
    }
  }

  /** The explicit write: flush, persist the next content, and only then adopt it. */
  async function commitStructural(edit: (gallery: GalleryContent) => GalleryEditResult): Promise<boolean> {
    setCommitting(true);
    try {
      await flush();
      const next = applyToContent(contentRef.current, edit);
      if (next === null) return false;
      await persist(next);
      // Adopted: the next explicit write starts from here even before React re-renders.
      contentRef.current = next;
      setContent((previous) => applyToContent(previous, edit) ?? previous);
      return true;
    } catch {
      return false;
    } finally {
      setCommitting(false);
    }
  }

  function updatePending(localId: string, patch: Partial<PendingUpload>) {
    setPending((list) => list.map((upload) => (upload.localId === localId ? { ...upload, ...patch } : upload)));
  }

  async function processUpload(localId: string, file: File, previewUrl: string) {
    updatePending(localId, { status: "uploading" });
    try {
      const media = await uploadPhoto(file, reserveUpload, finalizeUpload);
      const added = await commitStructural((gallery) => addGalleryMedia(gallery, media.id));
      if (!added) throw new MediaActionError("storage_unavailable");
      setThumbnails((current) => ({ ...current, [media.id]: previewUrl }));
      setPending((list) => list.filter((upload) => upload.localId !== localId));
      setAnnouncement(translate(language, "galleryStep.added"));
    } catch (error) {
      updatePending(localId, { status: "error", error: errorText(language, error) });
    }
  }

  function handleAdd(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = ""; // choosing the same files again still fires a change
    const entries: PendingUpload[] = [];
    for (const file of files) {
      const localId = `upload-${(localIds.current += 1)}`;
      const refused = precheckPhotoFile(file);
      if (refused) {
        entries.push({ localId, fileName: file.name, previewUrl: null, status: "error", error: translate(language, mediaErrorTranslationKey(refused)) });
        continue;
      }
      const previewUrl = track(URL.createObjectURL(file));
      entries.push({ localId, fileName: file.name, previewUrl, status: "queued", error: null });
      queue.current = queue.current.then(() => processUpload(localId, file, previewUrl));
    }
    setPending((list) => [...list, ...entries]);
  }

  function dismissPending(localId: string) {
    setPending((list) => list.filter((upload) => upload.localId !== localId));
    focusTarget.current = { mediaId: null, control: "add" };
  }

  async function handleReplace(mediaId: string, file: File) {
    setRowErrors((errors) => omit(errors, mediaId));
    const refused = precheckPhotoFile(file);
    if (refused) {
      setRowErrors((errors) => ({ ...errors, [mediaId]: translate(language, mediaErrorTranslationKey(refused)) }));
      return;
    }
    setReplacing(mediaId);
    try {
      const media = await uploadPhoto(file, reserveUpload, finalizeUpload);
      const replaced = await commitStructural((gallery) => replaceGalleryMedia(gallery, mediaId, media.id));
      if (!replaced) throw new MediaActionError("storage_unavailable");
      // Adopted by the saved draft: only now may the previous photograph be retired.
      forget(mediaId);
      setThumbnails((current) => ({ ...current, [media.id]: track(URL.createObjectURL(file)) }));
      setRowKeys((keys) => ({ ...keys, [media.id]: keys[mediaId] ?? mediaId }));
      focusTarget.current = { mediaId: media.id, control: "replace" };
      setAnnouncement(translate(language, "galleryStep.replaced"));
      retirePhoto(mediaId).catch(() => {});
    } catch (error) {
      setRowErrors((errors) => ({ ...errors, [mediaId]: errorText(language, error) }));
    } finally {
      setReplacing(null);
    }
  }

  async function handleConfirmRemove(mediaId: string, index: number) {
    const removed = await commitStructural((gallery) => ({ ok: true, gallery: removeGalleryMedia(gallery, mediaId) }));
    if (!removed) {
      setRowErrors((errors) => ({ ...errors, [mediaId]: translate(language, "galleryStep.removeFailed") }));
      return;
    }
    setConfirming(null);
    forget(mediaId);
    const remaining = items.filter((item) => item.mediaId !== mediaId);
    const neighbour = remaining[Math.min(index, remaining.length - 1)];
    focusTarget.current = neighbour ? { mediaId: neighbour.mediaId, control: "replace" } : { mediaId: null, control: "add" };
    setAnnouncement(translate(language, "galleryStep.removed"));
    // Removed from the saved draft: only now may the photograph itself be retired.
    retirePhoto(mediaId).catch(() => {});
  }

  function handleMove(mediaId: string, offset: -1 | 1) {
    const index = items.findIndex((item) => item.mediaId === mediaId);
    setContent((previous) => applyToContent(previous, (gallery) => moveGalleryMedia(gallery, mediaId, offset)) ?? previous);
    focusTarget.current = { mediaId, control: offset === -1 ? "up" : "down" };
    setAnnouncement(translateWith(language, "galleryStep.moved", { position: index + 1 + offset, total: count }));
  }

  function handleCaption(mediaId: string, value: string) {
    setContent((previous) => applyToContent(previous, (gallery) => setGalleryCaption(gallery, mediaId, value)) ?? previous);
  }

  const structuralLocked = frozen || committing || replacing !== null;

  return (
    <div className={styles.workshop}>
      {count > 0 && (
        <ol className={styles.register} aria-label={translate(language, "galleryStep.listLabel")}>
          {items.map((item, index) => (
            <GalleryRegisterRow
              key={rowKeys[item.mediaId] ?? item.mediaId}
              language={language}
              mediaId={item.mediaId}
              caption={item.caption}
              index={index}
              total={count}
              thumbnail={thumbnails[item.mediaId] ?? null}
              replacing={replacing === item.mediaId}
              confirming={confirming === item.mediaId}
              error={rowErrors[item.mediaId] ?? null}
              captionReadOnly={frozen || committing}
              structuralLocked={structuralLocked}
              register={register}
              onCaption={handleCaption}
              onMove={handleMove}
              onReplace={handleReplace}
              onAskRemove={(mediaId) => {
                setRowErrors((errors) => omit(errors, mediaId));
                setConfirming(mediaId);
              }}
              onCancelRemove={() => setConfirming(null)}
              onConfirmRemove={handleConfirmRemove}
            />
          ))}
        </ol>
      )}

      {pending.length > 0 && (
        <ul className={styles.pending}>
          {pending.map((upload) => (
            <li key={upload.localId} className={styles.pendingItem}>
              <span className={styles.thumbnail}>
                {upload.previewUrl && (
                  // A local blob: preview, never persisted.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={upload.previewUrl} alt="" className={styles.thumbnailImage} />
                )}
              </span>
              <div className={styles.pendingBody}>
                <p className={styles.fileName}>{upload.fileName}</p>
                {upload.status === "error" ? (
                  <>
                    <p role="alert" className={styles.error}>
                      {upload.error}
                    </p>
                    <button type="button" className={styles.textAction} onClick={() => dismissPending(upload.localId)}>
                      {translate(language, "galleryStep.dismiss")}
                    </button>
                  </>
                ) : (
                  <p className={styles.statusText}>{translate(language, "galleryStep.uploading")}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {galleryState === null && count === 1 && <p className={styles.hint}>{translate(language, "galleryStep.singleHint")}</p>}
      {galleryState === "G6_SIGNATURE_7PLUS" && <p className={styles.hint}>{translate(language, "galleryStep.signatureHint")}</p>}

      <label className={count === 0 && pending.length === 0 ? styles.dropzone : styles.addRow} aria-disabled={frozen}>
        <input ref={register("add")} type="file" accept={ACCEPT} multiple className={styles.hiddenInput} disabled={frozen} onChange={handleAdd} />
        <span className={styles.addLabel}>{translate(language, "galleryStep.addPhotos")}</span>
      </label>

      <p role="status" aria-live="polite" className={styles.srOnly}>
        {announcement}
      </p>
    </div>
  );
}

interface GalleryRegisterRowProps {
  language: Language;
  mediaId: string;
  caption: string | null;
  index: number;
  total: number;
  thumbnail: string | null;
  replacing: boolean;
  confirming: boolean;
  error: string | null;
  captionReadOnly: boolean;
  structuralLocked: boolean;
  register: (key: string) => (element: HTMLElement | null) => void;
  onCaption: (mediaId: string, value: string) => void;
  onMove: (mediaId: string, offset: -1 | 1) => void;
  onReplace: (mediaId: string, file: File) => void;
  onAskRemove: (mediaId: string) => void;
  onCancelRemove: () => void;
  onConfirmRemove: (mediaId: string, index: number) => void;
}

function GalleryRegisterRow({
  language,
  mediaId,
  caption,
  index,
  total,
  thumbnail,
  replacing,
  confirming,
  error,
  captionReadOnly,
  structuralLocked,
  register,
  onCaption,
  onMove,
  onReplace,
  onAskRemove,
  onCancelRemove,
  onConfirmRemove,
}: GalleryRegisterRowProps) {
  // The field shows exactly what the family typed; the draft stores its normalized form. No jump after autosave.
  const [draft, setDraft] = useState(caption ?? "");
  const cancelRef = useRef<HTMLButtonElement>(null);
  const removeRef = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(confirming);

  useEffect(() => {
    if (confirming && !wasConfirming.current) cancelRef.current?.focus();
    if (!confirming && wasConfirming.current && removeRef.current?.isConnected) removeRef.current.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  const itemId = `gallery-item-${mediaId}`;
  const captionId = `gallery-caption-${mediaId}`;
  const counterId = `gallery-caption-counter-${mediaId}`;
  const length = galleryCaptionLength(draft);
  const showCounter = length >= COUNTER_THRESHOLD;
  const itemLabel = translateWith(language, "galleryStep.itemLabel", { index: index + 1 });

  return (
    <li className={styles.item} aria-labelledby={itemId}>
      <span className={styles.number} aria-hidden="true">
        {String(index + 1).padStart(2, "0")}
      </span>
      <span id={itemId} className={styles.srOnly}>
        {itemLabel}
      </span>

      <span className={styles.thumbnail}>
        {thumbnail && (
          // A short-lived signed or local blob: URL, never persisted; shown whole (contain), never cropped.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnail} alt={itemLabel} className={styles.thumbnailImage} />
        )}
      </span>

      <div className={styles.body}>
        {!thumbnail && <p className={styles.statusText}>{translate(language, "galleryStep.photoUnavailable")}</p>}

        <label htmlFor={captionId} className={styles.fieldLabel}>
          {translate(language, "galleryStep.captionLabel")}
        </label>
        <input
          id={captionId}
          type="text"
          className={styles.textInput}
          value={draft}
          readOnly={captionReadOnly}
          aria-describedby={showCounter ? counterId : undefined}
          onChange={(event) => {
            const next = clampGalleryCaptionInput(event.target.value);
            setDraft(next);
            onCaption(mediaId, next);
          }}
        />
        {showCounter && (
          <p id={counterId} className={styles.counter}>
            {translateWith(language, "galleryStep.captionCounter", { count: length, max: GALLERY_CAPTION_MAX_CHARACTERS })}
          </p>
        )}

        {replacing && (
          <p role="status" className={styles.statusText}>
            {translate(language, "galleryStep.replacing")}
          </p>
        )}

        {confirming ? (
          <div className={styles.confirm} role="group" aria-labelledby={`${itemId}-confirm`}>
            <p id={`${itemId}-confirm`} className={styles.confirmQuestion}>
              {translate(language, "galleryStep.removeQuestion")}
            </p>
            <div className={styles.actions}>
              <button type="button" className={styles.confirmAction} disabled={structuralLocked} aria-describedby={itemId} onClick={() => onConfirmRemove(mediaId, index)}>
                {translate(language, "galleryStep.removeConfirm")}
              </button>
              <button ref={cancelRef} type="button" className={styles.textAction} disabled={structuralLocked} onClick={onCancelRemove}>
                {translate(language, "common.cancel")}
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.actions}>
            <label className={styles.textAction} aria-disabled={structuralLocked}>
              <input
                ref={register(`${mediaId}:replace`)}
                type="file"
                accept={ACCEPT}
                className={styles.hiddenInput}
                disabled={structuralLocked}
                aria-describedby={itemId}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) onReplace(mediaId, file);
                }}
              />
              {translate(language, "galleryStep.replace")}
            </label>
            <button ref={removeRef} type="button" className={styles.textActionQuiet} disabled={structuralLocked} aria-describedby={itemId} onClick={() => onAskRemove(mediaId)}>
              {translate(language, "galleryStep.remove")}
            </button>
          </div>
        )}

        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
      </div>

      <div className={styles.moves}>
        <button
          ref={register(`${mediaId}:up`)}
          type="button"
          className={styles.moveButton}
          disabled={structuralLocked || index === 0}
          aria-label={translate(language, "galleryStep.moveUp")}
          aria-describedby={itemId}
          onClick={() => onMove(mediaId, -1)}
        >
          <span aria-hidden="true">↑</span>
        </button>
        <button
          ref={register(`${mediaId}:down`)}
          type="button"
          className={styles.moveButton}
          disabled={structuralLocked || index === total - 1}
          aria-label={translate(language, "galleryStep.moveDown")}
          aria-describedby={itemId}
          onClick={() => onMove(mediaId, 1)}
        >
          <span aria-hidden="true">↓</span>
        </button>
      </div>
    </li>
  );
}
