"use client";

import type { SectionDefinition, SectionId } from "@/config/sections";
import { FOOTER_LABEL } from "@/lib/builder/builder-state";
import { SECTION_LABELS } from "@/lib/builder/section-labels";
import styles from "./SectionList.module.css";

interface SectionListProps {
  sections: SectionDefinition[];
  enabledSections: SectionId[];
  selectedSectionId: SectionId | null;
  onSelect: (id: SectionId) => void;
  onToggle: (id: SectionId) => void;
}

/**
 * Lists every section configured for the memorial's editorial context,
 * in canonical order (see config/sections.ts) — socle sections marked
 * as such, optional ones with a real on/off control. The Footer is
 * appended as a fixed, non-selectable, non-toggleable row: it is not
 * part of `sections` at all (see FOOTER_LABEL in lib/builder/builder-state.ts)
 * and must never appear as something the client could disable.
 */
export function SectionList({
  sections,
  enabledSections,
  selectedSectionId,
  onSelect,
  onToggle,
}: SectionListProps) {
  return (
    <nav className={styles.list} aria-label="Sections du mémorial">
      <ul className={styles.items}>
        {sections.map((section) => {
          const isEnabled = section.core || enabledSections.includes(section.id);
          const isSelected = section.id === selectedSectionId;

          return (
            <li key={section.id} className={styles.item}>
              <button
                type="button"
                className={isSelected ? styles.rowButtonSelected : styles.rowButton}
                onClick={() => onSelect(section.id)}
                aria-current={isSelected ? "true" : undefined}
              >
                {SECTION_LABELS[section.id]}
              </button>

              {section.core ? (
                <span className={styles.badgeCore}>Socle</span>
              ) : (
                <button
                  type="button"
                  role="switch"
                  aria-checked={isEnabled}
                  aria-label={`${isEnabled ? "Désactiver" : "Activer"} la section ${SECTION_LABELS[section.id]}`}
                  className={isEnabled ? styles.toggleOn : styles.toggleOff}
                  onClick={() => onToggle(section.id)}
                >
                  {isEnabled ? "Activée" : "Désactivée"}
                </button>
              )}
            </li>
          );
        })}

        <li className={styles.item}>
          <span className={styles.rowButton} aria-disabled="true">
            {FOOTER_LABEL}
          </span>
          <span className={styles.badgeCore}>Toujours présent</span>
        </li>
      </ul>
    </nav>
  );
}
