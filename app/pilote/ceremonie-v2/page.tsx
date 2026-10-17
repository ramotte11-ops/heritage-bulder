import { notFound } from "next/navigation";
import type { Language } from "@/config/languages";
import type { SkinVariant } from "@/config/skins";
import { CeremonyV2, type CeremonyV2TopLayout } from "@/components/memorial/ceremony/v2/CeremonyV2";
import { CEREMONY_V2_PILOT_CASES } from "@/components/memorial/ceremony/v2/pilot-fixtures";

/**
 * Cérémonie Intemporel V2 : banc d'essai LOCAL des pilotes C1 Mobile Light
 * et C2 Mobile Dark (`variant=dark`), pour les captures de validation
 * PO/QG. Inaccessible en production
 * (`notFound`) ; n'appartient à aucun parcours, n'est branché ni au
 * Builder ni à la Preview. `w` fixe la largeur du CONTENEUR ; `top`
 * force la composition des deux cartouches du haut (`pair` / `stack`),
 * sinon `auto`.
 *
 *   /pilote/ceremonie-v2?case=reference&lang=fr&w=941
 *   /pilote/ceremonie-v2?case=long&w=390&top=pair
 *   /pilote/ceremonie-v2?case=reference&w=941&variant=dark
 */

const LANGUAGES: readonly Language[] = ["fr", "en", "es"];
const TOP_LAYOUTS: readonly CeremonyV2TopLayout[] = ["auto", "pair", "stack"];

export default async function CeremonyV2PilotPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : undefined);

  const pilotCase = CEREMONY_V2_PILOT_CASES.find((c) => c.id === one("case")) ?? CEREMONY_V2_PILOT_CASES[0];
  const requested = one("lang") as Language | undefined;
  const language: Language = requested !== undefined && LANGUAGES.includes(requested) ? requested : "fr";
  const width = Number(one("w")) || null;
  const requestedTop = one("top") as CeremonyV2TopLayout | undefined;
  const topLayout: CeremonyV2TopLayout =
    requestedTop !== undefined && TOP_LAYOUTS.includes(requestedTop) ? requestedTop : "auto";
  const variant: SkinVariant = one("variant") === "dark" ? "dark" : "light";

  return (
    <main style={{ background: variant === "dark" ? "#2a2119" : "#d9d2c7", minHeight: "100dvh" }}>
      <div style={{ width: width !== null ? `${width}px` : "100%", marginInline: "auto" }} data-pilot-case={pilotCase.id}>
        <CeremonyV2 ceremony={pilotCase.ceremony} language={language} skinVariant={variant} headingLevel="section" topLayout={topLayout} />
      </div>
    </main>
  );
}
