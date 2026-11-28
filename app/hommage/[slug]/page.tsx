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
import { loadPublicVideoPlayback } from "@/lib/memorial/video/hosting/public-video-playback";
import { withPublicVideoPlayback } from "@/lib/memorial/video/video-section";
import { depositSymbolicOffering, signSymbolicOfferingAction } from "./actions";
import { CONTRIBUTIONS_DEPOSIT_PUBLIC_READY, contributionsDepositOpenFor } from "@/config/contributions-deposit-readiness";
import {
  beginContributionPhoto,
  completeContributionPhoto,
  depositContributionText,
  loadContributions,
  openContributionWindow,
  renewContributionPhotos,
} from "./contribution-actions";
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

  const client = createServiceRoleSupabaseClient();
  const view = await loadPublicMemorial(slug, { client });
  if (view.status !== "ready") notFound();

  // VID-08 — « Des instants pour se souvenir » : seulement les vidéos que la
  // base autorise pour CETTE visite (publié, offre complète, visible, vidéo
  // de la copie publiée et prête au moment de la publication), chacune en
  // lecture signée 720p de courte durée. Hébergement non configuré, offre
  // gratuite, aucune vidéo prête, erreur : la rubrique n'est pas dessinée.
  // Aucune requête quand la copie publiée ne porte pas la rubrique.
  const hasVideoSection = view.assembled.sections.some((s) => s.rendererKey === "VideoHommageV1Section");
  const assembled = hasVideoSection
    ? { ...view.assembled, sections: withPublicVideoPlayback(view.assembled.sections, await loadPublicVideoPlayback({ slug, client })) }
    : view.assembled;

  // M8-E3 — Contributions des proches : les contributions RÉELLES de cette
  // visite, filtrées par les catégories EN VIGUEUR (O9). Lues seulement si
  // la copie publiée porte la rubrique ; un échec de lecture n'affiche
  // jamais la démonstration du Builder : la rubrique est simplement absente.
  //
  // M8-E6-F — VERROU DE PUBLICATION. Tant qu'il est fermé (Q6, modération
  // familiale, E6), la rubrique n'est ni lue ni dessinée en public : elle
  // inviterait à « laisser un message » sans le permettre. Aucune requête
  // n'est faite. Ouvert : la lecture, puis le dépôt (Server Actions E2).
  //
  // A15-R (branche de recette, jamais fusionnée) : verrou ouvert, mais pour
  // les seuls hommages fictifs listés dans CONTRIBUTIONS_RECETTE_SLUGS ;
  // tout autre hommage est servi exactement comme sur `main`.
  const contributionsOpen = CONTRIBUTIONS_DEPOSIT_PUBLIC_READY && contributionsDepositOpenFor(slug);
  const contributions =
    contributionsOpen && view.assembled.sections.some((s) => s.rendererKey === "ContributionsV1Section")
      ? await loadContributionsForVisit(slug)
      : null;
  const deposit = contributionsOpen
    ? { slug, actions: { openContributionWindow, depositContributionText, beginContributionPhoto, completeContributionPhoto } }
    : undefined;

  return (
    <main className={styles.page} lang={view.assembled.language} data-public-memorial="">
      {/* QG 016 — Offrandes symboliques : l'hôte public enregistre réellement
          le geste du visiteur (le serveur décide seul de son acceptation).
          Lot 2 : puis, s'il le souhaite, sa signature privée (famille seule). */}
      <PublicOfferingsProvider slug={slug} deposit={depositSymbolicOffering} sign={signSymbolicOfferingAction}>
        {/* M8-E3 — pages suivantes de l'Album et liens photo renouvelés : Server Actions liées
            à CE slug ; le navigateur ne choisit ni l'hommage ni ce qui est lisible. */}
        <PublicContributionsProvider initial={contributions} loadMore={loadContributions.bind(null, slug)} renewPhotos={renewContributionPhotos.bind(null, slug)} deposit={deposit}>
          <MemorialAssembly assembled={assembled} />
        </PublicContributionsProvider>
      </PublicOfferingsProvider>
    </main>
  );
}
