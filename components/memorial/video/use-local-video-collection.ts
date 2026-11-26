"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  admitVideo,
  limitVideoTitleInput,
  moveVideo,
  removeVideo,
  replaceVideo,
  type VideoAdmission,
  type VideoHommageItem,
} from "@/lib/memorial/video/video-hommage";
import { isVideoFile, openLocalVideo, type LocalVideoHandle } from "@/lib/memorial/video/local-video";

/**
 * VID-05A — les vidéos de DÉMONSTRATION d'une famille, gérées dans l'onglet.
 *
 * Réutilisable par l'étape Vidéo du futur Builder : choisir, titrer,
 * réordonner, remplacer, retirer — sans aucun transfert. Chaque fichier est
 * lu par une adresse `blob:` ; elle est libérée dès que la vidéo est retirée
 * ou remplacée, et toutes le sont quand le composant disparaît.
 *
 * Les règles (3 vidéos, 600 s strictes) viennent de
 * `lib/memorial/video/video-hommage.ts` : le contrôle fait ici prévient la
 * famille avant tout envoi ; le serveur refera le contrôle lors de l'ajout
 * définitif (offre complète).
 */
export type LocalVideoAddResult =
  | VideoAdmission
  | { ok: false; reason: "not-a-video" }
  | { ok: false; reason: "unreadable" };

let sequence = 0;
function nextId(): string {
  sequence += 1;
  return `local-${Date.now().toString(36)}-${sequence}`;
}

export function useLocalVideoCollection(initial: readonly VideoHommageItem[] = []) {
  const [items, setItems] = useState<VideoHommageItem[]>(() => initial.slice());
  const handles = useRef(new Map<string, LocalVideoHandle>());
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    const owned = handles.current;
    return () => {
      for (const handle of owned.values()) handle.release();
      owned.clear();
    };
  }, []);

  const releaseOf = (id: string) => {
    handles.current.get(id)?.release();
    handles.current.delete(id);
  };

  const open = useCallback(async (file: File, replacingId?: string): Promise<LocalVideoAddResult> => {
    if (!isVideoFile(file)) return { ok: false, reason: "not-a-video" };
    const handle = await openLocalVideo(file);
    const admission = admitVideo(itemsRef.current, handle.metadata.durationSeconds, replacingId);
    if (!admission.ok) {
      handle.release();
      if (admission.reason === "duration-unknown" && !handle.metadata.playable) return { ok: false, reason: "unreadable" };
      return admission;
    }
    const id = nextId();
    handles.current.set(id, handle);
    const item: VideoHommageItem = {
      id,
      title: null,
      durationSeconds: handle.metadata.durationSeconds,
      status: "ready",
      source: { kind: "local", url: handle.url },
    };
    setItems((current) => {
      if (replacingId === undefined) return [...current, item];
      const previous = current.find((entry) => entry.id === replacingId);
      return replaceVideo(current, replacingId, { ...item, title: previous?.title ?? null });
    });
    if (replacingId !== undefined) releaseOf(replacingId);
    return { ok: true };
  }, []);

  const add = useCallback((file: File) => open(file), [open]);
  const replace = useCallback((id: string, file: File) => open(file, id), [open]);

  const remove = useCallback((id: string) => {
    releaseOf(id);
    setItems((current) => removeVideo(current, id));
  }, []);

  const setTitle = useCallback((id: string, title: string) => {
    // Saisie conservée telle quelle (limitée à 30 caractères) ; la rubrique
    // affiche la version normalisée, et un champ vide redonne « Souvenir n ».
    setItems((current) => current.map((item) => (item.id === id ? { ...item, title: limitVideoTitleInput(title) } : item)));
  }, []);

  const move = useCallback((from: number, to: number) => {
    setItems((current) => moveVideo(current, from, to));
  }, []);

  return { items, add, replace, remove, setTitle, move };
}
