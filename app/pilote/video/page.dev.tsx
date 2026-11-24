import { notFound } from "next/navigation";
import { isLanguage, type Language } from "@/config/languages";
import type { SkinVariant } from "@/config/skins";
import { VideoPilot } from "./VideoPilot";

/**
 * VID-05A — banc d'essai de la rubrique « Des instants pour se souvenir ».
 *
 * Page de DÉVELOPPEMENT : fichier `page.dev.tsx`, routé par `next dev`
 * seulement (`next.config.ts`, `pageExtensionsFor`) ; absent de tout build
 * de production. `notFound()` reste une seconde barrière.
 *
 * La rubrique ne dépend pas de cette page : elle est montée ici exactement
 * comme le Builder la montera (`VideoHommageV1`), avec la démonstration
 * locale (`useLocalVideoCollection`). Aucun transfert, aucun service.
 *
 *   /pilote/video?variant=dark&w=390&n=3&state=ready
 *
 *   variant  light | dark
 *   w        largeur du conteneur en px CSS (Desktop dès w ≥ 1024)
 *   n        0 à 3 vidéos d'exemple sans fichier (mise en page)
 *   state    état des vidéos d'exemple : preparing | error | local-unavailable
 *   lang     fr (défaut) | en | es
 */
export default async function VideoHommagePilotPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : undefined);

  const variant: SkinVariant = one("variant") === "dark" ? "dark" : "light";
  const lang = one("lang");
  const language: Language = lang !== undefined && isLanguage(lang) ? lang : "fr";
  const width = Number(one("w")) || null;
  const count = Math.max(0, Math.min(3, Number(one("n") ?? "0") || 0));
  const requestedState = one("state");
  const state = requestedState === "error" || requestedState === "local-unavailable" ? requestedState : "preparing";

  return <VideoPilot initial={{ variant, language, width, count, state }} />;
}
