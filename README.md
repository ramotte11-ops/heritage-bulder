# Heritage Hommage

Technical foundation for the HERITAGE HOMMAGE memorial Builder — a single,
configurable engine that will let non-technical clients personalize,
preview and publish an online memorial.

This repository currently contains **Mission 001: technical foundations
only**. There is no Builder, no authentication, no database, no photo
storage, and no visual design yet — see [What is NOT built](#what-is-not-built-yet)
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
or build this project.

## Stack

- **Next.js 16** (App Router) + **React 19**, in **TypeScript** (`strict`
  mode).
- **ESLint** (`eslint-config-next`) for linting.
- **Native CSS** (CSS Modules) — no UI framework (no Tailwind, no
  component library). One was not justified for this mission's scope.
- **Netlify** for hosting/deployment (already connected to this repository).
  `netlify.toml` only declares the build command and Node version — no
  Netlify-specific runtime feature is used.

No other dependency was added. See [Mission 001's final report] (delivered
separately in the conversation that produced this commit) for the full
list and rationale.

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

lib/                          Logic that operates on config/types
  sections.ts                 getOrderedSections() helper
  adapters/                   Ports application code depends on instead of
                               calling a provider (Supabase, ...) directly
    data-repository.ts        Generic persistence contract
    auth-provider.ts          Generic session contract
    media-storage-provider.ts Generic media URL contract

types/                        Structural TypeScript interfaces
  memorial.ts                 Memorial, MemorialStatus, draft/published shape

styles/                       Global CSS (no design system yet)
  globals.css
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

Deliberately out of scope for Mission 001 (see the mission's own
exclusion list for the full wording):

- Supabase connected to a real project, database tables, or any external
  service configuration.
- Authentication / magic link / login.
- Etsy integration or webhooks.
- A working Entitlement (purchase right).
- A functional Builder (editing UI), autosave, or live preview.
- Real publication logic or real URL generation.
- Photo storage/upload.
- Visitor messages, testimonials, condolences.
- Any skin's actual visual design, HERITAGE colors/typography, or the Hero.
- Admin, analytics, payments.
- Pet Memorial, Heritage Mariage.

## Note on generated files

`AGENTS.md` and `CLAUDE.md` at the repository root are generated
automatically by the Next.js 16 toolchain (`next dev` / `next build`) to
point coding agents at this Next.js version's own docs. They are not
HERITAGE documentation and are safe to leave as-is — Next.js re-adds them
if removed.
