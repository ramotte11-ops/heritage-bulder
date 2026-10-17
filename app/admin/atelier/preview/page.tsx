import { notFound } from "next/navigation";
import { requireAdminForRequest } from "@/lib/admin/admin-session";
import { parseFounderAtelierSection, parseFounderAtelierVariant } from "@/lib/admin/founder-atelier";
import { buildFounderAtelierContent, resolveFounderAtelierMedia } from "@/lib/admin/founder-atelier-fixture";
import { assembleMemorial } from "@/lib/memorial/assembly/assemble-memorial";
import { MemorialAssembly } from "@/components/memorial/assembly/MemorialAssembly";
import styles from "./page.module.css";

export default async function FounderAtelierPreviewPage({ searchParams }: PageProps<"/admin/atelier/preview">) {
  const gate = await requireAdminForRequest();
  if (gate.status !== "granted") notFound();

  const query = await searchParams;
  const sectionId = parseFounderAtelierSection(query.section);
  const variant = parseFounderAtelierVariant(query.theme);
  if (sectionId === null || variant === null) notFound();

  const assembled = await assembleMemorial(
    { skin: "intemporel", skinVariant: variant, language: "fr", content: buildFounderAtelierContent() },
    { resolveMedia: resolveFounderAtelierMedia },
  );
  const section = assembled.sections.find((candidate) => candidate.sectionId === sectionId);

  if (assembled.status !== "assembled" || section === undefined) {
    return (
      <main className={styles.unavailable}>
        <p>Prévisualisation fiable non disponible pour cette rubrique.</p>
      </main>
    );
  }

  return (
    <main className={styles.preview} data-atelier-preview={sectionId} data-renderer={section.rendererKey}>
      <MemorialAssembly assembled={{ ...assembled, sections: [section], archivedSections: [] }} />
    </main>
  );
}
