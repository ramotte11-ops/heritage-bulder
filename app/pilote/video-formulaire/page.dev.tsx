import { notFound } from "next/navigation";
import { isLanguage, type Language } from "@/config/languages";
import { VideoFormPilot } from "./VideoFormPilot";

/**
 * VID-09 — banc d'essai du formulaire A16 « Vos souvenirs en vidéo » dans
 * les trois langues, sans session, sans Supabase, sans Mux.
 *
 * Page de DÉVELOPPEMENT : fichier `page.dev.tsx`, routé par `next dev`
 * seulement ; absent de tout build de production. `notFound()` reste une
 * seconde barrière.
 *
 *   /pilote/video-formulaire?lang=fr|en|es&etat=vide|local|premium&media=http://localhost:4400/
 *
 *   vide     aucune vidéo (invitation à ajouter)
 *   local    trois vidéos décrites dont les fichiers ne sont plus sur l'appareil
 *   premium  hébergement SIMULÉ : une vidéo conservée, une en cours d'envoi
 *            (42 %), une refusée après mesure (dépassement des 10 minutes)
 *   media    base d'un serveur LOCAL de fichiers de test (localhost seulement)
 */
export default async function VideoFormPilotPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : undefined);
  const lang = one("lang");
  const language: Language = lang !== undefined && isLanguage(lang) ? lang : "fr";
  const state = one("etat") === "local" || one("etat") === "premium" ? (one("etat") as "local" | "premium") : "vide";
  const media = one("media");
  const mediaBase = media !== undefined && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(media) ? media : null;
  return <VideoFormPilot language={language} state={state} mediaBase={mediaBase} />;
}
