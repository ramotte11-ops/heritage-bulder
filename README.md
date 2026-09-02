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
activation flow yet), Mission 007 (autosave foundation — a real
draft-content write path and a pure save-status state machine, neither
wired into the Builder yet), Mission 008 (draft persistence — the
matching read path, completing a symmetric read+write contract for a
memorial's draft content, still not wired into the Builder), and
Mission 009 (Builder session resumption — orchestrates the existing
memorial/draft repositories into one testable "can this session resume
this project" answer, given an explicit `memorialId`; still not wired
into the Builder), Mission 009B (autosave runtime — the real
debounce/concurrency controller connecting Mission 007's state machine
to an injected persistence callback, genuinely wired into
`BuilderShell.tsx` via an optional `persist` prop — real edits in
`/builder` reach it today, though nothing yet supplies a real `persist`
since the visible Builder has no legitimate `memorialId`), and
Mission 010 (loss protection — a native `beforeunload` guard and an
explicit/online-triggered retry, both built on Mission 009B's autosave
state with no second "dirty" tracker of their own)**. There is no
connected Supabase project for the Builder itself yet, no real Builder
persistence, no photo upload, and no final visual design —
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
    BuilderShell.tsx           Top-level: header, mode switch, layout.
                                 Accepts an optional `persist` prop
                                 (Mission 009B) wired straight into
                                 lib/builder/use-autosave.ts, observing
                                 its own state.content — the demo screen
                                 (app/builder/[demoId]) never passes one,
                                 so it stays exactly as before. Mission
                                 010's beforeunload/retry protection comes
                                 for free through that same hook call —
                                 no change to this file was needed
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
                               pure functions, no React import (one
                               deliberate exception: use-autosave.ts,
                               Mission 009B's thin React binding); this is
                               the boundary a future mission connects to
                               DataRepository<Memorial>/memorial_drafts
    builder-state.ts            State shape + pure transitions (+ tests)
    demo-content.ts              Mission-003-only generic content shape
    demo-memorials.ts            Local fixtures, never touch Supabase
    section-labels.ts            Builder UI text only, not product i18n
    autosave-state.ts            Mission 007 — pure save-status state
                                 machine (idle/pending/saving/saved/
                                 error) + AUTOSAVE_DEBOUNCE_MS; knows
                                 nothing about MemorialType/Skin/Offer.
                                 Mission 010: hasUnsavedChanges(state) —
                                 true for pending/saving/error, false for
                                 idle/saved; the one reusable boundary
                                 both the beforeunload guard
                                 (use-autosave.ts) and a future in-app
                                 Builder navigation guard (not built —
                                 none currently exists to protect) would
                                 call, rather than each tracking "dirty"
                                 separately (+ tests)
    resume-session.ts            Mission 009 — resumeBuilderSession(deps,
                                 memorialId): orchestrates
                                 DataRepository<Memorial>.findById +
                                 DraftRepository.getDraftContent into one
                                 resumable/notFoundOrForbidden/
                                 draftAnomaly/error answer. Only
                                 `memorialId` is accepted — never an
                                 ownerId, never a "first memorial"
                                 fallback (its dependency Picks expose no
                                 listing method to fall back to); RLS
                                 alone decides authorization, never
                                 re-implemented here. Not wired into any
                                 component/Server Action yet (+ tests)
    autosave-controller.ts       Mission 009B — createAutosaveController():
                                 the runtime missing between Mission 007's
                                 pure state machine and a real save. Real
                                 setTimeout debounce (AUTOSAVE_DEBOUNCE_MS,
                                 reused, never redefined); reuses
                                 markContentChanged/startSaving/
                                 saveSucceeded/saveFailed as-is — never
                                 reimplements the state machine. Tracks an
                                 explicit generation counter so a save that
                                 finishes after a newer edit can never mark
                                 that newer content "saved"; a debounce
                                 that fires while a save is already running
                                 is retried the moment that save clears,
                                 never stacked behind a second full
                                 debounce wait. `persist` is an injected
                                 plain function — this file never imports
                                 Supabase, never sees a memorialId. Also
                                 exposes `retry()` (Mission 010) — re-enters
                                 the same `attemptSave()` a debounce timer
                                 calls, so every generation/in-flight guard
                                 applies identically; a no-op outside
                                 `error` (+ exhaustive tests with fake
                                 timers)
    autosave-integration.test.ts  Mission 009B — wires builder-state.ts's
                                 real transitions into the controller with
                                 a fake persist, proving the same shape of
                                 wiring BuilderShell.tsx actually does,
                                 without DOM rendering (this codebase has
                                 none — Vitest runs in the "node"
                                 environment) — including the exact
                                 mount-skip / real-edit / no-persist
                                 sequences use-autosave.ts and
                                 BuilderShell.tsx implement
    use-autosave.ts               Mission 009B/010 — useAutosave({ content,
                                 persist }): the thin React binding
                                 (useSyncExternalStore + setPersist called
                                 from an effect, never a ref touched
                                 during render). Observes
                                 BuilderState.content directly — no
                                 second, parallel content state. `persist`
                                 optional: absent -> no controller is even
                                 created, fully inert, no beforeunload
                                 guard ever armed. Skips notifying for the
                                 value present at mount (never "autosaves"
                                 what was just loaded). Mission 010: a
                                 native `beforeunload` listener, armed only
                                 while hasUnsavedChanges(state) is true and
                                 removed the moment it isn't (never
                                 permanent) — no custom warning text, the
                                 browser's own native prompt is used as-is;
                                 an `online`-triggered best-effort
                                 `retry()`; `retry` also returned directly
                                 for a future explicit affordance. Wired
                                 into BuilderShell.tsx (below) — no
                                 dedicated test file for this hook itself,
                                 consistent with this codebase's existing
                                 convention of testing logic, never
                                 rendering; its logical sequences are
                                 exercised in autosave-integration.test.ts
                                 and loss-protection.test.ts instead
    loss-protection.test.ts       Mission 010 — the required Test A–J
                                 scenarios (brief section 15), each
                                 traceable one to one, proving
                                 hasUnsavedChanges(controller.getState())
                                 — exactly the boundary use-autosave.ts's
                                 beforeunload guard reads — never
                                 misfires: pending/saving/error all true,
                                 idle/saved false, a stale save's success
                                 never clears protection for a newer
                                 unsaved version, slow-network sequencing
                                 with controllable promises, demo (no
                                 persist) mode never at risk
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
    draft-repository.ts       Mission 007/008 — getDraftContent(memorialId)
                               + saveDraftContent(memorialId, content):
                               the one piece DataRepository<Memorial>'s
                               own update() explicitly declined to cover
                               (see its comment) — never sees
                               MemorialType/Skin/Offer. Read returns
                               `null` for "not found or not yours"
                               (deliberately indistinguishable); write
                               stays whole-content, last-write-wins,
                               and rejects instead of silently no-op'ing
    supabase/                 Supabase-backed implementations of the ports
                               above — no other file talks to Supabase
      memorial-repository.ts
      auth-provider.ts
      media-storage-provider.ts
      draft-repository.ts       Relies entirely on memorial_drafts_
                                 select_own/update_own's existing RLS —
                                 no ownership check duplicated here, no
                                 migration needed (+ tests, mocked client)
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
- **One boundary decides "is there a loss risk", never a second "dirty"
  tracker.** Mission 010's `beforeunload` guard and any future in-app
  navigation guard both call `hasUnsavedChanges(state)`
  (`lib/builder/autosave-state.ts`), derived entirely from the same
  `AutosaveState` Mission 007/009B already produce — never a separate
  boolean kept in sync by hand. A stale save's success is guaranteed
  (by the same generation mechanism Mission 009B built) to never clear
  this for a newer, still-unsaved version.

## The three application roles (Mission 014)

Distinct from the PostgreSQL roles (`PUBLIC`, `anon`, `authenticated`,
`service_role`) settled in Missions 013B/013C — see `supabase/README.md`.
Those decide what a database connection may touch. These decide who the
*person* is and what the *application* will let them reach.

| | Visitor | Authenticated | Owner |
| --- | --- | --- | --- |
| Valid Supabase Auth session | no | yes | yes |
| HERITAGE `owners` row | no | no | yes |
| Owner capability | none | none | only their own memorials |
| Commercial capability | none | none | only rights they redeemed |

Resolved by `resolveHeritageActor()` (`lib/auth/heritage-actor.ts`), from
the server-established session alone — `getAuthenticatedUser()` validates
the token against the Auth server, never trusting the cookie's contents.
No request body, query parameter or header participates.

Two structural guarantees, both enforced by the *type* of the dependency
rather than by discipline:

- the owner lookup is `Pick<OwnerRepository, "findByAuthUserId">`, so
  loading a page can never create an Owner row (creation belongs to
  redemption alone, Mission 011B) and an actor can never be resolved from
  a matching email;
- `authorizeMemorialAccess()` (`lib/auth/memorial-access.ts`) takes the
  **actor**, never an owner id, so a caller cannot pass one that arrived
  in a payload. `memorialId` may come from a URL — it is a claim, and
  this function is what turns it into a verified fact.

"Authenticated but no Owner" is an ordinary state, not an error: nothing
is created, nothing throws, and the actor simply has no owner capability
yet.

Since Mission 013C the client roles hold no privilege on these tables, so
the RLS policies are inert and the application performs the ownership
read itself, server-side, through `service_role` — one column
(`memorials.owner_id`), compared against the session-resolved owner. The
policies are untouched and become a real second layer the day a mission
wires an owner-facing screen and grants the read it needs.

### HERITAGE Admin

A single boolean — `isHeritageAdmin()` (`lib/auth/heritage-admin.ts`) —
read from Supabase Auth's `app_metadata.heritage_role === "admin"`.

`app_metadata` is the only place that satisfies every constraint at once:
it is **not writable by the user** (`supabase.auth.updateUser()` can only
write `user_metadata`; writing `app_metadata` needs the Admin API or the
dashboard), it is verified rather than asserted (read from
`auth.getUser()`), it names no email in code, and it needs no migration
and no secret. `user_metadata` is deliberately unreachable from that
function — a role found there is a claim by the very person being
checked, and a test asserts it counts for nothing.

**Granting it is an out-of-band operation**, on purpose: a HERITAGE
operator sets it on the user in the Supabase dashboard (Authentication →
the user → *App Metadata*), or via the Admin API with the service-role
key. Nothing in this repository grants, revokes or lists admins, and the
flag can be withdrawn without a deployment.

**Staff are not super-owners.** `authorizeMemorialAccess()` does not read
`isHeritageAdmin` at all: being staff never opens a family's memorial. If
a later mission needs staff access to one, it must build that as its own
audited path. That is why "admin" is a separate axis on the actor rather
than a third value of the same enum — an ordered enum invites "admin is
the biggest one", which is exactly the bypass to prevent.

Mission 014 built the primitive and nothing else: no Admin portal, no
admin route, no permission list, no team/agency roles.

## What is NOT built yet

Deliberately out of scope through Mission 013 (see each mission's own
exclusion list for the full wording):

- Anything wiring `lib/memorial/status-transitions.ts` into the Builder,
  a Server Action, or a Supabase adapter — Mission 005 built and tested
  the state machine itself only. No `memorials.status` is ever changed
  by anything in this codebase yet, and no restore/un-archive path
  exists (see the architecture rule above).
- **Any way to present an activation key.** Mission 013 built the key
  itself (`lib/entitlement/activation-key.ts` — 160-bit CSPRNG, Crockford
  base32, `HH1-` prefixed), issuing (`issue-entitlement.ts`), replacement
  and invalidation (`activation-key-lifecycle.ts`), and the bridge from a
  raw key to a redemption (`redeem-with-activation-key.ts`). **Nothing
  calls any of it**: no activation page, no form, no route, no Server
  Action, and no rate limiter — the surface that accepts a key from a
  human must be able to throttle it, and that belongs to a later mission.
  No Etsy, no webhook, no PDF, no QR.
- **Support/Admin tooling for keys.** Replacement and invalidation exist
  as server primitives only. Mission 014 added the way to RECOGNISE a
  HERITAGE Admin (see above) and nothing an Admin can do: there is no
  Admin UI, no admin route, no
  persistent history of rotations — replacing a key overwrites the stored
  hash, so a superseded key leaves no trace. The audit trail is Mission
  015's, as an additive events table.
- **Any way to reach redemption from a browser.** Mission 011B built the
  server-side engine — `redeemAuthenticatedEntitlement()`
  (`lib/entitlement/`) resolves an authenticated session to a HERITAGE
  owner, reads the entitlement, derives type and skin from the Offer,
  and calls Mission 011A's `redeem_entitlement()` RPC — but **nothing
  calls it**. There is deliberately no route, Server Action, form or
  activation page: knowing a raw entitlement UUID must never be enough
  to obtain a memorial. The mechanism that resolves an authorized
  key/proof to an entitlement id is a separate, later mission, and
  `redeemAuthenticatedEntitlement()`'s signature is what it will hand
  its result to. No Etsy webhook/API, no activation key format or
  generator, no PDF, no commercial UI.
- Linking an authenticated user to a **pre-existing** owner row. Mission
  011B creates an owner on a first genuine redemption, but never
  attaches a session to an owner that already exists — a matching email
  is not proof of identity. Those cases come back as
  `ownerLinkConflict` / `ownerIdentityConflict`; a safe out-of-band
  (support/admin) resolution is a future mission.
- Choosing a skin for a multi-skin offer. Every V1 offer grants exactly
  one skin, which is resolved automatically. A future offer granting
  several, called with no selection, is answered with
  `skinSelectionRequired` — never a silent `allowedSkins[0]`. The UI
  that would make that choice is not built.
- A real `memorials.slug`. Mission 011A made the column nullable
  precisely so redemption would not have to invent one; generating the
  actual public URL (which needs the deceased's name) belongs to the
  publication flow. Likewise `editorial_context` and `language` stay
  NULL until the family chooses them in the Builder — no UI exists for
  either choice yet.
- The progressive "one question at a time" editing experience, or any
  Builder UI/design change — Mission 007 built the autosave *state
  machine* (`lib/builder/autosave-state.ts`) and Mission 009B built the
  *runtime* that actually debounces and calls it
  (`lib/builder/autosave-controller.ts` + `use-autosave.ts`), genuinely
  wired into `BuilderShell.tsx` via an optional `persist` prop that
  observes its own `state.content` — real edits in `/builder` do reach
  the autosave runtime today. What's still not built is everything
  visual: no optimistic concurrency control (last-write-wins — see
  `supabase/README.md`), no visible saving/saved indicator (UX work, not
  built here), and no real *persistence* — see the next point.
- Any real "resume your project" UX — Mission 009 built and tested
  `lib/builder/resume-session.ts` (`resumeBuilderSession()`), the
  orchestration layer that decides whether a given `memorialId` is
  resumable, not-found-or-forbidden, has an anomalous draft, or hit a
  repository error. Nothing calls it: no Server Action, no route, no
  Builder wiring, no "resume where you left off" screen exists yet. No
  mechanism for a caller to discover *which* `memorialId` to resume
  (an owner-projects list, a URL, ...) exists either — this mission
  deliberately takes `memorialId` as a given, explicit input, never
  derived from "the owner's first memorial."
- Real autosave *persistence* from the visible Builder — Mission 009B's
  runtime (`createAutosaveController`/`useAutosave`) is complete and
  fully tested against a fake `persist` callback, but nothing calls
  `DraftRepository.saveDraftContent` from it: the demo Builder
  (`app/builder/[demoId]`) has no legitimate `memorialId` — its fixtures
  (`lib/builder/demo-memorials.ts`) are deliberately not UUID-shaped and
  were never meant to be written to a real Supabase row. Wiring this in
  for real needs a route/session that already has a real, authorized
  `memorialId` (e.g. Mission 009's `resumeBuilderSession`, itself not yet
  wired into a route) — building that route is not this mission's job
  either.
- Any real in-app Builder navigation, or a guard for it — Mission 010
  found none exists today (`grep` for `Link`/`useRouter`/`redirect` in
  `components/builder/*` and `app/builder/**` returns nothing): the
  Builder has no internal navigation that could lose in-memory state. No
  navigation was invented to have something to protect;
  `hasUnsavedChanges()` (`lib/builder/autosave-state.ts`) is the ready,
  reusable boundary a future one would call — see the architecture rule
  above and this mission's report.
- Any visible loss-protection UI (a "you have unsaved changes" banner,
  a retry button, an offline indicator) — Mission 010 built the
  `beforeunload` guard and `retry()`/online-retry mechanics only;
  `useAutosave`'s returned `retry` function exists for a future
  affordance to call, but nothing renders one. The browser's own native
  `beforeunload` dialog is the only user-visible effect of this mission.

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
