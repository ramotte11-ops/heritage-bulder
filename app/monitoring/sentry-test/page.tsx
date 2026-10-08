import { notFound } from "next/navigation";
import { SentryTestProbe } from "./sentry-test-probe";

export default function SentryTestPage() {
  if (!process.env.SENTRY_DSN || !process.env.SENTRY_TEST_TOKEN) {
    notFound();
  }

  return <SentryTestProbe />;
}
