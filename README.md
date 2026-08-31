# Heritage Hommage

Technical foundation for the HERITAGE HOMMAGE memorial Builder — a single,
configurable engine that will let non-technical clients personalize,
preview and publish an online memorial.

This repository currently contains **Mission 001 (technical foundations),
Mission 002 (data model & Supabase foundation), Mission 003 (Builder
shell — local demo only), Mission 004 (owner authentication — Magic
Link, session only, no product entitlement), Mission 005 (memorial
lifecycle state machine — pure logic only, not wired into the Builder or
Supabase yet), Mission 006 (Offer → MemorialType/AllowedSkins →
Memorial.skin model — pure logic + schema change only, no real
activation flow yet), and Mission 007 (autosave foundation — a real
draft-content write path and a pure save-status state machine, neither
wired into the Builder yet)**. There is no connected Supabase project
for the Builder itself yet, no real Builder persistence, no photo
upload, and no final visual design —
see [What is NOT built](#what-is-not-built-yet) below.

## Getting started

Requirements: Node.js 20+ and npm.

```bash
# install dependencies
npm install

# run the local dev server (http://localhost:3000)
npm run dev

# type-check, lint
npm run lint

# unit tests
npm run test

# production build
npm run build
npm run start
```

No environment variables or external service is required to install, run,
or build this project — see `.env.example` for what a future mission will
need once Supabase is actually connected.

Once running, open `/builder` for the Mission 003 Builder demo — a
locally-driven memorial editor with two demo memorials, one per
currently-configured editorial context.

Open `/login` for the Mission 004 owner authentication demo (Magic
Link). Without `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`
set, the page still loads and `/owner` still redirects to `/login`
correctly (see `lib/supabase/session.ts`) — only the actual email send
requires a configured Supabase project (see `supabase/README.md` for how
to connect one, and this mission's report for the additional Auth-specific
setup: Redirect URLs and `NEXT_PUBLIC_SITE_URL`).

To validate the database schema locally (no account, no Docker, no
network — see `supabase/README.md`):

```bash
scripts/db/test-local.sh
```

## Stack

- **Next.js 16** (App Router) + **React 19**, in **TypeScript** (`strict`
  mode).
- **ESLint** (`eslint-config-next`) for linting.
- **Native CSS** (CSS Modules) — no UI framework (no Tailwind, no
  component library). One was not justified for this mission's scope.
- **Netlify** for hosting/deployment (already connected to this repository).
  `netlify.toml` only declares the build command and Node version — no
  Netlify-specific runtime feature is used.
- **Supabase** (`@supabase/supabase-js` + `@supabase/ssr`) for PostgreSQL +
  Auth + Storage — schema and adapters exist (see `supabase/` and
  `lib/supabase/`), but no real project is connected yet. `@supabase/ssr`
  (added in Mission 004) is the officially recommended package for
  cookie-based session persistence in the Next.js App Router — needed for
  a session to survive a page refresh, which plain `@supabase/supabase-js`
  cannot do on its own.
- **Vitest** for unit tests on framework-free logic (`lib/**/*.test.ts`) —
  chosen over Jest for lighter/faster setup with this project's TS +
  Turbopack stack; no React rendering/DOM dependency needed, since
  Builder logic is deliberately kept separate from its React components
  (see Repository structure below).

See each mission's final report (delivered in the conversation that
produced the corresponding commits) for the full dependency list and
rationale.

## Repository structure

