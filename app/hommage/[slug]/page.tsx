import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { MemorialAssembly } from "@/components/memorial/assembly/MemorialAssembly";
import { PublicOfferingsProvider } from "@/components/memorial/symbolic-offerings/v1/offerings-public";
import { PublicContributionsProvider } from "@/components/memorial/contributions/contributions-host";
import { loadPublicContributionsInitial } from "@/lib/memorial/contributions/visitor-contributions";
import { createVisitorContributionDeps } from "@/lib/memorial/contributions/server-contributions";
import { loadPublicMemorial } from "@/lib/memorial/public/load-public-memorial";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role-client";
import { depositSymbolicOffering } from "./actions";
import { loadContributions, renewContributionPhotos } from "./contribution-actions";
import styles from "./page.module.css";

/**
 * QG 016 / M2 — `/hommage/[slug]`: the public consultation of a published
 * HERITAGE memorial (first validation: Jeanne Test-S1, `95bd2601eac8`, on
 * Supabase TEST).
 *
 * - Source: the PUBLISHED SNAPSHOT returned by `read_public_memorial_v1`
 *   (service_role, server side only) — never the draft.
 * - Rendering: the one existing engine, `assembleMemorial` →
 *   `MemorialAssembly`, with the memorial's own Light/Dark variant. No
 *   Builder chrome, no editor link, no new section, no renderer touched.
 * - Photographs: only those the snapshot references, as short-lived signed
 *   URLs minted for this request; no storage path reaches the browser.
 * - Unknown, unpublished, withdrawn, expired or unrenderable: the SAME
 *   neutral 404 (`notFound()`), whatever the reason.
 * - Never cached: `connection()` makes every render request-time (signed
 *   URLs expire), and nothing here opts into a cache.
 * - Not indexed (first TEST version): `noindex, nofollow, nocache`.
 *
 * Deliberately outside `proxy.ts`'s matcher: a visitor's session is never
 * read nor refreshed here.
 */

export const metadata: Metadata = {
  title: "Hommage — HERITAGE",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

async function loadContributionsForVisit(slug: string) {
  try {
    return await loadPublicContributionsInitial(createVisitorContributionDeps(), slug);
  } catch {
    console.error("Contributions: public read unavailable");
    return null;
  }
}

export default async function PublicMemorialPage({ params }: { params: Promise<{ slug: string }> }) {
  await connection();
  const { slug } = await params;

  const view = await loadPublicMemorial(slug, { client: createServiceRoleSupabaseClient() });
  if (view.status !== "ready") notFound();

  // M8-E3 — Contributions des proches : les contributions RÉELLES de cette
  // visite, filtrées par les catégories EN VIGUEUR (O9). Lues seulement si
  // la copie publiée porte la rubrique ; un échec de lecture n'affiche
  // jamais la démonstration du Builder : la rubrique est simplement absente.
  const contributions = view.assembled.sections.some((s) => s.rendererKey === "ContributionsV1Section")
    ? await loadContributionsForVisit(slug)
    : null;

  return (
    <main className={styles.page} lang={view.assembled.language} data-public-memorial="">
      {/* QG 016 — Offrandes symboliques : l'hôte public enregistre réellement
          le geste du visiteur (le serveur décide seul de son acceptation). */}
      <PublicOfferingsProvider slug={slug} deposit={depositSymbolicOffering}>
        {/* M8-E3 — pages suivantes de l'Album et liens photo renouvelés : Server Actions liées
            à CE slug ; le navigateur ne choisit ni l'hommage ni ce qui est lisible. */}
        <PublicContributionsProvider initial={contributions} loadMore={loadContributions.bind(null, slug)} renewPhotos={renewContributionPhotos.bind(null, slug)}>
          <MemorialAssembly assembled={view.assembled} />
        </PublicContributionsProvider>
      </PublicOfferingsProvider>
    </main>
  );
}
