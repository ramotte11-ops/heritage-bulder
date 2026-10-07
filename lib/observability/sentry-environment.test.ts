import { describe, expect, it } from "vitest";
import { missingSentryBuildVariables, resolveSentryEnvironment } from "./sentry-environment";

describe("resolveSentryEnvironment", () => {
  it.each([
    ["production", "production"],
    ["deploy-preview", "preview"],
    ["branch-deploy", "branch"],
    ["dev", "development"],
  ] as const)("maps Netlify %s to %s", (netlifyContext, expected) => {
    expect(resolveSentryEnvironment({ netlifyContext, nodeEnv: "production" })).toBe(expected);
  });

  it("does not mistake a local production build for a real production deploy", () => {
    expect(resolveSentryEnvironment({ nodeEnv: "production" })).toBe("development");
  });

  it("keeps test events separate", () => {
    expect(resolveSentryEnvironment({ nodeEnv: "test" })).toBe("test");
  });
});

describe("missingSentryBuildVariables", () => {
  const complete = {
    NEXT_PUBLIC_SENTRY_DSN: "public-dsn",
    SENTRY_DSN: "server-dsn",
    SENTRY_AUTH_TOKEN: "build-token",
    SENTRY_ORG: "org",
    SENTRY_PROJECT: "project",
  };

  it.each(["production", "deploy-preview"])("requires a complete %s build", (context) => {
    expect(missingSentryBuildVariables(context, { ...complete, SENTRY_AUTH_TOKEN: "" })).toEqual([
      "SENTRY_AUTH_TOKEN",
    ]);
    expect(missingSentryBuildVariables(context, complete)).toEqual([]);
  });

  it("does not require external secrets for local builds", () => {
    expect(missingSentryBuildVariables(undefined, {})).toEqual([]);
    expect(missingSentryBuildVariables("dev", {})).toEqual([]);
  });
});
