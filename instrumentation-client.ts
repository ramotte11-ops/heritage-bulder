import * as Sentry from "@sentry/nextjs";
import { sentryPrivacyOptions } from "@/lib/observability/sentry-privacy";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
  // Error Monitoring only: no traces, Replay, profiling or Sentry Logs.
  sampleRate: 1,
  ...sentryPrivacyOptions,
});
