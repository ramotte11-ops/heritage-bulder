import { notFound } from "next/navigation";
import type { SkinVariant } from "@/config/skins";
import { OFFERING_KINDS, type OfferingKind } from "@/config/symbolic-offerings-v1-tokens";
import { SymbolicOfferingsSceneV1 } from "@/components/memorial/symbolic-offerings/v1/SymbolicOfferingsSceneV1";
import { OfferingsPilot } from "./OfferingsPilot";

/**
 * Offrandes symboliques V1 — pilote. N'appartient à aucun parcours ni
 * registre ; le serveur y est SIMULÉ (aucune écriture).
 *
 * Page de DÉVELOPPEMENT : fichier `page.dev.tsx`, routé par `next dev`
 * seulement (`next.config.ts`, `pageExtensionsFor`) ; absent de tout build
 * de production. `notFound()` reste une seconde barrière.
 *
 *   /pilote/offrandes?variant=dark&w=390&srv=fail&delay=1500&rm=on&slow=1
 *       banc d'essai M2 : cartes, trois gestes animés, retour aux cartes
 *   /pilote/offrandes?g=bougie&variant=light&w=390
 *       M1 : scène finale immobile d'un geste (contrôle des maquettes)
 *
 * `w` fixe la largeur du CONTENEUR, en px CSS (Desktop dès `w ≥ 1024`).
 */
export default async function OfferingsV1PilotPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : undefined);

  const variant: SkinVariant = one("variant") === "dark" ? "dark" : "light";
  const width = Number(one("w")) || null;
  const requested = one("g") as OfferingKind | undefined;

  if (requested !== undefined && OFFERING_KINDS.includes(requested)) {
    return (
      <main style={{ background: variant === "dark" ? "#2a2119" : "#d9d2c7", minHeight: "100dvh" }}>
        <div style={{ width: width !== null ? `${width}px` : "100%", marginInline: "auto" }} data-pilot-offering={requested}>
          <SymbolicOfferingsSceneV1 offering={requested} skinVariant={variant} headingLevel="page" />
        </div>
      </main>
    );
  }

  const rm = one("rm");
  return (
    <OfferingsPilot
      initial={{
        variant,
        width,
        outcome: one("srv") === "fail" ? "fail" : "ok",
        delay: Number(one("delay")) || 600,
        reduced: rm === "on" || rm === "off" ? rm : "system",
        slow: one("slow") === "1",
        captureScale: Number(one("ts")) || undefined,
      }}
    />
  );
}
