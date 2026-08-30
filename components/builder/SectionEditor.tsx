"use client";

import type { SectionId } from "@/config/sections";
import type { DemoSectionContent } from "@/lib/builder/demo-content";
import { SECTION_LABELS } from "@/lib/builder/section-labels";
import styles from "./SectionEditor.module.css";

interface SectionEditorProps {
  sectionId: SectionId | null;
  content: DemoSectionContent;
  onChange: (patch: DemoSectionContent) => void;
}

/**
 * Minimal, generic editing surface for the selected section.
 *
 * Deliberately just two generic fields (title/body), identical for
 * every section id — the real per-section content model (Hero copy,
 * gallery items, ...) doesn't exist yet (see lib/builder/demo-content.ts).
 * This is enough to demonstrate the edit -> preview flow without
 * inventing that model prematurely.
 */
export function SectionEditor({ sectionId, content, onChange }: SectionEditorProps) {
  if (sectionId == null) {
    return <p className={styles.empty}>Sélectionnez une section à éditer.</p>;
  }

  return (
    <div className={styles.editor}>
      <h2 className={styles.heading}>{SECTION_LABELS[sectionId]}</h2>
      <p className={styles.hint}>
        Édition de démonstration — le modèle de contenu détaillé de chaque section sera défini
        dans une mission ultérieure. Ces deux champs génériques suffisent à faire fonctionner le
        parcours du Builder et sa prévisualisation.
      </p>

      <label className={styles.field}>
        <span>Titre</span>
        <input
          type="text"
          value={content.title ?? ""}
          onChange={(event) => onChange({ title: event.target.value })}
        />
      </label>

      <label className={styles.field}>
        <span>Texte</span>
        <textarea
          rows={6}
          value={content.body ?? ""}
          onChange={(event) => onChange({ body: event.target.value })}
        />
      </label>
    </div>
  );
}
