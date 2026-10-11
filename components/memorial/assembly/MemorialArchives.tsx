import type { ComponentType } from "react";
import type { Language } from "@/config/languages";
import type { RendererKey } from "@/config/memorial-section-renderers";
import type { AssembledSection, RendererPropsMap } from "@/lib/memorial/assembly/renderer-adapters";
import { translate } from "@/lib/i18n/translate";
import type { TranslationKey } from "@/lib/i18n/keys";
import { RENDERER_COMPONENTS } from "./renderer-registry";
import styles from "./MemorialArchives.module.css";

/**
 * « Gérer les rubriques visibles » — the secondary presentation of the
 * sections the family hid from the main flow but whose former
 * information stays consultable (death notice, ceremony:
 * `composition.archived`).
 *
 * After the flow, one discreet native disclosure per section: closed, a
 * single underlined line; open, the section's OWN validated renderer,
 * unchanged. No state, no hook, no `"use client"` — it works the same in
 * the Builder's Preview and on a server-rendered page (the future
 * published memorial mounts `MemorialAssembly`, hence this, as is).
 *
 * Renders nothing when nothing is archived — so never for a section that
 * was never filled in or does not apply (the composition only archives a
 * section that would otherwise be shown).
 */
function renderSection<K extends RendererKey>(section: AssembledSection & { rendererKey: K }) {
  const Renderer = RENDERER_COMPONENTS[section.rendererKey] as ComponentType<RendererPropsMap[K]>;
  return <Renderer {...(section.props as RendererPropsMap[K] & object)} />;
}

export function MemorialArchives({ sections, language }: { sections: AssembledSection[]; language: Language }) {
  if (sections.length === 0) return null;
  return (
    <div className={styles.archives} data-memorial-archives="">
      {sections.map((section) => (
        <details key={section.sectionId} className={styles.entry} data-memorial-archive={section.sectionId}>
          <summary className={styles.summary}>
            {translate(language, `memorial.archive.${section.sectionId}` as TranslationKey)}
          </summary>
          <div className={styles.content}>{renderSection(section)}</div>
        </details>
      ))}
    </div>
  );
}
