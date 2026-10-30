import { notFound } from "next/navigation";
import { GuestBuilderRuntime } from "@/components/builder/guest/GuestBuilderRuntime";

/**
 * QG 003 — le Builder invité réel, sans inscription : le seul
 * `GuestBuilderRuntime` (brouillon IndexedDB V3 local, de T01 à A13), puis
 * l'aperçu réel de l'hommage par `BuilderPreviewHost`. Aucune session,
 * aucune requête Supabase, aucune écriture réseau.
 *
 * Page de DÉVELOPPEMENT : fichier `page.dev.tsx`, routé par `next dev`
 * seulement (`next.config.ts`, `pageExtensionsFor`) ; absent de tout build
 * de production. `notFound()` reste une seconde barrière. Hors de
 * `/builder/*` à dessein : le proxy de session Supabase n'y passe pas.
 *
 *   /pilote/builder-invite
 */
export default function GuestBuilderPilotPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <GuestBuilderRuntime />;
}
