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

**Draft read + write rely entirely on the existing
`memorial_drafts_select_own`/`memorial_drafts_update_own` policies — no
new policy, no migration (Mission 007/008).**
`lib/adapters/supabase/draft-repository.ts` reads and overwrites
`memorial_drafts.content` wholesale (last-write-wins) using these
tables' existing RLS; it performs no ownership check of its own, and
none is needed — a wrong-owner write already affects zero rows, and a
wrong-owner *read* returns zero rows too (surfaced as `null`, not an
error — Mission 008 deliberately keeps "doesn't exist" and "not yours"
indistinguishable to the caller). Known, accepted V1 limitation: no
optimistic concurrency control (no version/etag column) — acceptable
because nothing in this codebase yet lets two editors touch the same
memorial's draft at once; revisit if that changes.

**Builder session resumption relies entirely on `memorials_select_own`/
`memorial_drafts_select_own` — no new policy, no migration
(Mission 009).** `lib/builder/resume-session.ts` orchestrates
`DataRepository<Memorial>.findById()` and
`DraftRepository.getDraftContent()`, both already RLS-scoped; it
performs no ownership check of its own and takes no `ownerId` parameter
at all — a wrong-owner or unauthenticated `memorialId` already resolves
to the same "not found" signal these two policies already produce.

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

### The `redeem_entitlement()` function

`@supabase/supabase-js` exposes no transaction API: every
`.from().insert()` / `.update()` is its own PostgREST request, hence its
own transaction. A redemption is two writes plus the
`memorials_create_draft` trigger, and no ordering of independent
transactions avoids a window where one landed and the other did not — an
entitlement consumed with no memorial, or a memorial whose entitlement is
still `available`. One function call is one statement, therefore one
transaction, therefore all-or-nothing.

What it is: an **integrity envelope** — lock, verify, consume, create,
commit or roll back entirely. It receives `memorial_type` and `skin_id`
already decided and validated by the TypeScript domain
(`config/offers.ts`, `lib/entitlement/offer-skin.ts`) and knows nothing
about offers, skins, cultures, sales channels or UI. HERITAGE product
logic does not live in the database.

**`SECURITY INVOKER`, not `SECURITY DEFINER`** — deliberately the
opposite choice from `public_memorial_publication_state()` above, for the
opposite reason. That function *must* be DEFINER: it is evaluated inside
RLS policies as `anon`/`authenticated`, roles that must never read
`memorials`. `redeem_entitlement()` is called by the server-side service
role, which carries `BYPASSRLS` and — since Mission 013C — the exact
table privileges the function's body needs, granted explicitly in
`20260901190000_privilege_model.sql`. Keeping it INVOKER means the
function itself holds no ambient privilege, so it can never become a
privilege-escalation vector. If `EXECUTE` were ever granted here by
mistake, the body would run with that caller's own rights and be
refused twice over: no client role holds INSERT on `memorials` or any
privilege at all on `entitlements`, and no policy grants them an INSERT
either. (Mission 021B gave `authenticated` SELECT on `memorials` for the
Builder's own read — a read, scoped by `memorials_select_own`, which
changes nothing about that argument.)

