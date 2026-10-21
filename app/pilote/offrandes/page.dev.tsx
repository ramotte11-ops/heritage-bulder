import { notFound } from "next/navigation";
import type { SkinVariant } from "@/config/skins";
import { OFFERING_KINDS, type OfferingKind } from "@/config/symbolic-offerings-v1-tokens";
import { SymbolicOfferingsSceneV1 } from "@/components/memorial/symbolic-offerings/v1/SymbolicOfferingsSceneV1";

/**
 * Offrandes symboliques V1 — pilote statique M1 : la scène de recueillement
 * (état final) de chaque geste, Mobile/Desktop × Light/Dark, à taille
 * réelle. N'appartient à aucun parcours ni registre.
 *
 * Page de DÉVELOPPEMENT : fichier `page.dev.tsx`, routé par `next dev`
 * seulement (`next.config.ts`, `pageExtensionsFor`) ; absent de tout build
 * de production. `notFound()` reste une seconde barrière.
 *
 *   /pilote/offrandes?g=bougie&variant=light&w=390
 *   /pilote/offrandes?g=coeur&variant=dark&w=1440   (Desktop dès w ≥ 1024)
 *
 * `w` fixe la largeur du CONTENEUR, en px CSS (défaut : pleine largeur).
 */
export default async function OfferingsV1PilotPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : undefined);

  const requested = one("g") as OfferingKind | undefined;
  const offering: OfferingKind = requested !== undefined && OFFERING_KINDS.includes(requested) ? requested : "bougie";
  const variant: SkinVariant = one("variant") === "dark" ? "dark" : "light";
  const width = Number(one("w")) || null;

  return (
    <main style={{ background: variant === "dark" ? "#2a2119" : "#d9d2c7", minHeight: "100dvh" }}>
      <div style={{ width: width !== null ? `${width}px` : "100%", marginInline: "auto" }} data-pilot-offering={offering}>
        <SymbolicOfferingsSceneV1 offering={offering} skinVariant={variant} headingLevel="page" />
      </div>
    </main>
  );
}
