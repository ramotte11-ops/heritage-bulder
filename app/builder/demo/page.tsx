import Link from "next/link";
import { DEMO_MEMORIALS } from "@/lib/builder/demo-memorials";
import styles from "./page.module.css";

const EDITORIAL_CONTEXT_LABELS = {
  announcement: "Annonce & Hommage",
  remembrance: "Mémoire & Hommage",
} as const;

/**
 * Entry point for Mission 003's Builder demo — lists the local fixture
 * memorials (lib/builder/demo-memorials.ts), one per currently-configured
 * editorial context. Not a real project list: no Supabase, no owner
 * session, no real data.
 *
 * Mission 021 moved this from `/builder` to `/builder/demo` precisely so
 * it stops sharing a URL segment with the real Builder entry point
 * (`app/builder/[memorialId]/page.tsx`) — the two dynamic routes could
 * not coexist under the same `/builder/[x]` slot, and the fixture index
 * must never be reachable from the real parcours by construction, not
 * just by convention. Nothing about the fixtures themselves changed.
 */
export default function BuilderIndexPage() {
  const memorials = Object.values(DEMO_MEMORIALS);

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Builder HERITAGE — démonstration</h1>
      <p className={styles.subtitle}>
        Choisissez un mémorial de démonstration pour tester le parcours d&rsquo;édition. Ce sont
        des données fictives, locales à cette session — aucune n&rsquo;est stockée ni publiée.
      </p>

      <ul className={styles.list}>
        {memorials.map((memorial) => (
          <li key={memorial.id}>
            <Link href={`/builder/demo/${memorial.id}`} className={styles.card}>
              <span className={styles.cardContext}>
                {EDITORIAL_CONTEXT_LABELS[memorial.editorialContext]}
              </span>
              <span className={styles.cardSlug}>{memorial.slug}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
