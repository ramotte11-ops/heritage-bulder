import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";
import {
  missingSentryBuildVariables,
  resolveSentryEnvironment,
} from "./lib/observability/sentry-environment";

const missingSentryVariables = missingSentryBuildVariables(process.env.CONTEXT, process.env);
if (missingSentryVariables.length > 0) {
  throw new Error(
    `Sentry configuration is incomplete for Netlify ${process.env.CONTEXT}: missing ${missingSentryVariables.join(
      ", ",
    )}`,
  );
}

const sentryEnvironment = resolveSentryEnvironment({
  netlifyContext: process.env.CONTEXT,
  nodeEnv: process.env.NODE_ENV,
});

const sentryRelease = process.env.SENTRY_RELEASE ?? process.env.COMMIT_REF;

const nextConfig: NextConfig = {
  // Netlify's CONTEXT is a build-time variable. Inject only the resulting
  // non-secret label so browser and server events use the same environment.
  env: {
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: sentryEnvironment,
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  telemetry: false,
  silent: !process.env.CI,
  release: sentryRelease
    ? {
        name: sentryRelease,
        // Commit association is optional and needs a separate SCM integration.
        // Source-map symbolication only needs the stable release/debug IDs.
        setCommits: false,
      }
    : undefined,
  sourcemaps: {
    // Upload during the build, then keep maps out of the public deployment.
    deleteSourcemapsAfterUpload: true,
  },
  buildTimeInstrumentation: false,
  routeManifestInjection: false,
  suppressOnRouterTransitionStartWarning: true,
  reactComponentAnnotation: { enabled: false },
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
    excludeTracing: true,
    excludeReplayIframe: true,
    excludeReplayShadowDom: true,
    excludeReplayWorker: true,
  },
});