(Before Mission 013C this paragraph said `service_role` carried "full
DML grants". It never did — see **The privilege model** below.) `EXECUTE` is revoked from
`PUBLIC` and granted only to `service_role`; the harness asserts that
`anon` and `authenticated` cannot call it.

Behaviour, all proved in `scripts/db/test-local.sh` against a real
cluster:

| Entitlement state | Result |
| --- | --- |
| `available` | Consumed; exactly one memorial created; returns `redeemed`. |
| `redeemed`, same owner | No second memorial; returns the existing `memorial_id` with `already_redeemed` (a lost response followed by a retry is a network event, not a corruption). |
| `redeemed`, different owner | Refused (`entitlement_owned_by_another_owner`). |
| `revoked` | Refused (`entitlement_not_available:revoked`); nothing created, nothing mutated. |
| `redeemed` with no memorial | Refused (`entitlement_redeemed_without_memorial`) — a real integrity anomaly, surfaced loudly, never "repaired" by minting a second memorial. |
| unknown id | Refused (`entitlement_not_found`). |

Concurrency is handled by `SELECT ... FOR UPDATE` on the entitlement row.
A second redemption of the same entitlement blocks there; under READ
COMMITTED (PostgreSQL's default, and Supabase's) it then re-reads the row
as the winner committed it, sees `redeemed`, and takes the idempotent or
refusal branch. Two winners are impossible.

### Progressive memorial columns

`memorials.editorial_context`, `memorials.language` and `memorials.slug`
are nullable (Mission 011A). A memorial row exists from the instant an
entitlement is redeemed — before the family has chosen its editorial
context or language, and long before a public slug can be generated
(that needs the deceased's name). NULL here is the explicit initial
state, not an accident; `status` stays `draft`, which already means
exactly this, so no new lifecycle value was invented for it.

The `CHECK` constraints are kept: in PostgreSQL a CHECK passes when its
expression is NULL, so `language in ('en','fr','es')` still rejects
`'zz'` while allowing NULL. `slug` stays `UNIQUE`, and PostgreSQL's
default unique index is **NULLS DISTINCT** — every NULL is distinct from
every other, so any number of memorials may sit at `slug IS NULL`
simultaneously while two identical non-null slugs are still rejected.
Verified against the target engine (PostgreSQL 16.13:
`pg_index.indnullsnotdistinct = false`) and asserted in the harness.
`NULLS NOT DISTINCT` is deliberately not used.

The TypeScript side mirrors this honestly: `StoredMemorial`
(`types/memorial.ts`) is what persistence returns, `Memorial` is the
configured memorial the Builder consumes, and `isConfiguredMemorial()`
is the only way across — no non-null assertions, no casts.

### Activation keys (Mission 013)

`entitlements.activation_key_hash` stores only `sha256("HH1:<payload>")`
in lowercase hex — never the raw key, which exists in memory exactly
twice: when it is generated and when someone presents it. The format
version is part of what is hashed on purpose, so the same 32 characters
under a future `HH2` can never open the right an `HH1` key opens.

SHA-256 rather than bcrypt/Argon2 is a deliberate choice, not an
oversight: password hashing exists to slow the brute force of
low-entropy human secrets, while a 160-bit CSPRNG key is not
brute-forceable at any speed — and a salt would make the hash
non-deterministic, destroying the indexed exact lookup this design
needs. No pepper either. Hashing happens in TypeScript (`node:crypto`),
never in pgcrypto, so the database only ever stores an opaque value it
indexes.

The hash lives on `entitlements` rather than in a side table for one
specific reason: **replacement and activation must serialize**. An
UPDATE of this column takes the row lock on exactly the row
`redeem_entitlement` locks, so "the key was replaced mid-activation" is
settled by PostgreSQL. A side table would not contend on that lock.

**The hash is server-only by privilege.** `entitlements_select_own` is a
ROW-level policy, so it would happily expose this column on an owner's
own row. Verified against a real cluster during Mission 013's audit:
`REVOKE SELECT (activation_key_hash)` alone does **nothing** while the
role still holds table-wide SELECT — a table grant covers every column
and a column revoke cannot subtract from it.

Mission 013 first answered that with a column allowlist on
`entitlements`: revoke the table from the client roles, grant the
non-secret columns back to `authenticated`. Mission 013B's diagnostic of
the real project retired that answer, and Mission 013C replaced it —
see **The privilege model** below. `authenticated` now holds **no
privilege on `entitlements` at all**, which protects the column more
strongly than any allowlist: it needs no maintenance when a column is
added, and it cannot be undone by a policy. `service_role` keeps the
SELECT the redemption engine needs.

### The `redeem_entitlement_with_activation_key()` function

Resolving a key to an entitlement id happens before any lock, so without
this a key support had already replaced could still redeem —
`redeem_entitlement()` has no idea which key brought the request. This
wrapper re-checks the key **under the same row lock** the redemption
takes, then delegates. It holds no business logic at all: no
available/redeemed/revoked, no ownership, no idempotence, no memorial or
draft creation, no offer/skin rule. It answers one question — "is this
still the current key, now that the right is locked?" — and calls
`redeem_entitlement()` for everything else.

`redeem_entitlement(uuid, uuid, text, text)` is **unchanged**: a right
granted directly by HERITAGE has no key and still redeems through it.
The wrapper is purely additive, `SECURITY INVOKER`, and executable by
`service_role` alone.

Refusals: `HH410 activation_key_superseded` when the current hash is
NULL, the presented hash is NULL, or the two differ. The harness proves
both orders — activation-then-replacement and replacement-then-activation
— and that the wrapper genuinely blocks on the row lock.

## The privilege model

Until Mission 013C, **no HERITAGE migration granted a single table
privilege**. The schema relied on Supabase's implicit default
privileges, and a read-only diagnostic of the real project showed what
that actually produced.

Every HERITAGE table is owned by `postgres`. `pg_default_acl` holds two
entries for `public`/tables: one `FOR ROLE supabase_admin` granting all
DML to `anon`/`authenticated`/`service_role`, and one `FOR ROLE postgres`
granting only `MAINTAIN`, `REFERENCES`, `TRIGGER` and `TRUNCATE`. Tables
created by `postgres` inherit only that second, **DML-less** set. So the
defaults did apply — they simply exclude SELECT/INSERT/UPDATE/DELETE.

Measured on a cluster reproducing that state exactly:

| Call | Result |
| --- | --- |
| `service_role` → `redeem_entitlement(...)` | `permission denied for table entitlements` |
| `authenticated` → `select from memorials` | `permission denied for table owners` |
| `anon` → `select from memorial_published_snapshots` | `permission denied` |

Mission 011A's redemption RPC had therefore never been able to run
against the real project. Nothing revealed it because no code path is
wired, the tables hold zero rows — and the local harness granted itself
the missing privileges, so it stayed green (fixed; see **Local
testing**).

What the roles *did* inherit was worse than what they did not.
`TRUNCATE` is **not filtered by row-level security**: measured against
the same configuration, `anon` and `authenticated` each emptied all
seven tables while being unable to read a single row from any of them.
PostgREST never emits TRUNCATE and these roles are `NOLOGIN`, so it is
not reachable through the REST API today — but that protection came from
the shape of the API surface, not from the privilege model.

`20260901190000_privilege_model.sql` states the model explicitly:
revoke everything from `PUBLIC`, `anon`, `authenticated` and
`service_role` on all seven tables, then grant back only what a wired
code path provably needs.

| Table | `service_role` | `authenticated` | `anon` | `PUBLIC` |
| --- | --- | --- | --- | --- |
| `owners` | SELECT, INSERT | — | — | — |
| `entitlements` | SELECT, INSERT, UPDATE | — | — | — |
| `memorials` | SELECT, INSERT | SELECT ¹, UPDATE (`language`) ² | — | — |
| `memorial_drafts` | — | SELECT, UPDATE ¹ | — | — |
| `memorial_published_snapshots` | — | — | — | — |
| `media` | — | — | — | — |
| `messages` | — | — | — | — |

¹ Opened by `20260905160000_builder_owner_access.sql` (Mission 021B) —
see **The Builder's client-role privileges** below. Everything else in
this table is `20260901190000_privilege_model.sql` (Mission 013C),
unchanged.

² Column-level only — `UPDATE (language)`, not a blanket `UPDATE` on the
table. Prepared by `20260906120000_builder_language_access.sql` (Mission
023) but **not yet applied to any real Supabase project** — see **T01's
one write privilege (Mission 023)** below. `editorial_context` and `slug`
stay closed for whichever later mission builds their own Guided Flow
step.

`DELETE` is granted nowhere: no code path deletes, and a purchase record
is not something a server flow should be able to remove by accident.
`memorial_drafts` needs no INSERT grant at all because
`create_memorial_draft()` became `SECURITY DEFINER` (below).

Mission 013C granted the client roles nothing, because nothing read
these tables as a client role yet — an RLS policy without a grant is
inert, not broken — and said the mission that wires an owner-facing
screen opens the grant it needs as a conscious act. Mission 021B is that
mission.

### The Builder's client-role privileges (Mission 021B)

`20260905160000_builder_owner_access.sql` opens exactly three privileges,
all for `authenticated`, all scoped further by RLS policies that resolve
the caller's own owner id:

| Privilege | Wired reader/writer |
| --- | --- |
| SELECT on `memorials` | `SupabaseMemorialConfigRepository.findConfigById` — one row, the memorial's configuration |
| SELECT on `memorial_drafts` | `SupabaseDraftRepository.getDraftContent` — loading the draft to edit |
| UPDATE on `memorial_drafts` | `SupabaseDraftRepository.saveDraftContent` — autosave, through the `saveDraftAction` Server Action, which re-authorizes every save |

Nothing else. In particular **`memorial_published_snapshots` stays closed
to every client role**: the Builder displays nothing from it. Mission
021B replaced the read path that would have needed it
(`SupabaseMemorialRepository.findById`, which composes all three memorial
tables) with the narrow `MemorialConfigRepository` port precisely so this
privilege never had to be opened for a feature nobody has built.
Publication is a later mission's, and it opens what it needs then.

No client INSERT on `memorial_drafts` (the SECURITY DEFINER trigger owns
that invariant), no client UPDATE on `memorials` as of this migration
(the family's own choices are each a later Guided Flow mission's — see
Mission 023 below for the first of them), no DELETE anywhere, nothing
for `anon`, and no new `service_role` privilege — `service_role` is not
even named in that migration's REVOKE, so what Mission 013C measured for
the redemption engine is untouched.

### T01's one write privilege (Mission 023)

`20260906120000_builder_language_access.sql` opens exactly one more
privilege, for `authenticated`, on top of Mission 021B's three:

| Privilege | Wired reader/writer |
| --- | --- |
| UPDATE (`language`) on `memorials` | `SupabaseMemorialConfigRepository.saveLanguage` — T01's language choice, through the `saveLanguageAction` Server Action, which re-authorizes every save exactly like `saveDraftAction` does |

Column-level, not a blanket `UPDATE` on the table: `saveLanguage` sets
`language` and nothing else, and the grant is the enforced ceiling for
that, not just the current code's intent — a future bug in that one
write path still could not reach `status`, `owner_id`,
`entitlement_id`, `skin_id`, `enabled_sections` or `slug` through this
privilege. `editorial_context` and `slug` stay exactly as closed as
Mission 021B left them; whichever later mission builds the
editorial-context step (or slug generation) opens the grant it needs
then, following the same discipline this migration does.

Scoped further by the same `memorials_update_own` row-level policy
(`supabase/migrations/20260829154000_memorials.sql`) Mission 021B's
`SELECT` already relies on — that policy has been sitting inert for
`UPDATE` since Mission 002 for lack of exactly this table-level
privilege.

**Not yet applied to any real Supabase project.** Mission 023's brief
requires implementing only what can be safely prepared locally and
stopping short of any real mutation — this migration is prepared,
committed, and validated against `scripts/db/test-local.sh`'s fully
local, no-network PostgreSQL cluster (472/472, unchanged from Mission
021B's baseline), but applying it to a real project is the QG's own,
separate step.

Two function changes go with it:

- **`current_owner_id()` → `SECURITY DEFINER`**, `search_path` pinned,
  `public.owners` schema-qualified. It is a policy helper, not business
  logic; as INVOKER every owner-scoped policy silently required SELECT
  on `owners`, which is why a client reading `memorials` got
  *permission denied for table owners*. The escalation risk normally
  attached to DEFINER is absent: the function **takes no arguments**, so
  it cannot be pointed at another row — it resolves `auth.uid()` and
  nothing else. `EXECUTE` is revoked from `PUBLIC` and granted to
  `authenticated` alone: every policy whose expression uses it is
  declared `TO authenticated`, the two policies that also target `anon`
  call `public_memorial_publication_state()` instead, and `service_role`
  carries `BYPASSRLS` so no policy is ever evaluated for it.
- **`create_memorial_draft()` → `SECURITY DEFINER`**, likewise pinned
  and qualified. "Every memorial has exactly one draft" is a schema
  invariant, and an invariant must not depend on the privileges of
  whoever performs the INSERT — as INVOKER it did, forcing a grant on a
  table no application code ever writes.

`set_updated_at()` stays INVOKER (it touches no table) with its
`search_path` pinned. `public_memorial_publication_state()` and
`redeem_entitlement()` are untouched.

**Doctrine: security lives in Git, not in a hosting provider's
defaults.** Every migration that creates a table states its privileges
explicitly. The platform's own `ALTER DEFAULT PRIVILEGES` are
deliberately *not* modified: they are shared with Supabase-managed
objects, invisible to Git, and would not reproduce on a plain PostgreSQL
instance.

## Local testing

`scripts/db/test-local.sh` spins up a throwaway, vanilla PostgreSQL
cluster (no Docker, no Supabase project, no network — just the
`postgresql` server package), applies every migration in order, then:

1. asserts the privilege model the migrations actually define — before
   the script itself grants anything;
2. asserts the core integrity constraints reject bad data (duplicate
   slugs, invalid enum/check values, double-claimed entitlements, a
   memorial without an owner, ...);
3. simulates two owners and an anonymous visitor and asserts RLS
   isolation between them, including the public snapshot/message
   policies.

It creates a minimal stand-in for what a real Supabase project provides
for free — an `auth.uid()` function, the `anon`/`authenticated`/
`service_role`/`authenticator` roles, and the default privileges those
roles actually inherit there — but only inside the script itself, never
in `migrations/`.

**The bootstrap is deliberately hostile.** Until Mission 013C it ran
`alter default privileges ... grant select, insert, update, delete` and,
after the migrations, a blanket `grant ... on all tables`. Between them
they manufactured every privilege the migrations never granted, which is
why this suite was green for eleven missions while the real project could
not execute `redeem_entitlement` at all. A harness that hands itself the
privileges under test proves nothing about them. It now reproduces the
remote default ACL exactly (`references, trigger, truncate` and no DML)
and grants nothing afterwards, so the migrations must supply what the
application needs and remove what the platform handed over.

A small, clearly-labelled block of **test-only grants** exists further
down, after every privilege assertion has run. It gives the client roles
the reads the RLS tests sit on top of, so those tests keep proving that
the *policies* return no rows rather than collapsing into *permission
denied*. Nothing in `migrations/` produces those grants, and the
assertions above them say so.

Mission 021B removed three entries from that block — `authenticated`
SELECT on `memorials` and SELECT/UPDATE on `memorial_drafts` — because a
migration now grants them for real. Re-granting them in the harness would
hide the day a migration stops. It also stopped granting `authenticated`
any access to `memorial_published_snapshots`: nothing reads that table as
an owner, so a test-only grant there would manufacture a privilege the
real system deliberately does not have.

```bash
scripts/db/test-local.sh
```

As of Mission 021B this passes 472/472 checks.

**One gap it cannot close.** This harness runs PostgreSQL 16, where the
`MAINTAIN` privilege does not exist; the real project runs 17+, where it
does. `REVOKE ALL PRIVILEGES` removes it there without naming it, but
only a postflight against the real project can prove that. The suite
prints an explicit note instead of pretending otherwise. More generally
it is not a substitute for testing against a real Supabase project —
real GoTrue-issued JWTs, real PostgREST.

## Préflight / postflight (`checks/`)

`checks/013c_preflight.sql` and `checks/013c_postflight.sql` are
**read-only** queries meant to be pasted into the Supabase SQL Editor by
someone who is not a developer. Neither performs a GRANT, REVOKE, CREATE
or UPDATE; both read catalogues only, and each returns **one** result
set.

The preflight records the "before" state — privileges per role and
table, PUBLIC's ACLs, table owners, the `pg_default_acl` entries, each
function's security mode and `search_path`, which of the two migrations
are already applied, and the row counts. It is a photograph, not a gate.

The postflight is run **after** applying, in this order:

1. `migrations/20260901180000_activation_keys.sql`
2. `migrations/20260901190000_privilege_model.sql`

Every row carries its own verdict in a `verdict` column — `OK`, `INFO`,
or `ECHEC`. A single `ECHEC` row means the deployed privilege model is
not the one this repository describes. Nothing needs interpreting.

It deliberately covers what the local harness cannot: `MAINTAIN` exists
only on PostgreSQL 17+, and the local cluster runs 16. The postflight
includes it when the server has it.

Both were validated against a throwaway cluster reproducing the remote
default-ACL signature, including negatively: each of `grant truncate`,
`grant delete`, an over-broad client `grant select`, an extra `execute`
grant, a `grant ... to public`, and reverting `current_owner_id()` to a
non-pinned INVOKER was individually shown to turn rows red.

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

### Before applying `20260901120000_redeem_entitlement.sql` to a real project

This migration is **additive and non-destructive**: it relaxes three
`NOT NULL` constraints (which can never fail on existing data) and
creates one function. It drops no column, changes no policy, and adds no
table. It has been validated only against `scripts/db/test-local.sh`'s
throwaway local cluster, never against a real Supabase project.

Run this **read-only** query against the real project first and confirm
the result with a human before proceeding. It reads catalogue metadata
and row counts only — it writes nothing and locks nothing:

```sql
-- 1. Current nullability of the three columns being relaxed.
select column_name, is_nullable, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'memorials'
  and column_name in ('editorial_context', 'language', 'slug')
order by column_name;

-- 2. Rows affected by the relaxation (informational: relaxing NOT NULL
--    never rewrites or invalidates a row, so any count is safe).
select count(*) as memorials_total,
       count(*) filter (where editorial_context is null) as context_null,
       count(*) filter (where language is null)          as language_null,
       count(*) filter (where slug is null)              as slug_null
from memorials;

-- 3. The constraints and index this migration relies on must already
--    exist and must NOT be dropped by it.
select conname, contype
from pg_constraint
where conrelid = 'public.memorials'::regclass
  and conname in ('memorials_entitlement_id_key',
                  'memorials_memorial_type_check',
                  'memorials_skin_id_check',
                  'memorials_language_check',
                  'memorials_editorial_context_check')
order by conname;

select indexrelid::regclass as index_name,
       indisunique,
       indnullsnotdistinct
from pg_index
where indrelid = 'public.memorials'::regclass
  and indisunique;

-- 4. The function must not already exist under a different signature,
--    and service_role must exist to receive the grant.
select p.proname, pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef as is_security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'redeem_entitlement';

select rolname, rolbypassrls from pg_roles where rolname = 'service_role';
```

Expected before applying:

- **(1)** all three columns report `is_nullable = NO`. If any already
  reports `YES`, part of this migration was applied before — stop and
  reconcile rather than re-running blindly.
- **(2)** any counts are acceptable; all three NULL counts will be `0`
  on a project that has never redeemed anything. This query exists to
  record the "before" state, not to gate the migration.
- **(3)** `memorials_entitlement_id_key` (the UNIQUE the whole
  "1 entitlement = 1 memorial" guarantee rests on) must be present, and
  the unique index on `slug` must report `indnullsnotdistinct = false`.
  If it reports `true`, STOP: multiple NULL slugs would collide and
  redemption would fail on the second memorial. The CHECK constraint
  names listed were confirmed against a cluster built from these
  migrations alone; a real project that recreated one could carry a
  different name. That is informational only — this migration references
  none of them by name.
- **(4)** `redeem_entitlement` must return **no rows** (it does not exist
  yet), and `service_role` must exist with `rolbypassrls = t`. After
  applying, the same query must report
  `args = p_entitlement_id uuid, p_owner_id uuid, p_memorial_type text, p_skin_id text`
  and `is_security_definer = f`. If the
  function already exists, compare its signature and `prosecdef` before
  re-creating it — `create or replace` would silently change behaviour.

Nothing in this migration has been applied to any real Supabase project.

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
