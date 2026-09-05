"use client";

import { useState } from "react";
import type { Memorial, MemorialContent } from "@/types/memorial";
import {
  createInitialBuilderState,
  getManagedSections,
  getPreviewSections,
  selectSection,
  setMode,
  toggleSection,
  updateSectionContent,
  type BuilderState,
} from "@/lib/builder/builder-state";
import type { DemoSectionContent } from "@/lib/builder/demo-content";
import { useAutosave } from "@/lib/builder/use-autosave";
import { SectionList } from "./SectionList";
import { SectionEditor } from "./SectionEditor";
import { MemorialPreview } from "./MemorialPreview";
import styles from "./BuilderShell.module.css";

const EDITORIAL_CONTEXT_LABELS: Record<Memorial["editorialContext"], string> = {
  announcement: "Annonce & Hommage",
  remembrance: "Mémoire & Hommage",
};

/**
 * The Builder shell — a single engine that reads a memorial's editorial
 * context and configuration (config/sections.ts, lib/sections.ts) to
 * decide what to show, rather than a screen coded per context. This
 * same component renders both currently-configured editorial contexts
 * unchanged (see app/builder/[demoId]/page.tsx).
 *
 * All editing state is local to this component (React state) and lives
 * only for the current page session — nothing here reads from or writes
 * to Supabase by default. See lib/builder/builder-state.ts for the
 * architectural boundary a future mission uses to connect this to
 * DataRepository<Memorial> / memorial_drafts.
 *
 * `persist` (Mission 009B) is the one optional seam this component
 * exposes for real autosave: Mission 021's real entry point
 * (`app/builder/[memorialId]/page.tsx`) passes
 * `(content) => draftRepository.saveDraftContent(memorialId, content)`
 * here, using a real, authorized memorialId, and every subsequent edit
 * is autosaved for real, via lib/builder/use-autosave.ts. The Mission
 * 003 demo screens (`app/builder/demo/[demoId]`) never pass one — no
 * fixture is ever written to Supabase — and `useAutosave` is entirely
 * inert without a `persist`.
 *
 * The "démonstration locale" labelling below is shown ONLY in that
 * persist-less case — Mission 021's real callers must never see UI
 * copy that falsely claims their edits are fictional and never sent
 * anywhere.
 */
export function BuilderShell({
  memorial,
  persist,
}: {
  memorial: Memorial;
  persist?: (content: MemorialContent) => Promise<{ updatedAt: string }>;
}) {
  const [state, setState] = useState<BuilderState>(() => createInitialBuilderState(memorial));
  const { selectedSectionId } = state;

  // Observes state.content — the Builder's one existing source of
  // truth — rather than tracking a second, parallel copy of it. See
  // use-autosave.ts for why the mount value is never itself "saved".
  useAutosave({ content: state.content, persist });

  const managedSections = getManagedSections(state);
  const previewSections = getPreviewSections(state);
  const selectedContent: DemoSectionContent =
    selectedSectionId != null
      ? ((state.content[selectedSectionId] as DemoSectionContent | undefined) ?? {})
      : {};

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.identity}>
          <p className={styles.eyebrow}>
            {persist ? "Builder HERITAGE" : "Builder HERITAGE — démonstration locale"}
          </p>
          <h1 className={styles.title}>{memorial.slug}</h1>
          <p className={styles.context}>{EDITORIAL_CONTEXT_LABELS[state.editorialContext]}</p>
        </div>

        <div className={styles.modeSwitch} role="tablist" aria-label="Mode d'affichage">
          <button
            type="button"
            role="tab"
            aria-selected={state.mode === "edit"}
            className={state.mode === "edit" ? styles.modeActive : styles.modeButton}
            onClick={() => setState((s) => setMode(s, "edit"))}
          >
            Édition
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={state.mode === "preview"}
            className={state.mode === "preview" ? styles.modeActive : styles.modeButton}
            onClick={() => setState((s) => setMode(s, "preview"))}
          >
            Prévisualisation
          </button>
        </div>
      </header>

      {!persist && (
        <p className={styles.demoNotice}>
          Mode démonstration locale : ce mémorial et ce contenu sont des données fictives. Les
          modifications ne sont conservées que dans cette page — elles ne sont jamais envoyées à
          un serveur ni enregistrées.
        </p>
      )}

      {state.mode === "edit" ? (
        <div className={styles.editLayout}>
          <SectionList
            sections={managedSections}
            enabledSections={state.enabledSections}
            selectedSectionId={selectedSectionId}
            onSelect={(id) => setState((s) => selectSection(s, id))}
            onToggle={(id) => setState((s) => toggleSection(s, id))}
          />
          <SectionEditor
            sectionId={selectedSectionId}
            content={selectedContent}
            onChange={(patch) => {
              if (selectedSectionId == null) return;
              setState((s) => updateSectionContent(s, selectedSectionId, patch));
            }}
          />
        </div>
      ) : (
        <MemorialPreview sections={previewSections} content={state.content} />
      )}
    </div>
  );
}
