import { notFound } from "next/navigation";
import type { Language } from "@/config/languages";
import type { SkinVariant } from "@/config/skins";
import { ContributionsBuilderPilot } from "./pilot-client";

/**
 * M7 — banc d'essai de la PRÉPARATION des Contributions des proches, tel que
 * l'écran A15 du Builder la présente (même cadre `BuilderScreen`, mêmes
 * interrupteurs, même aperçu). Exemples FICTIFS ; aucune donnée réelle,
 * aucun réseau : « Continuer » montre ici le brouillon qui serait enregistré.
 * Page de DÉVELOPPEMENT (`page.dev.tsx`) ; `notFound()` en production.
 *
 *   /pilote/contributions-builder?theme=light&lang=fr&on=crp
 *   (on : c condoléances, r récits et anecdotes, p photographies)
 */
export default async function ContributionsBuilderPilotPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : undefined);
  const theme: SkinVariant = one("theme") === "dark" ? "dark" : "light";
  const language: Language = one("lang") === "en" ? "en" : one("lang") === "es" ? "es" : "fr";
  const on = (one("on") ?? "").toLowerCase();
  return <ContributionsBuilderPilot language={language} skinVariant={theme} initial={{ condolences: on.includes("c"), stories: on.includes("r"), photos: on.includes("p") }} />;
}
