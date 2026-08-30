"use client";

import { useState } from "react";
import type { Memorial } from "@/types/memorial";
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
 * to Supabase. See lib/builder/builder-state.ts for the architectural
 * boundary a future mission uses to connect this to
 * DataRepository<Memorial> / memorial_drafts.
 */
export function BuilderShell({ memorial }: { memorial: Memorial }) {
  const [state, setState] = useState<BuilderState>(() => createInitialBuilderState(memorial));
  const { selectedSectionId } = state;

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
          <p className={styles.eyebrow}>Builder HERITAGE — démonstration locale</p>
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

      <p className={styles.demoNotice}>
        Mode démonstration locale : ce mémorial et ce contenu sont des données fictives. Les
        modifications ne sont conservées que dans cette page — elles ne sont jamais envoyées à un
        serveur ni enregistrées.
      </p>

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
