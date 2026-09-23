"use client";

import { useSyncExternalStore } from "react";
import type { Language } from "@/config/languages";
import type { AutosaveState } from "@/lib/builder/autosave-state";
import { translate } from "@/lib/i18n/translate";
import styles from "./AutosaveIndicator.module.css";

interface AutosaveIndicatorProps {
  language: Language;
  /** Exactly `useAutosave(...).state` — never a second, parallel status. */
  state: AutosaveState;
  /** Exactly `useAutosave(...).retry` — a no-op outside `error`. */
  onRetry: () => void;
}

function subscribeOnline(callback: () => void): () => void {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getOnline(): boolean {
  return navigator.onLine;
}

// Server + hydration snapshot: assume online, so the first client render
// matches the server one (the indicator is empty at that point anyway —
// `useAutosave` always starts `idle`).
function getServerOnline(): boolean {
  return true;
}

/**
 * Builder continuity mission — the discreet save-status line a family
 * sees on every Guided Flow screen that autosaves.
 *
 * It renders `useAutosave`'s own state machine (lib/builder/autosave-state.ts)
 * and nothing else: `pending`/`saving` → "saving…", `saved` → "saved",
 * `error` → an explicit failure message with a "try again" action wired
 * to the hook's existing `retry()`. `idle` renders nothing — the value on
 * screen is the one just loaded, there is nothing to report yet.
 *
 * The one thing it adds is the browser's own offline signal, only to
 * word an `error` honestly: when the save failed while offline, the
 * family is told their changes will be saved once the connection is
 * back — which is exactly what `useAutosave`'s existing `online` listener
 * already does (it calls `retry()`), not a new promise.
 *
 * The point is the error case: a family must never keep going believing
 * their words are stored when the last save was refused.
 */
export function AutosaveIndicator({ language, state, onRetry }: AutosaveIndicatorProps) {
  const online = useSyncExternalStore(subscribeOnline, getOnline, getServerOnline);

  if (state.status === "error") {
    return (
      <div role="alert" className={styles.error}>
        <span>{translate(language, online ? "autosave.error" : "autosave.offline")}</span>
        {online && (
          <button type="button" className={styles.retry} onClick={onRetry}>
            {translate(language, "autosave.retry")}
          </button>
        )}
      </div>
    );
  }

  let text: string | null = null;
  if (state.status === "pending" || state.status === "saving") {
    text = translate(language, "autosave.saving");
  } else if (state.status === "saved") {
    text = translate(language, "autosave.saved");
  }

  return (
    <p role="status" aria-live="polite" className={styles.status}>
      {text}
    </p>
  );
}