```
app/                          Next.js App Router — routes only
  layout.tsx                  Root HTML shell, global styles import
  page.tsx                    Home route — renders FoundationStatus
  builder/
    page.tsx                  Demo memorial picker
    [demoId]/page.tsx         Opens one demo memorial in the Builder shell
  login/page.tsx               Magic Link request form (Mission 004)
  owner/page.tsx                Protected shell — session required, no
                                Owner/Entitlement lookup (+ page.test.tsx)
  auth/
    actions.ts                  Server Actions: requestMagicLink, signOut
                                (+ actions.test.ts, Supabase mocked)
    callback/route.ts            Magic Link PKCE code exchange

components/                   Presentational UI, grouped by domain
  foundation/
    FoundationStatus.tsx      Technical confirmation page (Mission 001)
  builder/                    Builder shell UI (Mission 003) — presentation
                               only; all state transitions come from
                               lib/builder/builder-state.ts
    BuilderShell.tsx           Top-level: header, mode switch, layout
    SectionList.tsx             Section nav + socle/optional + toggle
    SectionEditor.tsx           Minimal generic edit fields
    MemorialPreview.tsx         Read-only preview of enabled sections
  auth/                       Login/logout UI (Mission 004)
    LoginForm.tsx               Email field, useActionState, no password
    LogoutButton.tsx             Form bound to the signOut Server Action

config/                       HERITAGE-defined product configuration
  memorial.ts                 memorialType, editorialContext values
  skins.ts                    skin values — 5 as of Mission 006 (one per
                               cultural offer); an offer may grant more
                               than one without ever changing this file's
                               shape, only its value list
  languages.ts                language values — independent of skin
  sections.ts                 section ids + per-context order/socle rules
  entitlements.ts             entitlement source/status values
  offers.ts                   OfferId -> { memorialType, allowedSkins }
                               (Mission 006) — what a customer actually
                               buys; never a database table, same as the
                               other files here. See its own docstring
                               for the full Offer/Entitlement/Memorial
                               separation.
  media.ts                    media type values
  messages.ts                 visitor message type values

lib/                          Logic that operates on config/types
  sections.ts                 getOrderedSections() helper (+ sections.test.ts)
  auth/
    validate-email.ts           Pure email shape check (+ tests)
    magic-link-state.ts          MagicLinkFormState type/initial value —
                                 kept out of app/auth/actions.ts because a
                                 "use server" file may only export
                                 async functions
  builder/                    Framework-free Builder logic (Mission 003) —
                               pure functions, no React import; this is the
                               boundary a future mission connects to
                               DataRepository<Memorial>/memorial_drafts
    builder-state.ts            State shape + pure transitions (+ tests)
    demo-content.ts              Mission-003-only generic content shape
    demo-memorials.ts            Local fixtures, never touch Supabase
    section-labels.ts            Builder UI text only, not product i18n
    autosave-state.ts            Mission 007 — pure save-status state
                                 machine (idle/pending/saving/saved/
                                 error) + AUTOSAVE_DEBOUNCE_MS; knows
                                 nothing about MemorialType/Skin/Offer;
                                 not wired into any component yet — the
                                 boundary a future progressive-editing UI
                                 binds to (+ tests)
  memorial/                   Memorial lifecycle logic (Mission 005) —
                               pure, no I/O, no Supabase; not wired into
                               the Builder or any adapter yet — the clean
                               boundary a future publish/save Server
                               Action is meant to call
    status-transitions.ts       MEMORIAL_STATUS_TRANSITIONS (the 9
                                 validated transitions; archived is a
                                 deliberate terminal state — no
                                 restore/un-archive in this mission),
                                 canTransitionMemorialStatus(),
                                 transitionMemorial() — never throws,
                                 and distinguishes first publication from
                                 republication via first_published_at
                                 instead of a "republished" status
                                 (+ tests: exhaustive 25-pair matrix)
  entitlement/                 Entitlement/Offer logic (Mission 006) —
                               pure, no I/O, no Supabase; not wired into
                               any Server Action, adapter, or the Builder
                               yet — the clean boundary a future
                               activation flow is meant to call
    offer-skin.ts                getMemorialTypeForOffer(),
                                 getAllowedSkins(),
                                 isSkinAllowedForOffer() — pure lookups
                                 over config/offers.ts (+ tests)
    activate-entitlement.ts      planEntitlementActivation() — never
                                 throws; rejects a non-`available`
                                 entitlement or a skin outside the
                                 offer's allowedSkins with
                                 { ok: false, reason } instead of an
                                 exception; the skin is always an
                                 explicit parameter, never resolved
                                 internally — this mission does not
                                 decide *when* a skin gets chosen, only
                                 that nothing can inject one the
                                 purchased offer doesn't allow (+ tests)
  adapters/                   Ports application code depends on instead of
                               calling a provider (Supabase, ...) directly
    data-repository.ts        Generic persistence contract
    auth-provider.ts          Generic session contract
    media-storage-provider.ts Generic media URL contract
    draft-repository.ts       Mission 007 — saveDraftContent(memorialId,
                               content): whole-content, last-write-wins;
                               the one piece DataRepository<Memorial>'s
                               own update() explicitly declined to cover
                               (see its comment) — never sees
                               MemorialType/Skin/Offer
    supabase/                 Supabase-backed implementations of the ports
                               above — no other file talks to Supabase
      memorial-repository.ts
      auth-provider.ts
      media-storage-provider.ts
      draft-repository.ts       Relies entirely on memorial_drafts_
                                 update_own's existing RLS — no ownership
                                 check duplicated here, no migration
                                 needed (+ tests, mocked client)
  supabase/                   Lazy Supabase client construction (never
                               throws at import time — see the files)
    env.ts
    server-client.ts          Cookie-aware (@supabase/ssr) client — Server
                               Components/Actions/Route Handlers
    service-role-client.ts    Service-role client — bypasses RLS, server-only
    site-url.ts                 Magic Link redirect target: the incoming
                                 request's own Host header first (proven
                                 correct regardless of platform metadata
                                 propagation), else Netlify's
                                 DEPLOY_PRIME_URL, else
                                 NEXT_PUBLIC_SITE_URL, else localhost
                                 (+ tests)
    session.ts                   getAuthenticatedUser() — raw Supabase Auth
                                 user only, deliberately NOT the same thing
                                 as adapters/auth-provider.ts's
                                 AuthProvider (owner-shaped) (+ tests)
    proxy-session.ts              Session-cookie refresh used by proxy.ts

types/                        Structural TypeScript interfaces
  memorial.ts                 Memorial, MemorialStatus, draft/published shape
  owner.ts / entitlement.ts / media.ts / message.ts

styles/                       Global CSS (no design system yet)
  globals.css

proxy.ts                      Next.js 16 "Proxy" (formerly Middleware) —
                               refreshes the session cookie, scoped to
                               /login, /owner, /auth/* only (config.matcher)

supabase/
  migrations/                 Versioned SQL schema — source of truth, see
                               supabase/README.md
  README.md                   Schema overview, RLS security matrix,
                               portability, local testing, migration workflow

scripts/db/
  test-local.sh                Applies migrations to a throwaway local
                               Postgres and asserts constraints + RLS —
                               no account, no Docker, no network
```

