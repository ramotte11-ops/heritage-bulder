# HERITAGE data foundation (Mission 002)

This document explains the schema in `migrations/`, why it's shaped the
way it is, what it protects and how, and how to work with it. It is the
source of truth for the database — **not** the Supabase dashboard. If a
real Supabase project's schema ever drifts from what's in Git, Git wins:
reset the project from these migrations rather than editing the dashboard
by hand.

No Supabase project exists yet at the end of Mission 002. Everything in
this document has been validated locally, without any external account —
see [Local testing](#local-testing).

## Schema overview

```
owners ──────┬─< entitlements
             │
             └──< memorials >── entitlement_id (unique) ──> entitlements
                      │      ├─< media
                      │      ├─< messages
                      │      ├─(1:1)─ memorial_drafts
                      │      └─(1:1, optional)─ memorial_published_snapshots
```

`memorials.entitlement_id` is the *only* link between an entitlement and
its memorial — see "Entitlement ⟷ memorial" below.

| Table | Purpose | Rows |
|---|---|---|
| `owners` | The person who manages one or more memorials. | One per person (by email). |
| `entitlements` | The right to create exactly one memorial, from one purchase — records `offer_id`, never a skin (Mission 006). | One per purchase. |
| `memorials` | The core entity: identity, configuration, status, slug. | One per memorial. |
| `memorial_drafts` | The content currently being edited. Never public. | Exactly one per memorial (auto-created). |
| `memorial_published_snapshots` | The current live content. What visitors read. | At most one per memorial (present only once published). |
| `media` | Photo metadata (no upload yet). | Many per memorial. |
| `messages` | Visitor condolences / testimonials / memory messages (no form yet). | Many per memorial. |

Every table, column, and constraint carries an inline comment in its
migration file explaining *why*, not just what — read the migrations
themselves for the full rationale; this file summarizes the decisions
that span multiple tables.

## Key design decisions

**Owner identity is HERITAGE's own, not Supabase Auth's.** `owners.id` is
what every other table links to. `owners.auth_user_id` is a nullable,
unconstrained (no foreign key) reference to Supabase Auth's user id — a
pointer *out*, not the identity itself. If HERITAGE ever moves off
Supabase Auth, only this one column, and how it gets populated, changes.
Nothing else does. `current_owner_id()` (defined in
`20260829152000_owners.sql`) resolves "who is making this request" once,
so every RLS policy calls that function instead of repeating the
`auth_user_id = auth.uid()` lookup.

**Draft and published content are separate tables, not two columns.**
This makes it structurally impossible for a public policy to leak draft
content — the public read policy exists only on
`memorial_published_snapshots`, a table that never holds draft data. Two
plain row-level policies achieve the same guarantee that would otherwise
need column-level security (a view).

**Content is JSONB, not one table per section.** Section content shapes
(Hero copy, gallery items, ...) aren't designed yet — that's Builder
work. A JSONB payload keyed by section id lets that shape evolve without
a migration per change, while the section IDs themselves stay governed by
`config/sections.ts` / `lib/sections.ts`, not by this schema. A fully
relational model would lock in six-plus tables' worth of content shape
today, for a problem V1 doesn't have yet.

**`memorial_published_snapshots` holds one row per memorial, not a
version history.** Republishing overwrites `content`/`published_at`. If
full version history is ever needed, it's a new table added later — this
schema doesn't foreclose that, it just doesn't build it now.

**Entitlement ⟷ memorial has exactly one source of truth:
`memorials.entitlement_id`.** It is `NOT NULL UNIQUE` — every memorial
has exactly one entitlement, and no two memorials can share one, which
together are exactly "1 Entitlement → 0 or 1 Memorial." `entitlements`
carries no `memorial_id` column at all (Mission 002 correction — an
earlier version of this schema had one, a second pointer back to the
same relationship, removed because two pointers for one relationship is
two sources of truth that can silently disagree, for no benefit V1
needs). An entitlement's memorial, if it has one, is found with
`select * from memorials where entitlement_id = ...` — already indexed
by that column's own `UNIQUE` constraint, so this is not a slower query,
just a lookup in the other direction.

One consequence worth naming: `entitlements.status`/`redeemed_at` are
bookkeeping the future redemption flow is responsible for keeping
truthful (e.g. setting `status = 'redeemed'` when it creates a
memorial) — the database does not itself derive `status` from whether a
matching memorial exists. That was already true before this correction
(the two tables were never trigger-synced); removing the second pointer
doesn't reduce any guarantee the schema previously actually enforced, it
only removes a redundant field that wasn't kept consistent by anything
either.

**Offer ⟷ MemorialType ⟷ AllowedSkins ⟷ SelectedSkin (Mission 006).**
`Offer` is pure application configuration (`config/offers.ts`), never a
database table — the same reasoning already applied to
Skin/MemorialType/Language above: it is a HERITAGE product rule, not
transactional data. `entitlements.offer_id` records which offer was
purchased; `OFFERS[offer_id]` (config, not SQL) determines both the
memorial type and the *set* of skins that offer grants access to
(`allowedSkins` — an array from V1 on, since a culture is expected to
grow beyond one skin without ever needing a schema change for that
alone). `entitlements` deliberately carries **no skin column of its
own** — an earlier version of this schema had `entitlements.skin_id`,
removed in `20260831160000_entitlement_offer_model.sql` because it
assumed a skin was always resolved by the time the entitlement exists,
which HERITAGE does not want to lock in (a future offer may let the
skin be chosen after purchase, e.g. at activation). The skin actually
used lives exclusively on `memorials.skin_id`; the rule
`memorial.skin_id ∈ OFFERS[entitlement.offer_id].allowedSkins` is
enforced in application code (`lib/entitlement/offer-skin.ts`,
`lib/entitlement/activate-entitlement.ts`), never as a cross-column SQL
CHECK — consistent with "Business logic lives in HERITAGE's own code,
not in Supabase" (see Portability below). `memorial_type` is likewise
never duplicated onto `entitlements` — it is always derived from
`offer_id` via config, exactly the same reasoning that removed
`entitlements.memorial_id` in the correction above: one relationship,
one source of truth.

**Autosave writes rely entirely on `memorial_drafts_update_own` — no new
policy, no migration (Mission 007).** `lib/adapters/supabase/draft-repository.ts`
overwrites `memorial_drafts.content` wholesale (last-write-wins) using
this table's existing RLS policy; it performs no ownership check of its
own, and none is needed — a wrong-owner write already affects zero rows
at the database level, exactly like `memorials`' own update policy (see
"Row Level Security" below). Known, accepted V1 limitation: no
optimistic concurrency control (no version/etag column) — acceptable
because nothing in this codebase yet lets two editors touch the same
memorial's draft at once; revisit if that changes.

