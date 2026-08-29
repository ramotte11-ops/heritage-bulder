# Heritage Hommage

Technical foundation for the HERITAGE HOMMAGE memorial Builder — a single,
configurable engine that will let non-technical clients personalize,
preview and publish an online memorial.

This repository currently contains **Mission 001 (technical foundations)
and Mission 002 (data model & Supabase foundation)**. There is no
Builder, no real authentication, no connected Supabase project, no photo
upload, and no visual design yet — see [What is NOT built](#what-is-not-built-yet)
below.

## Getting started

Requirements: Node.js 20+ and npm.

```bash
# install dependencies
npm install

# run the local dev server (http://localhost:3000)
npm run dev

# type-check, lint
npm run lint

# production build
npm run build
npm run start
```

No environment variables or external service is required to install, run,
or build this project — see `.env.example` for what a future mission will
need once Supabase is actually connected.

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
- **Supabase** (`@supabase/supabase-js`) for PostgreSQL + Auth + Storage —
  schema and adapters exist (see `supabase/` and `lib/supabase/`), but no
  real project is connected yet.

See each mission's final report (delivered in the conversation that
produced the corresponding commits) for the full dependency list and
rationale.

## Repository structure

```
app/                          Next.js App Router — routes only
  layout.tsx                  Root HTML shell, global styles import
  page.tsx                    Home route — renders FoundationStatus

components/                   Presentational UI, grouped by domain
  foundation/
    FoundationStatus.tsx      Technical confirmation page (Mission 001)

config/                       HERITAGE-defined product configuration
  memorial.ts                 memorialType, editorialContext values
  skins.ts                    skin values
  languages.ts                language values
  sections.ts                 section ids + per-context order/socle rules
  entitlements.ts             entitlement source/status values
  media.ts                    media type values
  messages.ts                 visitor message type values

lib/                          Logic that operates on config/types
  sections.ts                 getOrderedSections() helper
  adapters/                   Ports application code depends on instead of
                               calling a provider (Supabase, ...) directly
    data-repository.ts        Generic persistence contract
    auth-provider.ts          Generic session contract
    media-storage-provider.ts Generic media URL contract
    supabase/                 Supabase-backed implementations of the ports
                               above — no other file talks to Supabase
      memorial-repository.ts
      auth-provider.ts
      media-storage-provider.ts
  supabase/                   Lazy Supabase client construction (never
                               throws at import time — see the files)
    env.ts
    server-client.ts          Anon-key client (RLS applies)
    service-role-client.ts    Service-role client — bypasses RLS, server-only

types/                        Structural TypeScript interfaces
  memorial.ts                 Memorial, MemorialStatus, draft/published shape
  owner.ts / entitlement.ts / media.ts / message.ts

styles/                       Global CSS (no design system yet)
  globals.css

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

## What is NOT built yet

Deliberately out of scope through Mission 002 (see each mission's own
exclusion list for the full wording):

- A real, connected Supabase project (URL/keys). The schema and adapters
  exist and are tested locally — see `supabase/README.md` — but nothing
  points at an actual project yet.
- Real authentication / a magic-link login screen (the port and its
  Supabase implementation exist; no UI calls it).
- Etsy integration or webhooks; a working (redeemable) Entitlement flow.
- A functional Builder (editing UI), autosave, or live preview.
- Real publication logic or real slug/URL generation.
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