Folders are only created once they hold something real — there is no
"just in case" empty folder tree.

## Architecture rules

These rules come from Mission 000 (architecture audit) and apply to every
future mission, not just this one:

- **Configuration over duplication.** A new memorial type, editorial
  context, skin or language is added as a config value (see `config/`),
  never by branching or copy-pasting code paths.
- **No direct business dependency on Netlify.** Netlify hosts and deploys
  the app; it must never become the place where data, accounts or business
  logic live. Nothing in this codebase should assume a Netlify-only
  feature.
- **No business logic scattered inside Supabase.** When Supabase is wired
  in (a later mission), application code talks to the `lib/adapters/*`
  interfaces — never to a Supabase client directly outside that layer —
  and no business logic lives in Supabase-side functions/triggers.
- **V1 stays light.** Build what the current mission asks for, not what a
  future mission might need — the abstractions above exist so later
  missions can extend without a rewrite, not so this one can pre-build
  them.
- **Pet Memorial is not developed.** `memorialType` is designed to accept
  a future `"pet"` value without restructuring, but no pet-specific type,
  content or behaviour exists in this codebase.
- **One relationship, one pointer.** `memorials.entitlement_id` is the
  only link between an entitlement and its memorial (Mission 002
  correction) — no table stores the same relationship from both ends. See
  `supabase/README.md`.
