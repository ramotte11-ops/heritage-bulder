import type { RendererKey } from "@/config/memorial-section-renderers";
import type { SectionId } from "@/config/sections";
import type { SkinVariant } from "@/config/skins";

export const FOUNDER_ATELIER_SECTIONS = [
  {
    id: "hero",
    label: "Hero",
    rendererKey: "HeroIntemporel",
    status: "integrated",
    note: "Renderer Intemporel raccordé au moteur du mémorial.",
  },
  {
    id: "deathNotice",
    label: "Avis de décès",
    rendererKey: "DeathNoticeIntemporel",
    status: "provisional",
    note: "Le runtime actuel reste sur DeathNoticeIntemporel. Les travaux V2 présents dans le dépôt ne sont pas encore raccordés et ne sont pas présentés ici comme un Master intégré.",
  },
  {
    id: "ceremony",
    label: "Cérémonie",
    rendererKey: "CeremonyV2",
    status: "integrated",
    note: "Renderer V2 raccordé. La variante Desktop Dark demeure provisoire.",
  },
  {
    id: "story",
    label: "Récit de vie",
    rendererKey: "RecitDeVieV2",
    status: "integrated",
    note: "Renderer V2 raccordé au moteur du mémorial.",
  },
  {
    id: "traditions",
    label: "Traditions & repères",
    rendererKey: "TraditionsV2",
    status: "integrated",
    note: "Renderer V2 raccordé au moteur du mémorial.",
  },
  {
    id: "gallery",
    label: "Galerie",
    rendererKey: "GalleryIntemporel",
    status: "integrated",
    note: "Renderer Intemporel raccordé avec sept médias synthétiques locaux et les runtimes Mobile/Desktop réels.",
  },
] as const satisfies readonly {
  id: SectionId;
  label: string;
  rendererKey: RendererKey;
  status: "integrated" | "provisional" | "notIntegrated" | "unavailable";
  note: string;
}[];

export type FounderAtelierSectionId = (typeof FOUNDER_ATELIER_SECTIONS)[number]["id"];
export type FounderAtelierDevice = "mobile" | "desktop";

export function parseFounderAtelierSection(value: unknown): FounderAtelierSectionId | null {
  return typeof value === "string" && FOUNDER_ATELIER_SECTIONS.some((section) => section.id === value)
    ? (value as FounderAtelierSectionId)
    : null;
}

export function parseFounderAtelierVariant(value: unknown): SkinVariant | null {
  return value === "light" || value === "dark" ? value : null;
}

export function founderAtelierStatus(
  sectionId: FounderAtelierSectionId,
  variant: SkinVariant,
  device: FounderAtelierDevice,
): "integrated" | "provisional" | "notIntegrated" | "unavailable" {
  const section = FOUNDER_ATELIER_SECTIONS.find((candidate) => candidate.id === sectionId);
  if (!section) return "unavailable";
  if (sectionId === "ceremony" && variant === "dark" && device === "desktop") return "provisional";
  return section.status;
}
