# Sentry Error Monitoring V1

## Architecture

HERITAGE uses the official `@sentry/nextjs` SDK in all three Next.js runtimes:

- `instrumentation-client.ts` initializes browser error monitoring;
- `instrumentation.ts` loads the Node.js or Edge configuration and exports
  `captureRequestError` for unhandled server request errors;
- `app/global-error.tsx` reports React render failures caught by the App Router;
- `withSentryConfig` uploads source maps during `next build`, binds them to the
  deploy release, then deletes the generated maps from `.next` before deploy.

This V1 intentionally has no tracing, Session Replay, profiling, Sentry Logs,
user feedback widget, route manifest injection or React component annotations.

The existing Sentry tenant is in the EU region. Its organization and Next.js
project slugs are both `heritage-hommage`. The project already has prevention
of IP-address storage enabled.

## Netlify variables

Set values in Netlify's environment-variable UI; never commit them. Variable
changes require a fresh deploy.

Remote audit on 2026-10-07: the Netlify project is `hommages` and none of the
Sentry variables below is configured yet.

Production and Deploy Preview builds fail closed when any required Sentry build
variable is absent. This prevents a green deploy whose errors cannot be
symbolicated. Local builds remain possible without external credentials.

| Variable | Secret | Netlify scopes | Contexts |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SENTRY_DSN` | no (public ingestion DSN) | Builds | Production + Deploy Previews |
| `SENTRY_DSN` | no, but server-only | Builds + Functions | Production + Deploy Previews |
| `SENTRY_AUTH_TOKEN` | **yes** | Builds only | Production + Deploy Previews |
| `SENTRY_ORG` | no | Builds | Production + Deploy Previews |
| `SENTRY_PROJECT` | no | Builds | Production + Deploy Previews |
| `SENTRY_TEST_TOKEN` | **yes** | Functions | Deploy Preview used for verification only |

Give `SENTRY_AUTH_TOKEN` only the Sentry permissions required to create/finalize
releases and upload source maps. Do not prefix it with `NEXT_PUBLIC_`.

Netlify supplies `CONTEXT` and `COMMIT_REF`. The build maps contexts to stable
Sentry environments without exposing branch names:

| Netlify context | Sentry environment |
| --- | --- |
| `production` | `production` |
| `deploy-preview` | `preview` |
| `branch-deploy` | `branch` |
| local Netlify dev | `development` |

`COMMIT_REF` is used as the release name so an event and its uploaded source
maps agree on the deployed code.

## Privacy boundary

The shared configuration explicitly disables collection of user identity,
cookies, HTTP headers, request/response bodies, URL query parameters, GraphQL
documents/variables, AI inputs/outputs, database values, queue arguments, local
stack variables, breadcrumbs and client outcome reports. A final `beforeSend`
processor removes user data, extras, breadcrumbs, headers, cookies, bodies,
query strings and fragments even if framework or application code attaches
them later.

Five source-code context lines remain enabled because they contain repository
code, not family content, and make stack traces actionable. Error messages and
stack traces remain necessary for Error Monitoring: application code must never
interpolate names, family text, photo URLs, credentials or tokens into errors.

The Sentry project setting preventing IP-address storage is already enabled.
Enabling Replay, PII collection, profiling, tracing or content-bearing
breadcrumbs needs a separate Product decision.

## Controlled verification (Deploy Preview first)

1. Use the existing EU Sentry project `heritage-hommage` and set the variables
   above on the Netlify project `hommages`.
2. Generate a long random `SENTRY_TEST_TOKEN` and scope it only to the Deploy
   Preview used for the check.
3. Deploy the preview and confirm the build log reports a successful Sentry
   source-map upload. A missing/failing upload must fail the build.
4. Trigger exactly one event without a request body:

   ```bash
   curl -X POST \
     -H "x-heritage-sentry-test-token: <SENTRY_TEST_TOKEN>" \
     https://<deploy-preview-host>/api/monitoring/sentry-test
   ```

   A successful handoff returns HTTP `202` with an `eventId` and
   `"delivered": true`. Missing/wrong configuration or token returns `404`.
5. Open that exact event in Sentry and verify:
   - title `HeritageSentryVerificationError`;
   - environment `preview`;
   - release equals the Netlify `COMMIT_REF`;
   - the top in-app frame resolves to
     `app/api/monitoring/sentry-test/route.ts` with readable source and line;
   - no user, cookies, headers, body, query string, breadcrumbs, local variables
     or family content appears.
6. Remove or rotate `SENTRY_TEST_TOKEN`. The route then returns `404` and cannot
   emit test events.
7. Repeat once after the gated production deploy, using a production-scoped test
   token only for the duration of the check; verify environment `production`.

The unit tests prove the gate and privacy processor locally. Only the deployed
check above proves Sentry ingestion and remote source-map symbolication.
