import * as Sentry from "@sentry/nextjs";
import { sentryPrivacyOptions } from "@/lib/observability/sentry-privacy";

const dsn = process.env.SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
  sampleRate: 1,
  ...sentryPrivacyOptions,
});