**Section validity is only partly enforced by the database.**
`memorials.enabled_sections` is checked against the *union* of optional
section ids across both editorial contexts — not against the subset
that's actually valid for that memorial's own `editorial_context` (e.g.
`ceremony` only makes sense for `announcement`). That finer check is
`lib/sections.ts`'s job. This is a deliberate boundary, not an oversight:
enforcing it in the database would mean duplicating
`config/sections.ts`'s per-context mapping as SQL and keeping the two in
sync by hand.

## Row Level Security: what protects what

Every table has RLS enabled. No table has a "deny all" fallback to
remember — that's simply what RLS does by default when no policy
matches.

| Data | Protected by | How |
|---|---|---|
| One owner's row can't be read/edited by another owner | **PostgreSQL / RLS** | `auth_user_id = auth.uid()` |
| One family's memorials, drafts, media, messages are invisible to another family | **PostgreSQL / RLS** | `owner_id = current_owner_id()`, on every table |
| Draft content is never public | **PostgreSQL / RLS** | No public policy exists on `memorial_drafts` at all |
| Only a *published* memorial's content is public, and only the published snapshot (never status, owner, entitlement) | **PostgreSQL / RLS** | `memorial_published_snapshots`'s public policy checks `status = 'published'` via `public_memorial_publication_state()`; no public policy exists on `memorials` itself |
| A visitor can only post a message type whose section is actually enabled, on a published memorial | **PostgreSQL / RLS** | `messages_insert_public`'s `WITH CHECK` |
| A slug/entitlement/memorial can't end up duplicated or double-claimed | **PostgreSQL constraints** | `UNIQUE`, partial unique indexes, `CHECK` |
| Which *subset* of optional sections is valid for a memorial's editorial context | **Application code** | `lib/sections.ts` — not enforced in SQL, see above |
| Spam / abuse on the public message-insert policy | **Neither yet — explicitly out of scope** | Mission 002 only builds the authorization check (published + section enabled). Rate-limiting/abuse prevention must be added at the application layer before this is ever exposed to real visitors. |
| Memorial/entitlement creation, publication, redemption | **Neither yet — no policy grants it** | No INSERT policy exists for `memorials` or `entitlements` for any client role. These are created by trusted server-side logic (using the service role client), not built in Mission 002. |

