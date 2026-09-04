import { notFound } from "next/navigation";
import {
  requireAdminForRequest,
  runAdminSupportSearch,
} from "@/lib/admin/admin-session";
import {
  parseAdminSupportQueryKind,
  type AdminSupportQueryKind,
  type AdminSupportSearchResult,
  type EntitlementSupportView,
} from "@/lib/admin/support-search";
import type { OwnerSupportSummary } from "@/types/admin-support";
import styles from "./page.module.css";

/**
 * Mission 015A — the HERITAGE staff support console. Internal tool,
 * read-only, deliberately plain: it exists so support can answer "what
 * is the state of this family's right?" without opening the Supabase
 * dashboard. It is not a product surface and no family ever sees it.
 *
 * ## Why `notFound()` rather than a redirect to /login
 *
 * A visitor, an ordinary signed-in user and an owner with fifty
 * memorials all get the same 404. Redirecting to /login, or showing
 * "administrators only", would confirm to anybody who guessed the URL
 * that an Admin area exists here — and turn this page into a way to
 * test whether an account happens to be staff. Staff know to sign in
 * first; nobody else learns anything.
 *
 * ## Search is a GET
 *
 * A lookup reads and changes nothing, so it is a query string, not a
 * Server Action. That keeps the page linkable (a ticket can carry the
 * exact query a colleague ran) and means no mutation-shaped endpoint
 * exists on an Admin surface that has no mutations in Mission 015A.
 *
 * `dynamic = "force-dynamic"` because the answer depends on who is
 * asking: a cached render of this page would be a cached render of
 * somebody's support record.
 */
export const dynamic = "force-dynamic";

const QUERY_LABELS: Record<AdminSupportQueryKind, string> = {
  ownerEmail: "Email du propriétaire",
  entitlementId: "ID de droit (entitlement)",
  memorialId: "ID de mémorial",
};

const INVALID_QUERY_MESSAGES = {
  malformedEmail: "Cette adresse email n'est pas valide.",
  malformedId: "Cet identifiant n'est pas un UUID valide.",
  empty: "Saisissez une valeur à rechercher.",
  invalidKind: "Ce type de recherche n'est pas valide.",
} as const;

function formatDate(iso: string): string {
  // Fixed locale and UTC on purpose: two staff members reading the same
  // ticket must see the same timestamp, whatever their machine says.
  return new Date(iso).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function OwnerCard({ owner }: { owner: OwnerSupportSummary | null }) {
  if (!owner) {
    return (
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Propriétaire</h2>
        <p className={styles.empty}>
          Aucun propriétaire : ce droit n&rsquo;a pas encore été activé.
        </p>
      </section>
    );
  }

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Propriétaire</h2>
      <dl className={styles.fields}>
        <dt>Email</dt>
        <dd>{owner.email}</dd>
        <dt>ID</dt>
        <dd className={styles.mono}>{owner.id}</dd>
        <dt>Compte connecté</dt>
        {/* The auth user id itself is never transported this far: the
            repository already reduced it to this boolean (Mission 011B's
            "unlinked owner" case) before the record left the adapter —
            see OwnerSupportSummary. */}
        <dd>{owner.hasAuthAccount ? "oui" : "non — jamais connecté"}</dd>
        <dt>Créé le</dt>
        <dd>{formatDate(owner.createdAt)}</dd>
      </dl>
    </section>
  );
}

