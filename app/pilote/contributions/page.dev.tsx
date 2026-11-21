import { notFound } from "next/navigation";
import type { ContributionsTheme } from "@/config/contributions-master-measurements";
import { ebGaramond, ebGaramondItalic, laBelleAurore, offeringsMediumSerif } from "@/components/builder/fonts";
import { contributionsSignatureScript } from "@/components/memorial/contributions/contribution-fonts";
import { ContributionsSceneDesktop, type ContributionContent } from "@/components/memorial/contributions/ContributionsSceneDesktop";
import { solveContributionsScene } from "@/lib/memorial/contributions/contributions-scene";
import { DEMO_CLOSING, DEMO_SUBTITLE, DEMO_TITLE, demoContributions } from "@/lib/memorial/contributions/demo-contributions";

/**
 * M5-A — Contributions des proches, PREMIER RENDU Desktop : banc d'essai des
 * captures de contrôle PO. Contributions FICTIVES ; aucun formulaire, aucune
 * donnée réelle, aucune écriture.
 *
 * Page de DÉVELOPPEMENT (`page.dev.tsx`, routée par `next dev` seulement) ;
 * `notFound()` en production reste une seconde barrière.
 *
 *   /pilote/contributions?theme=light&combo=RCRP&w=1440
 *   /pilote/contributions?theme=dark&combo=CCCC
 *   /pilote/contributions?theme=light&combo=PRPP
 *
 * `combo` : C condoléance, R récit, P photographie (1 à 4 ; davantage pour
 * « Voir tous les messages ») ; `w` : largeur du conteneur en px CSS.
 */
export default async function ContributionsPilotPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : undefined);
  const theme: ContributionsTheme = one("theme") === "dark" ? "dark" : "light";
  const combo = (one("combo") ?? "RCRP").replace(/[^CRPcrp]/g, "").slice(0, 12) || "RCRP";
  const width = Math.min(2400, Math.max(1024, Number(one("w")) || 1440));

  const items = demoContributions(combo);
  const scene = solveContributionsScene(items, { frame: "desktop", theme });
  const contents: Record<string, ContributionContent> = Object.fromEntries(items.map((it) => [it.id, it.content]));
  const fonts = [ebGaramond, ebGaramondItalic, offeringsMediumSerif, laBelleAurore, contributionsSignatureScript].map((f) => f.variable).join(" ");

  return (
    <main className={fonts} style={{ margin: 0, padding: 0, background: theme === "dark" ? "#14110e" : "#efe6d6", minHeight: "100vh" }}>
      <div style={{ width, maxWidth: "100%", margin: "0 auto" }} data-pilot-combo={combo} data-pilot-status={scene.status}>
        {scene.status === "PASS" ? (
          <ContributionsSceneDesktop
            theme={theme}
            placements={scene.placements}
            contents={contents}
            viewAll={scene.viewAll}
            title={DEMO_TITLE}
            subtitle={DEMO_SUBTITLE}
            closing={DEMO_CLOSING}
          />
        ) : (
          <p style={{ padding: 24, fontFamily: "system-ui", color: theme === "dark" ? "#eee" : "#222" }}>
            {combo} : {scene.status} — {scene.detail}
          </p>
        )}
      </div>
    </main>
  );
}
