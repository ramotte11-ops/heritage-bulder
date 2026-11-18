import { notFound } from "next/navigation";
import type { ContributionsTheme } from "@/config/contributions-master-measurements";
import { CONTRIBUTIONS_MOBILE_LAYOUTS, type ContributionsMobileLayoutId } from "@/config/contributions-mobile-v1";
import { ebGaramond, ebGaramondItalic, laBelleAurore, offeringsMediumSerif } from "@/components/builder/fonts";
import { MemorialCards } from "@/components/memorial/assembly/MemorialCards";
import { contributionsSignatureScript } from "@/components/memorial/contributions/contribution-fonts";
import { ContributionsSceneMobile } from "@/components/memorial/contributions/ContributionsSceneMobile";
import type { ContributionContent } from "@/components/memorial/contributions/ContributionsSceneDesktop";
import { solveContributionsScene } from "@/lib/memorial/contributions/contributions-scene";
import { DEMO_CLOSING, DEMO_SUBTITLE, DEMO_TITLE, demoContributions } from "@/lib/memorial/contributions/demo-contributions";

/**
 * M5-B — Contributions des proches, PROTOTYPE Mobile : banc d'essai des
 * captures de comparaison PO. Contributions FICTIVES ; aucun formulaire,
 * aucune donnée réelle, aucune écriture. Géométries EXPLORATOIRES, aucune
 * validée.
 *
 * Page de DÉVELOPPEMENT (`page.dev.tsx`, routée par `next dev` seulement) ;
 * `notFound()` en production reste une seconde barrière.
 *
 *   /pilote/contributions-mobile?layout=colonne&theme=light&combo=RCRP
 *   /pilote/contributions-mobile?layout=grille-2x2&theme=dark&combo=CCCC
 *   /pilote/contributions-mobile?layout=colonne&combo=RCRP&stack=1
 *
 * `stack=1` place la scène entre une rubrique précédente et une rubrique
 * suivante, dans le vrai moteur des cartes mémorielles (`MemorialCards`) :
 * la vérification du recouvrement se fait pendant un défilement réel.
 * La largeur est celle de la fenêtre (320 à 430 px).
 */
export default async function ContributionsMobilePilotPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : undefined);
  const theme: ContributionsTheme = one("theme") === "dark" ? "dark" : "light";
  const layoutId = (one("layout") ?? "colonne") as ContributionsMobileLayoutId;
  const layout = CONTRIBUTIONS_MOBILE_LAYOUTS[layoutId] ?? CONTRIBUTIONS_MOBILE_LAYOUTS.colonne;
  const combo = (one("combo") ?? "RCRP").replace(/[^CRPcrp]/g, "").slice(0, 12) || "RCRP";
  const stack = one("stack") === "1";

  const all = demoContributions(combo);
  // P4 (« colonne-2 ») : proposition qui CHANGE la règle d'affichage — deux dans la scène.
  const items = all.slice(0, layout.sceneCapacity);
  const scene = solveContributionsScene(items, { frame: "mobile", theme, geometry: layout.geometry[theme] });
  const viewAll = layout.sceneCapacity < 4 ? all.length > layout.sceneCapacity : scene.viewAll;
  const contents: Record<string, ContributionContent> = Object.fromEntries(all.map((it) => [it.id, it.content]));
  const fonts = [ebGaramond, ebGaramondItalic, offeringsMediumSerif, laBelleAurore, contributionsSignatureScript].map((f) => f.variable).join(" ");
  const ink = theme === "dark" ? "#eee" : "#222";

  const sceneNode =
    scene.status === "PASS" ? (
      <ContributionsSceneMobile theme={theme} layout={layout} placements={scene.placements} contents={contents} viewAll={viewAll} title={DEMO_TITLE} subtitle={DEMO_SUBTITLE} closing={DEMO_CLOSING} />
    ) : (
      <p style={{ padding: 24, fontFamily: "system-ui", color: ink }}>
        {layout.label} — {combo} : {scene.status} — {scene.detail}
      </p>
    );

  return (
    <main className={fonts} style={{ margin: 0, padding: 0, background: theme === "dark" ? "#14110e" : "#efe6d6", minHeight: "100vh" }} data-pilot-combo={combo} data-pilot-layout={layout.id} data-pilot-status={scene.status}>
      {stack ? (
        <MemorialCards>
          <section data-memorial-section="precedente" style={{ minHeight: "110vh", background: theme === "dark" ? "#2a231c" : "#f4ebdc", padding: "48px 24px", fontFamily: "Georgia, serif", color: ink }}>
            <h2 style={{ margin: 0, fontWeight: 400 }}>Rubrique précédente</h2>
            <p>Section de remplissage pour le test de stacking.</p>
          </section>
          <section data-memorial-section="contributions" style={{ background: theme === "dark" ? "#14110e" : "#efe6d6" }}>
            {sceneNode}
          </section>
          <section data-memorial-section="suivante" data-pilot-next="" style={{ minHeight: "130vh", background: theme === "dark" ? "#3a2f25" : "#e8dcc7", padding: "48px 24px", fontFamily: "Georgia, serif", color: ink }}>
            <h2 style={{ margin: 0, fontWeight: 400 }}>Rubrique suivante</h2>
            <p>Elle monte et recouvre la scène des contributions par le bas.</p>
          </section>
        </MemorialCards>
      ) : (
        sceneNode
      )}
    </main>
  );
}
