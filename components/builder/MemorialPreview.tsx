import type { SectionDefinition } from "@/config/sections";
import type { MemorialContent } from "@/types/memorial";
import type { DemoSectionContent } from "@/lib/builder/demo-content";
import { FOOTER_LABEL } from "@/lib/builder/builder-state";
import { SECTION_LABELS } from "@/lib/builder/section-labels";
import styles from "./MemorialPreview.module.css";

interface MemorialPreviewProps {
  sections: SectionDefinition[];
  content: MemorialContent;
}

/**
 * Read-only preview of the currently-enabled sections, in canonical
 * order, with a fixed Footer at the end — never one of `sections` (see
 * FOOTER_LABEL). This is a local preview of demonstration content only,
 * not a real public memorial page: no publication, no real layout/skin,
 * no data leaves this session.
 */
export function MemorialPreview({ sections, content }: MemorialPreviewProps) {
  return (
    <div className={styles.preview}>
      <p className={styles.notice}>Aperçu de démonstration locale — mise en page provisoire.</p>

      {sections.map((section) => {
        const sectionContent = (content[section.id] as DemoSectionContent | undefined) ?? {};

        return (
          <section key={section.id} className={styles.section}>
            <h3 className={styles.sectionTitle}>{SECTION_LABELS[section.id]}</h3>
            {sectionContent.title ? (
              <p className={styles.contentTitle}>{sectionContent.title}</p>
            ) : null}
            {sectionContent.body ? (
              <p className={styles.contentBody}>{sectionContent.body}</p>
            ) : (
              <p className={styles.placeholder}>Aucun contenu de démonstration pour l&rsquo;instant.</p>
            )}
          </section>
        );
      })}

      <footer className={styles.footer}>
        {FOOTER_LABEL} — contenu défini dans une mission ultérieure.
      </footer>
    </div>
  );
}
