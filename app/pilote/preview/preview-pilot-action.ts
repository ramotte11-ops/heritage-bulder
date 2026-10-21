"use server";

import type { Language } from "@/config/languages";
import type { SkinVariant } from "@/config/skins";
import { buildFounderAtelierContent, resolveFounderAtelierMedia } from "@/lib/admin/founder-atelier-fixture";
import { assembleMemorial } from "@/lib/memorial/assembly/assemble-memorial";
import type { MemorialPreviewResult } from "@/components/builder/preview/BuilderPreviewHost";

/**
 * Pilote de la Preview du Builder (développement seulement) : la même
 * assemblée que `loadMemorialPreviewAction`, sur le jeu de données
 * déterministe de l'Atelier fondateur au lieu d'un brouillon Supabase.
 * Ne lit ni n'écrit rien en base.
 */
export async function loadPreviewPilotAction(skinVariant: SkinVariant, language: Language): Promise<MemorialPreviewResult> {
  if (process.env.NODE_ENV === "production") return { status: "unavailable" };
  const assembled = await assembleMemorial(
    { skin: "intemporel", skinVariant, language, content: buildFounderAtelierContent() },
    { resolveMedia: resolveFounderAtelierMedia },
  );
  return assembled.status === "assembled" ? { status: "ready", assembled } : { status: "unavailable" };
}
