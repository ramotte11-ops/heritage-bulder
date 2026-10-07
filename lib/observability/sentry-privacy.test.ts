import { describe, expect, it } from "vitest";
import type { ErrorEvent } from "@sentry/nextjs";
import { sanitizeSentryEvent, sentryPrivacyOptions } from "./sentry-privacy";

describe("Sentry privacy boundary", () => {
  it("opts every content-bearing SDK category out", () => {
    expect(sentryPrivacyOptions).toMatchObject({
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
      },
    });
  });

  it("removes user content, request metadata, breadcrumbs and query values", () => {
    const event: ErrorEvent = {
      type: undefined,
      user: { email: "family@example.test", name: "Nom familial" },
      extra: { tribute: "Texte familial privé" },
      breadcrumbs: [{ message: "Nom et souvenir" }],
      request: {
        method: "POST",
        url: "https://heritage.test/builder/memorial-1?name=Prive#photo",
        headers: { authorization: "secret" },
        cookies: { session: "secret" },
        data: "Texte familial privé",
      },
    };

    expect(sanitizeSentryEvent(event)).toEqual({
      type: undefined,
      request: {
        method: "POST",
        url: "https://heritage.test/builder/memorial-1",
      },
    });
  });
});