**Security never rests on the client interface alone.** Every rule above
that matters for isolation between families is enforced in PostgreSQL,
not in Next.js — even once a UI exists, a bug or a bypassed check in that
UI cannot expose another family's data, because the database itself
refuses the row.

> **Product rule — not a technical limitation, a launch gate:**
> **AUCUNE INSERTION PUBLIQUE DE MESSAGE NE DOIT ÊTRE ACTIVÉE EN
> PRODUCTION AVANT LA MISE EN PLACE D'UNE PROTECTION ANTI-ABUS /
> ANTI-SPAM VALIDÉE.** The `messages_insert_public` RLS policy existing
> in this schema means the database *can* accept a public message once a
> future mission builds the form that calls it — it authorizes the
> *shape* of the feature, checking that the memorial is published and
> the relevant section is enabled. It is not, on its own, product
> approval to actually expose that form to real visitors. That approval
> is a separate decision, made once a spam/abuse protection has been
> designed and validated — not before.

### The `public_memorial_publication_state()` function

Two public policies (`memorial_published_snapshots`'s SELECT and
`messages`'s INSERT) need to check `memorials.status`/`enabled_sections`
for a specific row, without ever granting a visitor direct `SELECT` on
`memorials` (which would also expose `owner_id`, `entitlement_id`,
etc.). A plain subquery from those policies would itself be blocked by
`memorials`' own RLS, since it runs as the visitor's role.

The fix is a narrow `SECURITY DEFINER` SQL function (defined in
`20260829154000_memorials.sql`) that runs with its owner's privileges —
the migration role, which owns the table and therefore bypasses its RLS —
and returns only the two columns those policies need. This is a standard
PostgreSQL pattern for "table B's policy needs to check table A without
granting table A directly," not a Supabase-specific trick.

## Local testing

`scripts/db/test-local.sh` spins up a throwaway, vanilla PostgreSQL
cluster (no Docker, no Supabase project, no network — just the
`postgresql` server package), applies every migration in order, then:

1. asserts the core integrity constraints reject bad data (duplicate
   slugs, invalid enum/check values, double-claimed entitlements, a
   memorial without an owner, ...);
2. simulates two owners and an anonymous visitor and asserts RLS
   isolation between them, including the public snapshot/message
   policies.

It creates a minimal stand-in for the two things a real Supabase project
provides for free — an `auth.uid()` function and the `anon`/
`authenticated` roles with their default privileges — but only inside
the script itself, never in `migrations/`. Run it with:

```bash
scripts/db/test-local.sh
```

As of Mission 007 this passes 24/24 checks (11 integrity, 13 RLS). It is
not a substitute for testing against a real Supabase project (real
GoTrue-issued JWTs, PostgREST) — that happens once a project exists.

## Migration workflow

Migrations are plain, numbered SQL files in `migrations/`, applied in
filename order. This is the source of truth for the schema — if HERITAGE
recreates a Supabase project from scratch, or moves to a different
PostgreSQL host entirely, replaying these files in order reproduces the
schema exactly. Nothing about the schema exists only in a dashboard.

To apply them by hand against any Postgres instance:

```bash
for f in supabase/migrations/*.sql; do
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$f"
done
```

(Once a real Supabase project exists, the Supabase CLI's own migration
commands work the same way against these same files — nothing here is
CLI-specific.)

Adding a new migration: create a new file named
`<next-timestamp>_<short-description>.sql`, write forward-only SQL (no
down-migrations in V1 — reasonable for a schema this size, revisit if
that ever becomes painful), and add it to `scripts/db/test-local.sh`'s
coverage if it changes a constraint or policy worth asserting.

### Before applying `20260831160000_entitlement_offer_model.sql` to a real project

This migration drops `entitlements.skin_id` — destructive if any real
row already holds a value there. It has been validated only against
`scripts/db/test-local.sh`'s throwaway local cluster, never against a
real Supabase project. Before applying it remotely, run this read-only
query against the real project and confirm the result with a human
before proceeding:

```sql
select count(*) as total_rows,
       count(*) filter (where skin_id is not null) as rows_with_a_skin
from entitlements;
```

- **`total_rows = 0`**: nothing to preserve, the migration applies
  as-is.
- **`total_rows > 0` and `rows_with_a_skin = 0`**: existing rows have no
  skin set — the migration still applies as-is, but confirm what
  `offer_id` each of those rows should get (the migration cannot infer
  this; `alter column offer_id set not null` will refuse to run until
  every row has one).
- **`rows_with_a_skin > 0`**: real purchase data would be discarded.
  STOP — do not run this migration as-is. Decide the backfill (which
  `offer_id` each existing `skin_id` value maps to) with that data in
  hand before adapting the migration.

## Portability

- **The schema is reconstructible from Git alone.** See "Migration
  workflow" above.
- **Business logic lives in HERITAGE's own code, not in Supabase.** The
  only non-trivial logic in these migrations is schema-level integrity
  (the `updated_at` trigger, the auto-created draft row, the
  `public_memorial_publication_state()` read-only helper) — never a
  Supabase Edge Function, and nothing that decides product behaviour.
- **Media paths are internal, never persisted provider URLs.**
  `media.storage_path` is a HERITAGE-defined key; the actual URL is
  resolved on read by `lib/adapters/supabase/media-storage-provider.ts`.
  Moving storage providers means changing that one file, not any stored
  data.
- **`auth_user_id` is an external reference, not an identity.** See "Key
  design decisions" above.
- **No Edge Functions.** All Supabase-side logic in Mission 002 is plain
  SQL (functions, triggers) — none of it is a Supabase Edge Function.
- **Exporting to a standard PostgreSQL instance later:** `pg_dump` the
  database (schema and/or data), restore it into any PostgreSQL 13+
  instance, replay any migrations newer than the dump if needed, and
  point `lib/supabase/*` at a non-Supabase Postgres-compatible client (or
  replace those two files — nothing else in the codebase talks to
  Postgres directly, by design; see rule 2 in the Mission 002 brief).

## Setting up a real Supabase project (when that becomes the next step)

Nothing in Mission 002 required a real Supabase project — everything
above was built and tested locally. Creating one is the natural next
step before a future mission can build real authentication or the
Builder, but it is a decision for a human to make deliberately, not
something to do inside a coding session. When that time comes:

1. **Create the project** at supabase.com (or self-host) — a human
   action, needs a Supabase account.
2. **Apply these migrations** to it, in order (see "Migration workflow"
   above), either via `psql` or the Supabase CLI.
3. **Configure environment variables** — copy `.env.example` to
   `.env.local` for local development, and set the same variable names
   in Netlify's site environment variable settings for deployed
   environments. The actual values (project URL, anon key, service role
   key) come from the Supabase dashboard's Project Settings → API page,
   and must never be pasted into a chat, an issue, or committed to Git —
   only into `.env.local` (already git-ignored) or Netlify's own
   environment variable UI.
4. **Verify**: run `scripts/db/test-local.sh` (still works — it never
   touches the real project) and, separately, confirm from the Supabase
   dashboard's Table Editor that all seven tables exist with RLS enabled.
