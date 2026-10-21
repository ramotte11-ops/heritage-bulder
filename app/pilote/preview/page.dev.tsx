import { notFound } from "next/navigation";
import type { Language } from "@/config/languages";
import type { SkinVariant } from "@/config/skins";
import { BuilderPreviewHost } from "@/components/builder/preview/BuilderPreviewHost";
import { PreviewEntry } from "@/components/builder/preview/PreviewEntry";
import { loadPreviewPilotAction } from "./preview-pilot-action";

/**
 * Offrandes symboliques V1 — M3 : la VRAIE Preview du Builder
 * (`BuilderPreviewHost` + `assembleMemorial` + `MemorialAssembly`), sur le
 * jeu de données de l'Atelier fondateur, sans session ni Supabase.
 *
 * Page de DÉVELOPPEMENT : fichier `page.dev.tsx`, routé par `next dev`
 * seulement (`next.config.ts`, `pageExtensionsFor`) ; absent de tout build
 * de production. `notFound()` reste une seconde barrière.
 *
 *   /pilote/preview?variant=light|dark&lang=fr|en|es&hidden=symbolicOfferings,story
 *
 * `hidden` : rubriques masquées appliquées au jeu de données (contrôle de la
 * Preview ; ce n'est pas une sauvegarde).
 */
export default async function PreviewPilotPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const variant: SkinVariant = params.variant === "dark" ? "dark" : "light";
  const language: Language = params.lang === "en" || params.lang === "es" ? params.lang : "fr";
  const hidden = typeof params.hidden === "string" ? params.hidden.split(",").filter(Boolean) : [];

  return (
    <BuilderPreviewHost available language={language} loadPreview={loadPreviewPilotAction.bind(null, variant, language, hidden)}>
      <main style={{ padding: "48px 16px", fontFamily: "system-ui, sans-serif", textAlign: "center" }}>
        <p data-pilot-banner style={{ margin: "0 0 16px", fontWeight: 600 }}>
          Pilote de la Preview du Builder — jeu de données de l’Atelier fondateur, aucune session, aucune écriture.
        </p>
        <PreviewEntry />
      </main>
    </BuilderPreviewHost>
  );
}
