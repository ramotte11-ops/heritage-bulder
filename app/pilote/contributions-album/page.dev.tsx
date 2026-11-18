import { notFound } from "next/navigation";
import type { ContributionsTheme } from "@/config/contributions-master-measurements";
import { ebGaramond, ebGaramondItalic, laBelleAurore, offeringsMediumSerif } from "@/components/builder/fonts";
import { MemorialCards } from "@/components/memorial/assembly/MemorialCards";
import { contributionsSignatureScript } from "@/components/memorial/contributions/contribution-fonts";
import { ContributionsSection } from "@/components/memorial/contributions/ContributionsSection";
import type { ContributionContent } from "@/components/memorial/contributions/ContributionsSceneDesktop";
import { DEMO_CLOSING, DEMO_SUBTITLE, DEMO_TITLE, demoContributions } from "@/lib/memorial/contributions/demo-contributions";

/**
 * M6 — Album complet des Contributions des proches : banc d'essai PO.
 * Contributions FICTIVES ; aucun formulaire, aucune donnée réelle, aucune
 * écriture. Page de DÉVELOPPEMENT (`page.dev.tsx`, routée par `next dev`
 * seulement) ; `notFound()` en production reste une seconde barrière.
 *
 *   /pilote/contributions-album?theme=light&combo=RCRPCC          (C condoléance, R récit, P photo)
 *   /pilote/contributions-album?theme=dark&combo=C&n=10           (motif répété jusqu'à n contributions)
 *   /pilote/contributions-album?combo=RCRP&n=24&stack=1           (dans la pile des cartes mémorielles)
 *
 * La largeur de la fenêtre choisit la scène et l'Album (Desktop dès 1024 px).
 */
export default async function ContributionsAlbumPilotPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : undefined);
  const theme: ContributionsTheme = one("theme") === "dark" ? "dark" : "light";
  const pattern = (one("combo") ?? "RCRPCCRP").replace(/[^CRPcrp]/g, "").slice(0, 60) || "RCRP";
  const n = Math.min(500, Math.max(1, Number(one("n")) || pattern.length));
  const combo = Array.from({ length: n }, (_, i) => pattern[i % pattern.length]).join("");
  const stack = one("stack") === "1";
  const all = demoContributions(combo);
  const items = all.map((it) => ({ id: it.id, kind: it.kind, ...(it.photo ? { photo: it.photo } : {}) }));
  // Banc d'essai : une adresse distincte par photographie (comme des photos réelles), pour mesurer le chargement différé.
  const contents: Record<string, ContributionContent> = Object.fromEntries(
    all.map((it, i) => [it.id, it.content.photo ? { ...it.content, photo: { ...it.content.photo, src: `${it.content.photo.src}?p=${i}` } } : it.content]),
  );
  const fonts = [ebGaramond, ebGaramondItalic, offeringsMediumSerif, laBelleAurore, contributionsSignatureScript].map((f) => f.variable).join(" ");
  const ink = theme === "dark" ? "#eee" : "#222";
  const section = <ContributionsSection theme={theme} items={items} contents={contents} title={DEMO_TITLE} subtitle={DEMO_SUBTITLE} closing={DEMO_CLOSING} />;

  return (
    <main className={fonts} style={{ margin: 0, padding: 0, background: theme === "dark" ? "#14110e" : "#efe6d6", minHeight: "100vh" }} data-pilot-combo={combo}>
      {stack ? (
        <MemorialCards>
          <section data-memorial-section="precedente" style={{ minHeight: "110vh", background: theme === "dark" ? "#2a231c" : "#f4ebdc", padding: "48px 24px", fontFamily: "Georgia, serif", color: ink }}>
            <h2 style={{ margin: 0, fontWeight: 400 }}>Rubrique précédente</h2>
            <p>Section de remplissage pour le test de stacking.</p>
          </section>
          <section data-memorial-section="contributions" style={{ background: theme === "dark" ? "#14110e" : "#efe6d6" }}>
            {section}
          </section>
          <section data-memorial-section="suivante" data-pilot-next="" style={{ minHeight: "130vh", background: theme === "dark" ? "#3a2f25" : "#e8dcc7", padding: "48px 24px", fontFamily: "Georgia, serif", color: ink }}>
            <h2 style={{ margin: 0, fontWeight: 400 }}>Rubrique suivante</h2>
            <p>Elle monte et recouvre la rubrique des contributions par le bas.</p>
          </section>
        </MemorialCards>
      ) : (
        section
      )}
    </main>
  );
}
