import type { SectionId } from "@/config/sections";
import type { Memorial, MemorialContent } from "@/types/memorial";
import type { DemoSectionContent } from "./demo-content";

/**
 * Local, hard-coded demo memorials for Mission 003's Builder shell.
 *
 * These are fixtures only — not real data. They are never read from or
 * written to Supabase, and no Supabase client is imported anywhere in
 * lib/builder/ or components/builder/. Ids, slugs, owner and entitlement
 * references are made-up strings ("demo-…"), deliberately not
 * UUID-shaped, so they can never be mistaken for a real database row.
 *
 * One fixture per currently-configured editorial context, to demonstrate
 * the same Builder engine handling both without any per-context branch
 * in the Builder's own code (Mission 003 principle: one Builder).
 */

function demoContent(entries: Partial<Record<SectionId, DemoSectionContent>>): MemorialContent {
  return entries;
}

// Fixed, arbitrary timestamp — this is fixture data, not a real event.
const FIXTURE_TIMESTAMP = "2026-01-01T00:00:00.000Z";

export const DEMO_MEMORIALS: Record<string, Memorial> = {
  "demo-announcement": {
    id: "demo-announcement",
    ownerId: "demo-owner",
    entitlementId: "demo-entitlement-announcement",
    memorialType: "person",
    editorialContext: "announcement",
    skin: "intemporel",
    language: "fr",
    enabledSections: ["story", "gallery"],
    status: "draft",
    slug: "demo-annonce-hommage",
    draft: {
      content: demoContent({
        hero: { title: "Éléonore Vasseur", body: "1938 — 2026" },
        deathNotice: {
          title: "Avis de décès",
          body: "Éléonore Vasseur s'est éteinte paisiblement, entourée des siens.",
        },
        story: { title: "Son histoire", body: "Contenu de démonstration à compléter." },
        gallery: { title: "Galerie", body: "Emplacement de démonstration pour des photos." },
      }),
      updatedAt: FIXTURE_TIMESTAMP,
    },
    published: null,
    createdAt: FIXTURE_TIMESTAMP,
    updatedAt: FIXTURE_TIMESTAMP,
  },
  "demo-remembrance": {
    id: "demo-remembrance",
    ownerId: "demo-owner",
    entitlementId: "demo-entitlement-remembrance",
    memorialType: "person",
    editorialContext: "remembrance",
    skin: "intemporel",
    language: "fr",
    enabledSections: ["gallery", "memoryMessage"],
    status: "draft",
    slug: "demo-memoire-hommage",
    draft: {
      content: demoContent({
        hero: { title: "Marcel Onésime", body: "En mémoire" },
        story: { title: "Son histoire", body: "Contenu de démonstration à compléter." },
        gallery: { title: "Galerie", body: "Emplacement de démonstration pour des photos." },
        memoryMessage: {
          title: "Laisser un mot",
          body: "Aperçu de démonstration de cette section.",
        },
      }),
      updatedAt: FIXTURE_TIMESTAMP,
    },
    published: null,
    createdAt: FIXTURE_TIMESTAMP,
    updatedAt: FIXTURE_TIMESTAMP,
  },
};
