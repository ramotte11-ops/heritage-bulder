"use server";

import type { Language } from "@/config/languages";
import type { SkinVariant } from "@/config/skins";
import { buildFounderAtelierContent, resolveFounderAtelierMedia } from "@/lib/admin/founder-atelier-fixture";
import { assembleMemorial } from "@/lib/memorial/assembly/assemble-memorial";
import { setSectionVisibility } from "@/lib/memorial/section-visibility";
import { SECTION_IDS, type SectionId } from "@/config/sections";
import type { MemorialContent } from "@/types/memorial";
import type { MemorialPreviewResult } from "@/components/builder/preview/BuilderPreviewHost";

/**
 * Pilote de la Preview du Builder (développement seulement) : la même
 * assemblée que `loadMemorialPreviewAction`, sur le jeu de données
 * déterministe de l'Atelier fondateur au lieu d'un brouillon Supabase.
 * Ne lit ni n'écrit rien en base.
 *
 * `hidden` : rubriques masquées appliquées au jeu de données par la vraie
 * règle `setSectionVisibility` — contrôle de fidélité de la Preview, pas
 * une sauvegarde (la persistance réelle est `saveSectionVisibilityAction`).
 */
export async function loadPreviewPilotAction(
  skinVariant: SkinVariant,
  language: Language,
  hidden: readonly string[] = [],
): Promise<MemorialPreviewResult> {
  if (process.env.NODE_ENV === "production") return { status: "unavailable" };
  let content: MemorialContent = buildFounderAtelierContent();
  for (const id of hidden) {
    if (!(SECTION_IDS as readonly string[]).includes(id)) continue;
    const next = setSectionVisibility(content, id as SectionId, false, "intemporel");
    if (next.ok) content = next.content;
  }
  const assembled = await assembleMemorial(
    { skin: "intemporel", skinVariant, language, content },
    { resolveMedia: resolveFounderAtelierMedia },
  );
  return assembled.status === "assembled" ? { status: "ready", assembled } : { status: "unavailable" };
}
