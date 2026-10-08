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

  it.each([
    "https://heritage.test/builder/018f47ec-62cf-7bd1-a7da-4f0dd04cc021",
    "https://heritage.test/memorial/jean-dupont-a1b2c3",
    "/builder/identifiant-prive?name=Prive#photo",
    "not a valid URL / Nom Familial ?token=secret",
    "https://heritage.test/m%C3%A9morial/%C3%89lise-Durand",
  ])("removes every URL form while retaining only the HTTP method: %s", (url) => {
    const event: ErrorEvent = {
      type: undefined,
      user: { email: "family@example.test", name: "Nom familial" },
      extra: { tribute: "Texte familial privé" },
      breadcrumbs: [{ message: "Nom et souvenir" }],
      transaction: url,
      request: {
        method: "POST",
        url,
        headers: { authorization: "secret" },
        cookies: { session: "secret" },
        data: "Texte familial privé",
      },
    };

    expect(sanitizeSentryEvent(event)).toEqual({
      type: undefined,
      request: {
        method: "POST",
      },
    });
  });

  it("drops an otherwise empty request and preserves non-URL diagnostic data", () => {
    const event: ErrorEvent = {
      type: undefined,
      event_id: "technical-event-id",
      environment: "preview",
      release: "commit-ref",
      exception: { values: [{ type: "Error", value: "technical failure" }] },
      transaction: "/builder/family-name",
      request: { url: "/builder/family-name?private=yes" },
    };

    expect(sanitizeSentryEvent(event)).toEqual({
      type: undefined,
      event_id: "technical-event-id",
      environment: "preview",
      release: "commit-ref",
      exception: { values: [{ type: "Error", value: "technical failure" }] },
    });
  });
});
