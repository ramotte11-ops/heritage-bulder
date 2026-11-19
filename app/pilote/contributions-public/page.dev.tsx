import { notFound } from "next/navigation";
import type { Language } from "@/config/languages";
import { PublicContributionsProvider } from "@/components/memorial/contributions/contributions-host";
import { ContributionsV1Section } from "@/components/memorial/contributions/ContributionsV1Section";
import type { PublicContribution } from "@/lib/memorial/contributions/public-contribution-types";
import { demoContributions } from "@/lib/memorial/contributions/demo-contributions";

/**
 * M8-E3 — banc d'essai de la rubrique PUBLIQUE (hôte `public`), avec des
 * contributions SYNTHÉTIQUES mises au format de la lecture serveur. Aucune
 * donnée réelle, aucune écriture. Page de DÉVELOPPEMENT (`page.dev.tsx`,
 * routée par `next dev` seulement) ; `notFound()` en production.
 *
 *   /pilote/contributions-public?n=0                         (état vide M0)
 *   /pilote/contributions-public?n=3&combo=CRP&theme=dark
 *   /pilote/contributions-public?n=9&combo=PPPPPPRC          (O8 : chaque catégorie représentée)
 *   /pilote/contributions-public?off=photos&lang=en
 */
export default async function ContributionsPublicPilotPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : undefined);
  const theme = one("theme") === "dark" ? "dark" : "light";
  const language: Language = one("lang") === "en" ? "en" : one("lang") === "es" ? "es" : "fr";
  const pattern = (one("combo") ?? "RCRPCCRP").replace(/[^CRPcrp]/g, "").slice(0, 60) || "RCRP";
  const n = Math.min(200, Math.max(0, Number(one("n") ?? 6) || 0));
  const off = one("off") ?? "";
  const categories = { condolences: !off.includes("condolences"), stories: !off.includes("stories"), photos: !off.includes("photos") };
  const combo = Array.from({ length: n }, (_, i) => pattern[i % pattern.length]).join("");
  const items: PublicContribution[] = (n === 0 ? [] : demoContributions(combo)).map((d, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    type: d.kind === "condolence" ? "condolence" : d.kind === "story" ? "testimonial" : "photo",
    authorName: d.content.author,
    text: d.content.text,
    caption: d.content.caption,
    publishedAt: new Date(Date.UTC(2026, 10, 20, 12) - i * 3600_000).toISOString(),
    photo: d.content.photo ? { url: d.content.photo.src, width: d.content.photo.width, height: d.content.photo.height } : null,
  }));
  const initial = { categories, total: items.length, items, sceneExtras: [], complete: true, nextCursor: null };
  return (
    <main style={{ background: theme === "dark" ? "#1d1b19" : "#f3ece0", minHeight: "100vh", padding: "24px 0" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <PublicContributionsProvider initial={initial}>
          <ContributionsV1Section skinVariant={theme} language={language} displayName="Élise Martin" features={categories} />
        </PublicContributionsProvider>
      </div>
    </main>
  );
}
