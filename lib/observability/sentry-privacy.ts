import type { ErrorEvent } from "@sentry/nextjs";

/**
 * Sentry 11 collects several data categories by default. HERITAGE opts every
 * content-bearing category out explicitly. Source context lines remain enabled:
 * they are application source code used for symbolication, never family input.
 */
export const sentryPrivacyOptions = {
  maxBreadcrumbs: 0,
  sendClientReports: false,
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    graphQL: { document: false, variables: false },
    genAI: { inputs: false, outputs: false },
    databaseQueryData: false,
    queues: false,
    stackFrameVariables: false,
    frameContextLines: 5,
  },
  beforeSend: sanitizeSentryEvent,
};

/** Defense in depth for data attached by application or framework code. */
export function sanitizeSentryEvent(event: ErrorEvent): ErrorEvent {
  delete event.user;
  delete event.extra;
  delete event.breadcrumbs;
  // A transaction name may be derived from the concrete request URL. Even
  // without its query string, that path can contain a memorial id or a family
  // slug, so HERITAGE does not send it.
  delete event.transaction;

  if (event.request) {
    const method = event.request.method;
    event.request = method ? { method } : undefined;
  }

  return event;
}
