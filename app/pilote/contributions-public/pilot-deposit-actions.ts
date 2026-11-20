"use server";

import type { PublicContribution, PublicContributionsPage } from "@/lib/memorial/contributions/public-contribution-types";
import { checkContributionText } from "@/lib/memorial/contributions/contribution-text";

/**
 * M8-E6-F — SIMULATION du dépôt pour le banc d'essai de la rubrique publique
 * (`/pilote/contributions-public?depot=1`). Aucune base, aucun stockage,
 * aucun secret : une mémoire du processus de développement, pour essayer au
 * navigateur le parcours « Laisser un message » → lettre → dépôt → rubrique
 * rafraîchie. Mêmes validations de texte que le serveur (module partagé),
 * même règle D2 (condoléance publiée, récit et photo en attente).
 * Hors développement : `unavailable`, toujours.
 */

const published: PublicContribution[] = [];
const dev = () => process.env.NODE_ENV !== "production";

export async function pilotOpenContributionWindow(slug: string): Promise<{ status: string; formToken?: string }> {
  void slug;
  return dev() ? { status: "ready", formToken: `pilote-${Date.now()}` } : { status: "unavailable" };
}

export async function pilotDepositContributionText(input: { slug: string; type: string; authorName: string; text: string; formToken: string; website: string }): Promise<{ status: string; field?: string }> {
  if (!dev()) return { status: "unavailable" };
  if (input.website) return { status: "refused" };
  if (!checkContributionText("authorName", input.authorName).ok) return { status: "invalid", field: "authorName" };
  const condolence = input.type === "condolence";
  if (!checkContributionText(condolence ? "condolence" : "story", input.text).ok) return { status: "invalid", field: "text" };
  if (!condolence) return { status: "pending" };
  published.unshift({
    id: crypto.randomUUID(),
    type: "condolence",
    authorName: input.authorName.trim(),
    text: input.text.trim(),
    caption: null,
    publishedAt: new Date().toISOString(),
    photo: null,
  });
  return { status: "published" };
}

export async function pilotBeginContributionPhoto(): Promise<{ status: string }> {
  // La photographie réelle exige le stockage Supabase : hors du banc d'essai.
  return { status: "unavailable" };
}

export async function pilotCompleteContributionPhoto(): Promise<{ status: string }> {
  return { status: "unavailable" };
}

/** La première page, telle que la rubrique la relit après un dépôt publié. */
export async function pilotLoadContributions(cursor: string): Promise<PublicContributionsPage | { status: string }> {
  void cursor;
  return dev() ? { items: [...published], nextCursor: null } : { status: "unavailable" };
}