- **A purchasable "Offer" is configuration, never a database table or a
  sales-channel name.** `config/offers.ts` (Mission 006) determines a
  `memorialType` and a *set* of allowed skins per offer — never a single
  skin baked into the schema, and never named or shaped after Etsy
  specifically (`EntitlementSource` is the only place a channel is
  represented, and it's already extensible). `entitlements.offer_id` is
  the only place a purchase records what was bought; the skin actually
  used lives exclusively on `memorials.skin_id`, validated against
  `OFFERS[offer_id].allowedSkins` in application code
  (`lib/entitlement/`), never in SQL. See `supabase/README.md`.
- **No public message form goes live without anti-abuse protection
  first.** The `messages_insert_public` RLS policy (`supabase/`) makes
  the *shape* of public message submission possible; it is not product
  approval to expose it. A validated spam/anti-abuse protection is a
  precondition for turning that feature on, not an afterthought — see
  `supabase/README.md`.
- **Authentication ≠ product entitlement.** A valid Supabase Auth session
  (`/owner`, Mission 004) proves identity only — it never implies an
  `owners` row, a memorial, or a purchase. Nothing auto-creates an
  `owners` row on login; the mission that builds Entitlement redemption
  decides how/when a session becomes an Owner. See
  `lib/supabase/session.ts`.
- **A terminal state is acceptable when it's intentional.** Mission 005's
  memorial lifecycle does not require every status to have a way back —
  `archived` has no outgoing transition in V1. A future restore needs an
  explicit rule for which state to resume into (a memorial archived
  before ever publishing differs from one archived mid-edit), which
  Mission 005 deliberately did not decide — see
  `lib/memorial/status-transitions.ts`.

## What is NOT built yet

Deliberately out of scope through Mission 007 (see each mission's own
exclusion list for the full wording):

- Anything wiring `lib/memorial/status-transitions.ts` into the Builder,
  a Server Action, or a Supabase adapter — Mission 005 built and tested
  the state machine itself only. No `memorials.status` is ever changed
  by anything in this codebase yet, and no restore/un-archive path
  exists (see the architecture rule above).
- Any real activation flow — Mission 006 built and tested
  `lib/entitlement/` (Offer lookups + `planEntitlementActivation()`)
  only. Nothing calls it: no Server Action creates an `owners` row, an
  `entitlements` row, or a `memorials` row from a purchase. No Etsy
  webhook/API, no PDF, no commercial UI. *When* a skin gets selected for
  a multi-skin offer (at purchase, at activation, or elsewhere) is
  explicitly left open — see `config/offers.ts` and this mission's
  report.
- The progressive "one question at a time" editing experience, or any
  Builder UI/design change — Mission 007 built and tested the autosave
  *foundation* only (`lib/builder/autosave-state.ts`,
  `lib/adapters/draft-repository.ts` + its Supabase implementation).
  Nothing in `components/builder/*` or `app/builder/*` calls either —
  the Builder is still Mission 003's local-demo-only shell. No debounce
  scheduler exists yet (only the `AUTOSAVE_DEBOUNCE_MS` constant a
  future UI-wiring mission is meant to use), and no optimistic
  concurrency control exists (last-write-wins — see
  `supabase/README.md`).

- A real, connected Supabase project (URL/keys) *for the Builder*. The
  schema and adapters exist and are tested locally — see
  `supabase/README.md` — but the Builder itself still edits only local
  demo fixtures; Mission 004's `/login`/`/owner` are already connected
  to a real project independently.
- Any link between an authenticated session and HERITAGE's own `owners`
  business table — see the architecture rule above.
- Etsy integration or webhooks; a working (redeemable) Entitlement flow.
- Real persistence for the Builder *UI*: `/builder` (Mission 003) still
  edits two local demo memorials, in React state, for the current page
  session only — the write path to `memorial_drafts` now exists and is
  tested (Mission 007), but nothing in `/builder` calls it yet. No
  "Save" action or autosave trigger is wired into any component, so
  there is nothing in the UI that could misleadingly claim to have
  persisted anything.
- Real publication logic or real slug/URL generation. The Builder's
  "Prévisualisation" mode is a local preview of demo content, not a
  public memorial page — nothing is written to
  `memorial_published_snapshots`, and no memorial's `status` is ever
  changed by it.
- Photo upload (metadata table and URL-resolving adapter exist; no
  upload path).
- A visitor-facing message form or moderation UI (the schema and its
  authorization rule exist; no form).
- Any skin's actual visual design, HERITAGE colors/typography, or the Hero.
- Admin, analytics, payments.
- Pet Memorial, Heritage Mariage.

## Note on generated files

`AGENTS.md` and `CLAUDE.md` at the repository root are generated
automatically by the Next.js 16 toolchain (`next dev` / `next build`) to
point coding agents at this Next.js version's own docs. They are not
HERITAGE documentation and are safe to leave as-is — Next.js re-adds them
if removed.
