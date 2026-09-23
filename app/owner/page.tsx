import Link from "next/link";
import { redirect } from "next/navigation";
import { getHeritageActor } from "@/lib/auth/heritage-session";
import { requireOwner } from "@/lib/auth/heritage-actor";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { SupabaseOwnedMemorialListRepository } from "@/lib/adapters/supabase/owned-memorial-list-repository";
import type { OwnedMemorialSummary } from "@/lib/adapters/owned-memorial-list-repository";
import { LogoutButton } from "@/components/auth/LogoutButton";
import styles from "./page.module.css";

/**
 * The owner space — where a signed-in family finds their memorial again.
 *
 * Mission 004 built this page as a bare "you are signed in" shell.
 * Builder continuity mission: it is now the minimal client entry point
 * the parcours was missing. It is already where everyone lands by
 * default after a magic link (`DEFAULT_RETURN_PATH`,
 * lib/auth/return-path.ts), so nothing about Auth or its redirects
 * changes — this page simply lists the memorials this Owner owns, each
 * linking to its Builder, so no family ever has to keep a UUID.
 *
 * Who is asking is resolved server-side only (`getHeritageActor`: the
 * validated session, then the Owner by `auth_user_id`). Being signed in
 * is still not being an Owner (Mission 004's rule): a session with no
 * Owner behind it sees no memorial, only the way to /activate. The list
 * itself is read through the session-scoped client, under RLS, filtered
 * by that server-resolved Owner (see SupabaseOwnedMemorialListRepository).
 * And a link is only a link: opening it still goes through the Builder
 * route's own `authorizeMemorialForRequest`, unchanged.
 *
 * A list, never a single hard-wired memorial: V1 is 1 purchase = 1
 * memorial, but an Owner may hold several, and nothing here assumes
 * otherwise. No automatic redirect into "the" Builder, on purpose.
 */
export const dynamic = "force-dynamic";

const CREATED_AT_FORMAT = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "long",
  timeZone: "Europe/Paris",
});

function formatCreatedAt(iso: string): string | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : CREATED_AT_FORMAT.format(date);
}

type OwnerSpace =
  | { status: "memorials"; memorials: OwnedMemorialSummary[] }
  | { status: "none" }
  | { status: "error" };

export default async function OwnerPage() {
  let actor: Awaited<ReturnType<typeof getHeritageActor>> | null = null;
  let space: OwnerSpace;

  try {
    actor = await getHeritageActor();
  } catch (error) {
    console.error("Owner space: actor resolution failed:", error instanceof Error ? error.message : error);
  }

  if (actor && actor.audience === "visitor") {
    redirect("/login");
  }

  if (!actor) {
    space = { status: "error" };
  } else {
    const gate = requireOwner(actor);
    if (gate.status !== "granted") {
      space = { status: "none" };
    } else {
      try {
        const repository = new SupabaseOwnedMemorialListRepository(await createServerSupabaseClient());
        const memorials = await repository.listOwnedMemorials(gate.owner.id);
        space = memorials.length > 0 ? { status: "memorials", memorials } : { status: "none" };
      } catch (error) {
        console.error("Owner space: memorial list failed:", error instanceof Error ? error.message : error);
        space = { status: "error" };
      }
    }
  }

  const email = actor?.identity?.email ?? null;

  return (
    <main className={styles.main}>
      <p className={styles.eyebrow}>Espace propriétaire</p>
      <h1 className={styles.title}>Mes mémoriaux</h1>
      {email ? <p className={styles.email}>{email}</p> : null}

      {space.status === "memorials" && (
        <ul className={styles.list}>
          {space.memorials.map((memorial) => {
            const createdAt = formatCreatedAt(memorial.createdAt);
            return (
              <li key={memorial.id} className={styles.item}>
                <p className={styles.itemName}>{memorial.displayName ?? "Mémorial en cours de création"}</p>
                {createdAt ? <p className={styles.itemMeta}>Créé le {createdAt}</p> : null}
                <Link href={`/builder/${encodeURIComponent(memorial.id)}`} className={styles.itemLink}>
                  Ouvrir l&rsquo;atelier
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {space.status === "none" && (
        <>
          <p className={styles.notice}>Aucun mémorial n&rsquo;est encore associé à ce compte.</p>
          <Link href="/activate" className={styles.itemLink}>
            Activer mon accès HERITAGE
          </Link>
        </>
      )}

      {space.status === "error" && (
        <p role="alert" className={styles.notice}>
          Vos mémoriaux n&rsquo;ont pas pu être chargés pour le moment. Merci de réessayer dans
          quelques instants.
        </p>
      )}

      <LogoutButton />
    </main>
  );
}
