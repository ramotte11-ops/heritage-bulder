import { notFound } from "next/navigation";
import { DepositPilot } from "./DepositPilot";

/**
 * M8-E4 — banc d'essai de la PROPOSITION de fenêtre de dépôt (à présenter à
 * la PO). Transport SIMULÉ : rien n'est envoyé, rien n'est écrit. Page de
 * DÉVELOPPEMENT (`page.dev.tsx`, routée par `next dev` seulement).
 *
 *   /pilote/contributions-depot?theme=dark&lang=fr&outcome=pending&off=photos
 *   outcome = published | pending | busy (résultat simulé du serveur)
 */
export default async function DepositPilotPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : undefined);
  const off = one("off") ?? "";
  return (
    <DepositPilot
      theme={one("theme") === "dark" ? "dark" : "light"}
      language={one("lang") === "en" ? "en" : one("lang") === "es" ? "es" : "fr"}
      outcome={one("outcome") === "busy" ? "busy" : one("outcome") === "pending" ? "pending" : "auto"}
      categories={{ condolences: !off.includes("condolences"), stories: !off.includes("stories"), photos: !off.includes("photos") }}
    />
  );
}