function EntitlementCard({ entitlement, memorial }: EntitlementSupportView) {
  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>
        Droit <span className={styles.statusTag}>{entitlement.status}</span>
      </h2>
      <dl className={styles.fields}>
        <dt>ID</dt>
        <dd className={styles.mono}>{entitlement.id}</dd>
        <dt>Offre</dt>
        <dd>{entitlement.offerId}</dd>
        <dt>Source</dt>
        <dd>
          {entitlement.source}
          {entitlement.externalOrderId ? ` — ${entitlement.externalOrderId}` : ""}
        </dd>
        <dt>Créé le</dt>
        <dd>{formatDate(entitlement.createdAt)}</dd>
        <dt>Activé le</dt>
        <dd>{entitlement.redeemedAt ? formatDate(entitlement.redeemedAt) : "—"}</dd>
      </dl>

      <h3 className={styles.subTitle}>Mémorial</h3>
      {memorial ? (
        <dl className={styles.fields}>
          <dt>ID</dt>
          <dd className={styles.mono}>{memorial.id}</dd>
          <dt>Statut</dt>
          <dd>{memorial.status}</dd>
          <dt>Type / skin</dt>
          <dd>
            {memorial.memorialType} / {memorial.skin}
          </dd>
          <dt>Contexte éditorial</dt>
          <dd>{memorial.editorialContext ?? "non choisi"}</dd>
          <dt>Langue</dt>
          <dd>{memorial.language ?? "non choisie"}</dd>
          <dt>Slug</dt>
          <dd className={styles.mono}>{memorial.slug ?? "—"}</dd>
          <dt>Modifié le</dt>
          <dd>{formatDate(memorial.updatedAt)}</dd>
        </dl>
      ) : (
        <p className={styles.empty}>
          Aucun mémorial : ce droit n&rsquo;a pas encore été activé.
        </p>
      )}
    </section>
  );
}

function Results({ result }: { result: AdminSupportSearchResult }) {
  if (result.status === "invalidQuery") {
    return (
      <p className={styles.message} role="alert">
        {INVALID_QUERY_MESSAGES[result.reason]}
      </p>
    );
  }

  if (result.status === "notFound") {
    return <p className={styles.message}>Aucun résultat pour cette recherche.</p>;
  }

  const { owner, entitlements } = result.record;

  return (
    <div className={styles.results}>
      <OwnerCard owner={owner} />
      {entitlements.length === 0 ? (
        <p className={styles.message}>
          Ce propriétaire existe mais ne détient aucun droit.
        </p>
      ) : (
        entitlements.map((view) => (
          <EntitlementCard key={view.entitlement.id} {...view} />
        ))
      )}
    </div>
  );
}

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; q?: string }>;
}) {
  // The gate runs before anything is read or rendered, and it resolves
  // the session itself — nothing about who is asking comes from the URL.
  const gate = await requireAdminForRequest();
  if (gate.status !== "granted") {
    notFound();
  }

  const { kind: rawKind, q } = await searchParams;
  const value = typeof q === "string" ? q : "";

  // The initial, un-submitted load has no `kind` at all — that is the
  // form's own default, `ownerEmail`. Once a `kind` IS present, it must
  // name one of the three supported modes: an unrecognised one is
  // refused as an invalid query, never silently re-run as `ownerEmail`
  // or any other mode nobody asked for.
  const kind = rawKind === undefined ? "ownerEmail" : parseAdminSupportQueryKind(rawKind);

  const outcome =
    kind === null
      ? ({
          status: "completed",
          result: { status: "invalidQuery", reason: "invalidKind" },
        } as const)
      : value.trim() !== ""
        ? await runAdminSupportSearch({ kind, value })
        : null;

  return (
    <main className={styles.main}>
      <p className={styles.eyebrow}>HERITAGE — support interne</p>
      <h1 className={styles.title}>Recherche support</h1>
      <p className={styles.notice}>
        Consultation seule. Aucune action n&rsquo;est possible depuis cet écran : le
        remplacement de clé, l&rsquo;invalidation et la révocation arriveront avec leur
        journal d&rsquo;audit.
      </p>

      <form className={styles.form} method="get">
        <label className={styles.field}>
          <span>Rechercher par</span>
          {/* Purely a display default for the widget itself: an invalid
              `kind` in the URL still shows a valid selection here, but
              that never feeds back into what was searched — the outcome
              above was already fixed as `invalidQuery` before this
              renders. */}
          <select name="kind" defaultValue={kind ?? "ownerEmail"}>
            {(Object.keys(QUERY_LABELS) as AdminSupportQueryKind[]).map((option) => (
              <option key={option} value={option}>
                {QUERY_LABELS[option]}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span>Valeur exacte</span>
          <input name="q" type="text" defaultValue={value} autoComplete="off" />
        </label>

        <button type="submit">Rechercher</button>
      </form>

      {outcome === null ? null : outcome.status === "denied" ? (
        // Unreachable in practice — the gate above already ran — but the
        // service refuses on its own account, and this page never
        // renders a record it was not granted.
        <p className={styles.message} role="alert">
          Accès refusé.
        </p>
      ) : (
        <Results result={outcome.result} />
      )}
    </main>
  );
}
